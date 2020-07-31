'use strict';

const MongoClient = require('mongodb').MongoClient;

const secrets = require('./secrets.json');
const logger = require('./logger');


const mongoClient = new MongoClient(secrets.mongoDBConnectionString,
  { useNewUrlParser: true, useUnifiedTopology: true });

module.exports.connect = async function () {
  logger.info('Connecting to database');
  await mongoClient.connect();
  return mongoClient.db('property-swipe');
};

module.exports.disconnect = function () {
  logger.info('Closing connection');
  mongoClient.close();
}
