#!/usr/bin/env node

const http = require('http');
const express = require('express');
const history = require('connect-history-api-fallback');
const winston = require('winston');
const { promisify } = require('util');
const crypto = require('crypto');

const dbConnection = require('./dbConnection');
const importListings = require('./importer');
const apiRouter = require('./api');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.simple()
  ),
  transports: new winston.transports.Console(),
});

// Initialise app
const app = express();
app.use(express.json());

// Setup database
dbConnection.connect()
  .then(db => {
    function updateListings() {
      importListings(db).then(() => logger.info('Listings updated'));
    }
    // Import listings from Zoopla into DB at startup & every hour after
    updateListings();
    setInterval(updateListings, 3600 * 1000);
    app.db = db;
    app.emit('ready');
  });

// Setup API
app.use('/api', apiRouter);

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
} else {
  app.use(express.static('dist'));
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

randomString(12)
  .then(key => {
    app.set('bootstrapKey', key);
    logger.info('Use the following link to log in: /?key=' + key);
  })
  .catch(err => logger.error('Error generating bootstrap key: ' + err));

function randomString(bytes) {
  bytes = bytes || 64;
  return promisify(crypto.randomBytes)(bytes)
    .then(buf => {
      let str = '';
      for (let offset = 0; offset < buf.length; offset += 6) {
        str += buf.readIntLE(offset, Math.min(buf.length - offset, 6)).toString(36);
      }
      return str;
    });
};
