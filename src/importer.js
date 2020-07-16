#!/usr/bin/env node

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { JSDOM } = require('jsdom');
const Bottleneck = require('bottleneck');
const MapsClient = require("@googlemaps/google-maps-services-js").Client;
const winston = require('winston');
const moment = require('moment');

const dbClient = require('./dbConnection');
const secrets = require('./secrets.json');

const dataDir = path.resolve(path.dirname(require.main.filename), '..', 'data');

const mapsClient = new MapsClient();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console({
    stderrLevels: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']
  })]
});
const limiter = new Bottleneck({
  minTime: 1000
});
const rateLimitedFetch = limiter.wrap(fetch);

async function cached(func, cacheFileName, maxAgeHours) {
  const maxAgeMillis = maxAgeHours * 60 * 60 * 1000;
  const cacheFilePath = path.join(dataDir, cacheFileName);
  const fileNeedsUpdate = await fs.stat(cacheFilePath)
    // Check if last modified within max age
    .then(stat => (new Date() - stat.mtime) > maxAgeMillis)
    // Non-existent file needs update
    .catch(err => true);
  if (fileNeedsUpdate) {
    // Ensure the data directory exists
    await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
    // Run the function and write it out to the data directory
    const funcResult = await func();
    await fs.writeFile(cacheFilePath, JSON.stringify(funcResult));
    return funcResult;
  } else {
    const fileText = await fs.readFile(cacheFilePath, { encoding: 'utf8' });
    return JSON.parse(fileText);
  }
}

async function getMapPage() {
  return cached(async () => {
    logger.info('Fetching map page');
    const response = await rateLimitedFetch(secrets.zooplaSearchURL);
    return response.text();
  }, 'map.html', 0.5);
}

async function getListings() {
  return cached(async () => {
    const dom = new JSDOM(await getMapPage());
    logger.info('Parsing map page for listings');
    const scriptElems = Array.from(dom.window.document.querySelectorAll('script'));
    const dataScript =
      scriptElems
      .map(s => s.text)
      .find(s => s.includes('listing_id') && s.includes('var data'));
    if (!dataScript) {
      throw new Error('Could not find script containing listing data');
    }
    const listingArrayRegex = /var data = \{(?:\n|.)+listings: (?<listings>\[.+\])/;
    return JSON.parse(dataScript.match(listingArrayRegex).groups.listings);
  }, 'listings.json', 0.5);
}

function getListingURL(listingID) {
  return `https://www.zoopla.co.uk/to-rent/details/${listingID}`
}

async function fetchListingDetailsPage(listingID) {
  return cached(async () => {
    logger.info('Fetching property details page for ' + listingID);
    const listingUrl = getListingURL(listingID);
    const response = await rateLimitedFetch(listingUrl);
    if (!response.ok) {
      throw new Error(`Error retrieving response for ${listingID}. `
        + `Status code ${response.status}, response: ${await response.text()}`);
    }
    return await response.text();
  }, path.join('details-html', `${listingID}.html`), 24 * 7);
}

async function getListingDetails(listingID) {
  const jsonLDSelector = 'script[type="application/ld+json"]';
  return cached(async () => {
    const listingPageText = await fetchListingDetailsPage(listingID);
    logger.info('Parsing property details page for ' + listingID);
    const dom = new JSDOM(listingPageText);
    const jsonLDElems = dom.window.document.querySelectorAll(jsonLDSelector);
    return Array.from(jsonLDElems)
      .map(scriptElem => JSON.parse(scriptElem.text)['@graph'])
      .filter(g => g !== undefined)
      .flat()
      .find(entry => entry['@type'] === "Residence");
  }, path.join('details-json', `${listingID}.json`), 24 * 7);
}

async function getCommuteTimes(latitude, longitude) {
  const query = {
    origins: [`${latitude},${longitude}`],
    destinations: [secrets.workLocation],
    key: secrets.mapsAPIKey,
    // 9am next Monday
    arrival_time: moment().day(8).hours(9).minutes(0).seconds(0).millisecond(0).unix(),
    units: 'metric'
  };

  const [transitCommuteMins, bikeCommuteMins] = (await Promise.all([
    mapsClient.distancematrix({ params: { ...query, mode: 'transit' }}),
    mapsClient.distancematrix({ params: { ...query, mode: 'bicycling' }}),
  ])).map(response => {
    const commuteTime = response.data.rows[0].elements[0];
    if (commuteTime.status !== 'OK') return null;
    return Math.round(commuteTime.duration.value / 60);
  });
  return { transitCommuteMins, bikeCommuteMins };
}

async function processZooplaListing(listing) {
  const listingID = listing.listing_id;
  return cached(async () => {
    const [commuteTimes, details] = await Promise.all([
      getCommuteTimes(listing.lat, listing.lon),
      getListingDetails(listingID)
      ]);
    const priceRegex = /£(?<price>[\d,]+) pcm/;
    const price = Number(details.description
      .match(priceRegex).groups.price
      .replace(/,/g, ''));
    return {
      listingID,
      latitude: listing.lat,
      longitude: listing.lon,
      summary: details.name.replace(' to rent', ''),
      price,
      ...commuteTimes,
      locality: details.address.addressLocality,
      link: getListingURL(listingID),
      photos: details.photo.map(imgObject => imgObject.contentUrl),
      updated: new Date()
    };
  }, path.join('processed', `${listingID}.json`), 24 * 7);
}

async function importListings(db) {
  logger.info('Getting listings')
  const listings = await getListings();
  const listingsCol = db.collection('listings');

  logger.info('Processing listings');
  const proccessedListings = await Promise.all(
    listings.map(listing => processZooplaListing(listing)));

  logger.info('Marking propeties not in the response as removed');
  const currentListingIDs = proccessedListings.map(listing => listing.listingID);
  listingsCol.updateMany(
    { listingID: { $nin: currentListingIDs } },
    { $set: { removed: true } });

  logger.info('Updating listing data in db');
  await Promise.all(proccessedListings.map(listing => listingsCol.updateOne(
      { listingID: listing.listingID },
      { $set: { ...listing, removed: false } },
      { upsert: true }
  )));
}

async function main() {
  await dbClient.connect()
    // Import listings from Zoopla into DB
    .then(db => importListings(db))
    .then(() => {
      logger.info('Listings updated')
      dbClient.disconnect();
    });
}

module.exports = importListings;
