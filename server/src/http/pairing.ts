import { Router } from "express";
import QRCode from "qrcode";
import type { Config } from "../config.js";
import { pairingPayload } from "../config.js";
import { asyncHandler } from "./errors.js";

export function pairingRouter(config: Config): Router {
  const router = Router();

  router.get(
    "/pairing",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json(pairingPayload(config));
    })
  );

  router.get(
    "/pairing/qr.svg",
    asyncHandler(async (_req, res) => {
      const svg = await QRCode.toString(JSON.stringify(pairingPayload(config)), {
        type: "svg",
        margin: 1,
        width: 256
      });

      res.setHeader("Cache-Control", "no-store");
      res.type("image/svg+xml").send(svg);
    })
  );

  return router;
}
