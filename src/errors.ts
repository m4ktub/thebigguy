import { ErrorRequestHandler } from "express";

const customErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // use default behavior on localhost
  if (req.hostname === "localhost") {
    next(err);
    return;
  }

  // log errors to console
  console.error(err);

  // send  error messages to client
  if (err instanceof Error) {
    res.status(500).send(err.message);
  } else {
    res.sendStatus(500);
  }
};

export default customErrorHandler;
