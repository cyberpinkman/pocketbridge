import { Router } from "express";
import type { Config } from "../config.js";
import { isBleTrustStatus, type BleStatus } from "../types.js";
import type { WebSocketHub } from "../websocket/hub.js";
import { asyncHandler, badRequest } from "./errors.js";

export function bleRouter(config: Config, hub: WebSocketHub): Router {
  const router = Router();
  let current: BleStatus = {
    status: "unknown",
    deviceName: config.deviceName,
    updatedAt: new Date().toISOString()
  };

  router.get(
    "/ble/status",
    asyncHandler(async (_req, res) => {
      res.json(current);
    })
  );

  router.post(
    "/ble/status",
    asyncHandler(async (req, res) => {
      if (!isBleTrustStatus(req.body.status)) {
        badRequest("status must be trusted, away, locked, or unknown");
      }

      current = {
        status: req.body.status,
        deviceName: String(req.body.deviceName ?? config.deviceName),
        rssi: req.body.rssi === undefined ? undefined : Number(req.body.rssi),
        updatedAt: new Date().toISOString()
      };

      hub.broadcast("ble.status", current);
      res.json(current);
    })
  );

  return router;
}

