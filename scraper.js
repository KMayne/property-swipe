#!/usr/bin/env node

const fetch = require('node-fetch');
const fs = require('fs').promises;
const { JSDOM } = require('jsdom');
const Bottleneck = require('bottleneck');
const maps = require("@googlemaps/google-maps-services-js");
const winston = require('winston');

const secrets = require('./secrets.json');

const mapsClient = new maps.Client();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console({
    stderrLevels: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']
  })]
});
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
    return JSON.parse(fileText);
  }
}

async function getMapPage() {
  return cached(async () => {
    logger.info('Fetching map page');
    const response = await rateLimitedFetch(secrets.zooplaSearchURL);
    return response.text();
  }, './data/map.html', 0.5);
}

async function getListings() {
  return cached(async () => {
    logger.info('Parsing map page for listings');
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

function getListingURL(listingID) {
  return `https://www.zoopla.co.uk/to-rent/details/${listingID}`
}

async function fetchListingDetailsPage(listingID) {
  await fs.mkdir('./data/details-html/', { recursive: true });
  return cached(async () => {
    logger.info('Fetching property details page for ' + listingID);
    const listingUrl = getListingURL(listingID);
    const response = await rateLimitedFetch(listingUrl);
    if (!response.ok) {
      throw new Error(`Error retrieving response for ${listingID}. Status code ${response.status}, response: ${await response.text()}`);
    }
    return await response.text();
  }, `./data/details-html/${listingID}.html`, 24 * 7);
}

async function getListingDetails(listingID) {
  const jsonLDSelector = 'script[type="application/ld+json"]';
  await fs.mkdir('./data/details-json/', { recursive: true });
  return cached(async () => {
    logger.info('Parsing property details page for ' + listingID);
    const listingPageText = await fetchListingDetailsPage(listingID);
    const dom = new JSDOM(listingPageText);
    const jsonLDElems = dom.window.document.querySelectorAll(jsonLDSelector);
    return Array.from(jsonLDElems)
      .map(scriptElem => JSON.parse(scriptElem.text)['@graph'])
      .filter(g => g !== undefined)
      .flat()
      .find(entry => entry['@type'] === "Residence");
  }, `./data/details-json/${listingID}.json`, 24 * 7);
}

async function getCommuteTimes(latitude, longitude) {
  const response = await mapsClient.distancematrix({ params: {
    origins: [`${latitude},${longitude}`],
    destinations: [secrets.workLocation, secrets.gfLocation],
    key: secrets.mapsAPIKey,
    arrival_time: (new Date(2020, 2, 23, 9)).getTime() / 1000,
    mode: 'transit',
    units: 'metric'
  }});
  const times = response.data.rows[0];
  if (times.status !== 'OK') return { workCommuteMins: 0, gfCommuteMins: 0 };
  const [workCommuteMins, gfCommuteMins] =
    workCommuteResults.map(elem => Math.round(elem.duration.value / 60));
  return { workCommuteMins, gfCommuteMins };
}

async function processZooplaListing(listing) {
  await fs.mkdir('./data/processed/', { recursive: true });
  const listingID = listing.listing_id;
  cached(async () => {
    const [commuteTimes, details] = await Promise.all([
      getCommuteTimes(listing.lat, listing.lon),
      getListingDetails(listingID)
      ]);
    const priceRegex = /£(?<price>[\d,]+) pcm/;
    const price = Number(details.description
      .match(priceRegex).groups.price
      .replace(/,/g, ''));
    return {
      summary: details.name.replace(' to rent', ''),
      price,
      ...commuteTimes,
      locality: details.address.addressLocality,
      listingID,
      link: getListingURL(listingID),
      photos: details.photo.map(imgObject => imgObject.contentUrl)
    }
  }, `./data/processed/${listingID}.json`, 24 * 7);
}

async function main() {
  // Ensure the data directory exists
  await fs.mkdir('./data', { recursive: true });
  const listings = await getListings();
  await Promise.all(listings.map(listing => processZooplaListing(listing)));
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
