import type { RequestHandler } from "express";
import type { Config } from "./config.js";
import { HttpError } from "./http/errors.js";

export function requirePairCode(config: Config): RequestHandler {
  return (req, _res, next) => {
    const header = req.header("X-PocketBridge-Pair-Code");
    if (header !== config.pairCode) {
      next(new HttpError(401, "UNAUTHORIZED", "Invalid pair code"));
      return;
    }

    next();
  };
}

