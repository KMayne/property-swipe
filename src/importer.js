#!/usr/bin/env node

const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { JSDOM } = require('jsdom');
const Bottleneck = require('bottleneck');
const MapsClient = require("@googlemaps/google-maps-services-js").Client;
const moment = require('moment');

const dbClient = require('./dbConnection');
const secrets = require('./secrets.json');

const dataDir = path.resolve(path.dirname(require.main.filename), '..', 'data');

const mapsClient = new MapsClient();
const logger = require('./logger');
const limiter = new Bottleneck({
  minTime: 1000
});
const rateLimitedFetch = limiter.wrap(fetch);

const listingIdPageMaxAgeHours = 0.25;
const listingMaxAgeHours = 48;
const proccessedListingMaxAgeHours = listingMaxAgeHours;
const requestPageSize = 48;
// 180 day expiry
const commuteTimeMaxAgeHours = 24 * 180;
// Used to control processed listing cache
const processedDataVersion = 2;
const maxGridPages = Math.floor(secrets.maxProperties / requestPageSize);

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

async function getListingsFromGridPage(pageNumber) {
    const params = new URLSearchParams();
    Object.entries({
      ...secrets.listZooplaQuery,
      "results_sort": "newest_listings",
      "view_type": "grid",
      "page_size": requestPageSize,
      "pn": pageNumber
    }).forEach(([key, value]) => params.set(key, value));
    const searchUrl = `https://www.zoopla.co.uk/to-rent/property/${secrets.listZooplaQuery.q.toLowerCase().replace(' ', '-')}/?${params.toString()}`;
    if (pageNumber === 0) logger.info(`Example URL: ${searchUrl}`);
    const responseText = await cached(async () => {
      try {
        const gridPage = await rateLimitedFetch(searchUrl);
        logger.info(`Fetched listings grid page ${pageNumber + 1} of ${maxGridPages}`);
        return await gridPage.text();
      } catch (e) {
        logger.error(e);
        return '';
      }
    }, path.join('listing-grid-pages', `${pageNumber}.html`), listingIdPageMaxAgeHours);
    const dom = new JSDOM(responseText);
    const divIdPrefix = 'listing_';
    return Array.from(dom.window.document.querySelectorAll(`div[id^=${divIdPrefix}]`))
      .map(div => Number(div.id.slice(divIdPrefix.length)));
}

async function getListingsFromGrid() {
  return cached(async () => {
    logger.info('Fetching listing grid pages to extract listing IDs');
    const gridListingIdsPromises = [];
    for (let i = 0; i < maxGridPages; i++) {
      gridListingIdsPromises.push(getListingsFromGridPage(i));
    }
    return (await Promise.all(gridListingIdsPromises)).flat();
  }, 'listings.json', listingIdPageMaxAgeHours / 2);
}

function getListingURL(listingID) {
  return `https://www.zoopla.co.uk/to-rent/details/${listingID}`;
}

async function fetchListingDetailsPage(listingID) {
  return cached(async () => {
    const response = await rateLimitedFetch(getListingURL(listingID));
    logger.info(`Fetched property details page for ${listingID}`);
    if (!response.ok) {
      throw new Error(`Error retrieving response for ${listingID}. `
        + `Status code ${response.status}, response: ${await response.text()}`);
    }
    return await response.text();
  }, path.join('details-html', `${listingID}.html`), listingMaxAgeHours);
}

function parsePrice(priceStr) {
  const priceRegex = /£(?<price>[\d,]+) pcm/;
  return Number(priceStr.match(priceRegex).groups.price.replace(/,/g, ''));
}

async function getListingDetails(listingID) {
  const jsonLDSelector = 'script[type="application/ld+json"]';
  const listingPageText = await fetchListingDetailsPage(listingID);
  logger.info('Parsing property details page for ' + listingID);
  const dom = new JSDOM(listingPageText);
  const document = dom.window.document;
  const jsonLdElems = document.querySelectorAll(jsonLDSelector);
  const jsonMetadata = Array.from(jsonLdElems)
    .map(scriptElem => JSON.parse(scriptElem.text)['@graph'])
    .filter(g => g !== undefined)
    .flat()
    .find(entry => entry['@type'] === "Residence");

  let photos = [
    ...jsonMetadata.photo.map(imgObject => imgObject.contentUrl),
    ...(Array.from(document.querySelectorAll('.ui-modal-gallery__asset--center-content'))
      .map(galleryContent => galleryContent.style.backgroundImage.match(/url\((?<url>.+)\)/)?.groups.url))
  ];

  const descriptionElem = document.querySelector('div[data-testid="listing_description"]');
  const descriptionText = descriptionElem
    ? descriptionElem.textContent.trim()
    : (logger.warn(`Missing description for ${listingID}`), '');

  const features = Array.from(document.querySelectorAll('ul[data-testid="listing_features_bulletted"] > li'))
    .map(li => li.textContent);
  const availableDateStr = document.querySelector('span[data-testid="availability"]')?.textContent
    .match(/^Available from (?<date>.+)/)?.groups.date || null;

  return {
    summary: jsonMetadata.name.replace(' to rent', ''),
    price: parsePrice(jsonMetadata.description),
    locality: jsonMetadata.address.addressLocality,
    latitude: jsonMetadata.geo.latitude,
    longitude: jsonMetadata.geo.longitude,
    description: descriptionText,
    bedCount: Number(document.querySelector('span[data-testid="beds-label"]')?.textContent.split(' ')[0] || 'NaN'),
    bathCount: Number(document.querySelector('span[data-testid="baths-label"]')?.textContent.split(' ')[0] || 'NaN'),
    photos,
    features,
    available: availableDateStr ? moment(availableDateStr, 'Do MMM YYYY').toDate() : undefined,
    viewCount: NaN,
    avgAreaPrice: null
  };
}

function getCommuteTimes(latitude, longitude) {
  return cached(async () => {
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
  }, path.join('commute-times', `${latitude},${longitude}`), commuteTimeMaxAgeHours);
}

async function processZooplaListing(listingID) {
  return cached(async () => {
    const details = await getListingDetails(listingID);
    const commuteTimes = await getCommuteTimes(details.latitude, details.longitude);
    return {
      listingID,
      link: getListingURL(listingID),
      ...details,
      ...commuteTimes
    };
  }, path.join('processed', `${listingID}-v${processedDataVersion}.json`), proccessedListingMaxAgeHours);
}

async function importListings(db) {
  logger.info('Getting listings')
  const listings = await getListingsFromGrid();
  if (listings.length < 1) {
    logger.error('Found 0 listings. Not updating database');
    return;
  }

  logger.info(`Found ${listings.length} listings in total`);
  const listingsCol = db.collection('listings');

  logger.info('Marking propeties not in the response as removed');
  const currentListingIDs = listings.map(listing => listing.listing_id);
  await listingsCol.updateMany(
    { listingID: { $nin: currentListingIDs }, removed: false },
    { $set: { removed: true, removedDate: new Date() } }
  );

  logger.info('Processing listings & updating listing data in DB');
  await Promise.all(listings.map(async rawListing => {
    try {
      const listing = await processZooplaListing(rawListing);
      await listingsCol.updateOne(
        { listingID: listing.listingID },
        {
          $set: { ...listing, removed: false, updatedDate: new Date() },
          $setOnInsert: { insertedDate: new Date() }
        },
        { upsert: true }
      );
    } catch (err) {
      logger.warn(`Error processing property ${rawListing}: ${err}`);
    }
  }));
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
