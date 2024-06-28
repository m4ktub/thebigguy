import { initWasm } from 'ecash-lib';
import express from 'express';
import path from 'path';
import p2sh from './backend/p2sh';
import status from './backend/status';
import customErrorHandler from './errors';
import tx from './backend/tx';

//
// create express app
//

const app = express();

//
// serve static website
//

app.use(express.static(path.join(__dirname, 'frontend')));

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

initWasm();

//
// start
//

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
