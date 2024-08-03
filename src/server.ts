import { initWasm } from 'ecash-lib';
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
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

const port = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT;
const httpsKeyPath = process.env.HTTPS_KEY || path.join(__dirname, '../etc/https/key.pem');
const httpsCertPath = process.env.HTTPS_CERT || path.join(__dirname, '../etc/https/cert.pem');

if (!httpsPort) {
  // without HTTPS port, simply launch the application in an HTTP server
  http.createServer(app).listen(port, () => {
    console.log(`HTTP server is running on port ${port}`);
  });
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
  http.createServer(httpRedirect).listen(port, () => {
    console.log(`HTTP redirect is running on port ${port}`);
  });

  // launch the application only in an HTTPS server
  https.createServer(options, app).listen(httpsPort, () => {
    console.log(`HTTPS server is running on port ${httpsPort}`);
  });
}
