import { initWasm } from 'ecash-lib';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { type AddressInfo } from 'net';
import path from 'path';
import logger from './backend/logging';
import p2sh from './backend/p2sh';
import status from './backend/status';
import tx from './backend/tx';
import customErrorHandler from './errors';
import redirect from './redirect';
import * as database from './backend/database';

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
// register backend api
//

app.get('/api/status', status);
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
  database.close(err => {
    if (err) {
      console.log("Failed to close database: ", err)
    } else {
      console.log("Database closed")
    }
  });
}

//
// initialize database
//

database.open(err => {
  // shutdown server on error
  if (err) {
    console.log("Failed to open database: ", err);
    shutdown();
  }
});
