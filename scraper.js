#!/usr/bin/env node

const fetch = require('node-fetch');
const fs = require('fs').promises;
const { JSDOM } = require('jsdom');
const Bottleneck = require('bottleneck');
const maps = require("@googlemaps/google-maps-services-js");

const zooplaSearchURL = '***REMOVED***';
const millisIn30Mins = 30 * 60 * 1000;
const MAPS_API_KEY = '***REMOVED***';

const mapsClient = new maps.Client();

async function getMapPage() {
  const cachedMapPageName = './data/map.html';
  // Should fetch if file is older than 30 minutes or doesn't exist
  const shouldFetch = await fs.stat(cachedMapPageName)
    .then(stat => (new Date() - stat.mtime) > millisIn30Mins)
    .catch(err => true);
  if (shouldFetch) {
    console.info('Fetching map page');
    const response = await fetch(zooplaSearchURL);
    const pageText = await response.text();
    await fs.writeFile(cachedMapPageName, pageText);
    return pageText;
  } else {
    console.info('Using cached map page');
    return fs.readFile(cachedMapPageName, { encoding: 'utf8' });
  }
}

async function getListings() {
  const cachedListingsName = './data/listings.json';
  // Should fetch if file is older than 30 minutes or doesn't exist
  const shouldParse = await fs.stat(cachedListingsName)
    .then(stat => (new Date() - stat.mtime) > millisIn30Mins)
    .catch(err => true);
  if (shouldParse) {
    console.info('Parsing map page for listings');
    const dom = new JSDOM(await getMapPage());
    const scriptElems = Array.from(dom.window.document.querySelectorAll('script'));
    const dataScript =
      scriptElems
      .map(s => s.text)
      .find(s => s.includes('listing_id') && s.includes('var data'));
    const listingArrayRegex = /var data = \{[\s]+(.+\n)+\s+listings: (?<listings>\[.+\])/;
    const listingArray = JSON.parse(dataScript.match(listingArrayRegex).groups.listings);

    await fs.writeFile(cachedListingsName, JSON.stringify(listingArray));
    return listingArray;
  } else {
    console.info('Using cached listings');
    const listingsJson = await fs.readFile(cachedListingsName, { encoding: 'utf8' });
    return JSON.parse(listingsJson);
  }
}

async function fetchListingDetailsPage(listingID) {
  await fs.mkdir('./data/details/', { recursive: true });
  const cachedListingDetailsName = `./data/details/${listingID}.html`;
  const shouldFetch = await fs.stat(cachedListingDetailsName)
    .then(stat => false)
    .catch(err => true);
  if (shouldFetch) {
    console.info('Fetching property details page for ', listingID);
    const listingUrl = `https://www.zoopla.co.uk/to-rent/details/${listingID}`;
    const response = await fetch(listingUrl);
    if (!response.ok) {
      throw new Error(`Error retrieving response for ${listingID}. Status code ${response.status}, response: ${await response.text()}`);
    }
    const responseText = await response.text();
    await fs.writeFile(cachedListingDetailsName, responseText);
    return responseText;
  } else {
    return fs.readFile(cachedListingDetailsName, { encoding: 'utf8' });
  }
}

async function getListingDetailsJson(listingID) {
  await fs.mkdir('./data/details-json/', { recursive: true });
  const cachedListingJsonName = `./data/details-json/${listingID}.json`;
  const shouldParse = await fs.stat(cachedListingJsonName)
    .then(stat => false)
    .catch(err => true);
  if (shouldParse) {
    console.info('Parsing property details page for', listingID);
    const listingPageText = await fetchListingDetailsPage(listingID);
    const dom = new JSDOM(listingPageText);
    const dataElems = Array.from(dom.window.document.querySelectorAll('script[type="application/ld+json"]'))
      .map(elem => JSON.parse(elem.text)['@graph']);
    const listingDetails =
      dataElems.filter(g => g !== undefined)
        .flat()
        .find(entry => entry['@type'] === "Residence");
    await fs.writeFile(cachedListingJsonName, JSON.stringify(listingDetails));
    return listingDetails;
  } else {
    const listingDetailsJson = await fs.readFile(cachedListingJsonName, { encoding: 'utf8' });
    return JSON.parse(listingDetailsJson);
  }
}

async function getDirectionsToWork(latitude, longitude) {
  return (await mapsClient.distancematrix({ params: {
    origins: [`${latitude},${longitude}`],
    destinations: ['***REMOVED***'],
    key: MAPS_API_KEY,
    arrival_time: (new Date(2020, 2, 23, 9)).getTime(),
    mode: 'transit',
    units: 'metric'
  }})).data;
}

async function getAugmentedListings() {
  console.info('Retrieving augmented listings');
  const listings = await getListings();
  const limiter = new Bottleneck({
    minTime: 2000
  });
  const limitedGetAugmentedListing = limiter.wrap(getListingDetailsJson);
  return Promise.all(
    listings.map(listing => limitedGetAugmentedListing(listing.listing_id)));
}

async function main() {
  // Ensure the data directory exists
  await fs.mkdir('./data', { recursive: true });
  return getAugmentedListings();
}

main()
  .then(result => {
    console.log(JSON.stringify(result));
    // process.exit(0);
   })
  .catch(err => {
    console.error('Error running main:', err);
    // process.exit(1);
  });
