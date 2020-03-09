#!/usr/bin/env node

const fetch = require('node-fetch');
const fs = require('fs').promises;
const { JSDOM } = require('jsdom');

const zooplaSearchURL = '***REMOVED***';
const millisIn30Mins = 30 * 60 * 1000;

async function getMapPage() {
  const cachedMapPageName = './data/map.html';
  // Should fetch if file is older than 30 minutes or doesn't exist
  const shouldFetch = await fs.stat(cachedMapPageName)
    .then(stat => (new Date() - stat.mtime) > millisIn30Mins)
    .catch(err => true);
  if (shouldFetch) {
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
    const listingJson = await fs.readFile(cachedListingsName, { encoding: 'utf8' });
    return JSON.parse(listingJson);
  }
}

async function getListingDetails(listingID) {
  const response = await fetch(zooplaSearchURL);
  const dom = new JSDOM(response);
  const dataElems = dom.window.document.querySelectorAll('script[type="application/ld+json"]');
  return dataElems;
}

async function main() {
  // Ensure the data directory exists
  await fs.mkdir('./data', { recursive: true });
  //const listings = getListings();

  //return listings;

}

main()
  .then(result => {
    console.log(result);
    // process.exit(0);
   })
  .catch(err => {
    console.error('Error running main:', err);
    // process.exit(1);
  });
