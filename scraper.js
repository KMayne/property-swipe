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

const limiter = new Bottleneck({
  minTime: 2000
});
const rateLimitedFetch = limiter.wrap(fetch);

async function cached(func, cacheFileName, maxAgeHours) {
  const maxAgeMillis = maxAgeHours * 60 * 60 * 1000;
  const fileNeedsUpdate = await fs.stat(cacheFileName)
    // Check if last modified within max age
    .then(stat => (new Date() - stat.mtime) > maxAgeMillis)
    // Non-existent file needs update
    .catch(err => true);
  if (fileNeedsUpdate) {
    const funcResult = await func();
    await fs.writeFile(cacheFileName, JSON.stringify(funcResult));
    return funcResult;
  } else {
    const fileText = await fs.readFile(cacheFileName, { encoding: 'utf8' });
    console.log('Parsing file', cacheFileName)
    return JSON.parse(fileText);
  }
}

async function getMapPage() {
  return cached(async () => {
    console.info('Fetching map page');
    const response = await rateLimitedFetch(zooplaSearchURL);
    return response.text();
  }, './data/map.html', 0.5);
}

async function getListings() {
  return cached(async () => {
    console.info('Parsing map page for listings');
    const dom = new JSDOM(await getMapPage());
    const scriptElems = Array.from(dom.window.document.querySelectorAll('script'));
    const dataScript =
      scriptElems
      .map(s => s.text)
      .find(s => s.includes('listing_id') && s.includes('var data'));
    if (!dataScript) {
      throw new Error('Could not find script containing listing data');
    }
    const listingArrayRegex = /var data = \{[\s]+(.+\n)+\s+listings: (?<listings>\[.+\])/;
    return JSON.parse(dataScript.match(listingArrayRegex).groups.listings);
  }, './data/listings.json', 0.5);
}

async function fetchListingDetailsPage(listingID) {
  await fs.mkdir('./data/details-html/', { recursive: true });
  return cached(async () => {
    console.info('Fetching property details page for', listingID);
    const listingUrl = `https://www.zoopla.co.uk/to-rent/details/${listingID}`;
    const response = await rateLimitedFetch(listingUrl);
    if (!response.ok) {
      throw new Error(`Error retrieving response for ${listingID}. Status code ${response.status}, response: ${await response.text()}`);
    }
    return await response.text();
  }, `./data/details-html/${listingID}.html`, 24);
}

async function getListingDetailsJson(listingID) {
  const jsonLDSelector = 'script[type="application/ld+json"]';
  await fs.mkdir('./data/details-json/', { recursive: true });
  return cached(async () => {
    console.info('Parsing property details page for', listingID);
    const listingPageText = await fetchListingDetailsPage(listingID);
    const dom = new JSDOM(listingPageText);
    const jsonLDElems = dom.window.document.querySelectorAll(jsonLDSelector);
    return Array.from(jsonLDElems)
      .map(scriptElem => JSON.parse(scriptElem.text)['@graph'])
      .filter(g => g !== undefined)
      .flat()
      .find(entry => entry['@type'] === "Residence");
  }, `./data/details-json/${listingID}.json`, 24);
}

async function getDirectionsToWork(latitude, longitude) {
  return (await mapsClient.distancematrics({ params: {
    origins: [`${latitude},${longitude}`],
    destinations: ['WC1E 7EA'],
    key: MAPS_API_KEY,
    arrival_time: (new Date(2020, 2, 23, 9)).getTime(),
    mode: 'transit',
    units: 'metric'
  }})).data;
}

async function getAugmentedListings() {
  console.info('Retrieving augmented listings');
  const listings = await getListings();
  return Promise.all(
    listings.map(listing => getListingDetailsJson(listing.listing_id)));
}

async function main() {
  // Ensure the data directory exists
  await fs.mkdir('./data', { recursive: true });
  await getAugmentedListings();
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
