#!/usr/bin/env node

const http = require('http');
const express = require('express');
const history = require('connect-history-api-fallback');
const winston = require('winston');
const MongoClient = require('mongodb').MongoClient;

const importListings = require('./importer.js');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.simple()
  ),
  transports: new winston.transports.Console(),
});

// Import listings from Zoopla into DB
// importListings().then(() => logger.info('Listings updated'));

// Initialise app
const app = express();

// Setup database
const mongoDBName = 'property-swiper'
const mongoClient = new MongoClient('mongodb://localhost:27017/' + mongoDBName,
  { useNewUrlParser: true, useUnifiedTopology: true });
mongoClient.connect()
  .then(() => {
    const db = mongoClient.db(mongoDBName);
    app.db = db;
    app.emit('ready');
  });

// Setup history fallback
app.use(history());

// Set up front end resources
if (['development', 'staging', 'testing'].includes(process.env.NODE_ENV)) {
  // Webpack middleware for use in development
  logger.info('Setting up webpack-dev-middleware...');
  const webpack = require('webpack');
  const webpackDevMiddleware = require('webpack-dev-middleware');
  const hotMiddleware = require('webpack-hot-middleware');

  const config = require('@vue/cli-service/webpack.config.js');
  const compiler = webpack(config);

  app.use(webpackDevMiddleware(compiler));
  app.use(hotMiddleware(compiler, { log: console.log }));
}

// 404 handler
app.use((req, res, next) => next({ message: 'Not found', status: 404 }));

// Error handler
app.use((err, req, res, _) => {
  logger.error('Error in request: ' + JSON.stringify(err) + (err.stack || null));
  res.status(err.status || 500);
  res.json(req.app.get('env') === 'development' ? err : { message : err.message });
});

app.logger = logger;

app.on('ready', () => app.listen(3000, () => logger.info('Listening on port 3000')));
