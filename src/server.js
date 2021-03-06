#!/usr/bin/env node

const http = require('http');
const path = require('path');
const express = require('express');
const history = require('connect-history-api-fallback');

const dbConnection = require('./dbConnection');
const importListings = require('./importer');
const apiRouter = require('./api');
const logger = require('./logger');
const secrets = require('./secrets.json');

// Initialise app
const app = express();
app.use(express.json());

// Setup loginKey
app.set('loginKey', secrets.loginKey);

// Setup database
dbConnection.connect()
  .then(db => {
    function updateListings() {
      importListings(db).then(() => logger.info('Listings updated'));
    }
    // Import listings from Zoopla into DB at startup & every 3 hours after
    updateListings();
    setInterval(updateListings, 3 * 3600 * 1000);
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

app.on('ready', () => {
  if (process.env.NODE_ENV === 'development') {
    http.createServer(app).listen(3000, function () {
        console.info("Listening for HTTP on", this.address());
    });
  } else {
    require('greenlock-express')
    .init({
        packageRoot: path.resolve(__dirname, '..'),
        maintainerEmail: "property-swipe@kianmayne.co.uk",
        configDir: './greenlock.d',
        cluster: false
    }).serve(app);
  }
});
