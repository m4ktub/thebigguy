import express, { type RequestHandler } from 'express';

export default function redirect(protocol: string, port: number | string, staticHandlers: Record<string, RequestHandler>) {
  const app = express();

  app.get('*', function(req, res, next) {
    const staticPath = Object.keys(staticHandlers).find(path => req.url.startsWith(path));
    if (staticPath) {
      staticHandlers[staticPath](req, res, next);
    } else {
      var location = new URL(`${protocol}://${req.headers.host || "localhost"}${req.url}`);
      location.port = port.toString();
      res.redirect(location.toString());
    }
  });

  return app;
}
