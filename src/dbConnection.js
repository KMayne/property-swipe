'use strict';

const MongoClient = require('mongodb').MongoClient;
const winston = require('winston');

const secrets = require('./secrets.json');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.simple()
  ),
  transports: new winston.transports.Console(),
});

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
