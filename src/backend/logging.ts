import fs from 'fs';
import { type IncomingMessage, type ServerResponse } from 'http';
import morgan from 'morgan';
import path from 'path';

//
// default options
//

var options: morgan.Options<IncomingMessage, ServerResponse> = {};

//
// allow ouput to be appended to a file
//

const file = process.env.LOG_ACCESS_FILE;
if (file) {
  const logPath = path.resolve(__dirname, file);
  options.stream = fs.createWriteStream(logPath, { flags: 'a' });
}

//
// toggle format based on output target
//

const format = file ? 'combined' : 'tiny';

//
// toggle access log volume based on output target
//

if (!file) {
  options.skip = (_req, _res) => {
    const url = _req.url || "/";
    // skip static resources (those that do not match prefixes)
    return !['/h/', '/manage', '/api/'].some(path => url.startsWith(path));
  };
}

//
// create logger
//

const logger = morgan(format, options);
export default logger;
