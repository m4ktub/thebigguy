import { initWasm } from 'ecash-lib';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { type AddressInfo } from 'net';
import path from 'path';
import * as database from './backend/database';
import features from './backend/features';
import hash from './backend/hash';
import logger from './backend/logging';
import p2sh from './backend/p2sh';
import status from './backend/status';
import tx from './backend/tx';
import customErrorHandler from './errors';
import redirect from './redirect';

//
// create express app
//

const app = express();

//
// register logging
//

app.use(logger);

//
// serve static website
//

const staticHandler = express.static(path.join(__dirname, 'frontend'));
app.use(staticHandler);

//
// register short url handler
//

app.get('/h/:hash', hash);

//
// register backend api
//

app.get('/api/status', status);
app.get('/api/features', features);
app.get('/api/p2sh', p2sh);
app.get('/api/tx', tx);

//
// register error handling
//

app.use(customErrorHandler);

//
// initialize WASM
//

initWasm().then(() => {
  console.log("Loaded WASM module from eCash library");
});

//
// start
//

const servers: http.Server[] = [];

const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT;
const httpsKeyPath = process.env.HTTPS_KEY || path.join(__dirname, '../etc/https/key.pem');
const httpsCertPath = process.env.HTTPS_CERT || path.join(__dirname, '../etc/https/cert.pem');

if (!httpsPort) {
  // without HTTPS port, simply launch the application in an HTTP server
  const httpServer = http.createServer(app).listen(port, () => {
    console.log(`HTTP server is running on port ${port}`);
  });

  // register server for graceful shutdown
  servers.push(httpServer);
} else {
  // load the required private key and certificate chain
  const options = {
    key: fs.readFileSync(httpsKeyPath),
    cert: fs.readFileSync(httpsCertPath)
  };

  // create HTTP application that redirects all requests to HTTPS...
  const httpRedirect = redirect("https", httpsPort, {
    // ... except when serving Let's Encrypt challenges
    '/.well-known/acme-challenge/': staticHandler
  });

  // launch HTTP redirect server
  const httpServer = http.createServer(httpRedirect).listen(port, () => {
    console.log(`HTTP redirect is running on port ${port}`);
  });

  // launch the application only in an HTTPS server
  const httpsServer = https.createServer(options, app).listen(httpsPort, () => {
    console.log(`HTTPS server is running on port ${httpsPort}`);
  });

  // register both servers for graceful shutdown
  servers.push(httpServer);
  servers.push(httpsServer);
}

//
// shutdown
//

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  // close web services
  console.log("Shutting down web services...");
  servers.forEach(server => {
    // request server close
    const address = server.address() as AddressInfo;
    server.close(() => {
      console.log(`Closed server on port ${address.port}`);
    });

    // ensure server is closed by closing all connections
    server.closeAllConnections();
  });

  // close database
  console.log("Closing database...");
  database.finalize()
    .then(() => console.log("Database closed"))
    .catch(error => console.log("Failed to close database:", error));
}

//
// initialize database
//

database.initialize().catch(error => {
  // shutdown server on error
  console.log("Failed to initialize database:", error);
  shutdown();
});
