import { Router } from "express";
import type { Config } from "../config.js";
import { isBleTrustStatus, type BleStatus } from "../types.js";
import type { WebSocketHub } from "../websocket/hub.js";
import { asyncHandler, badRequest } from "./errors.js";

function parseRssi(value: unknown): number | undefined {
  if (value === undefined) return undefined;

  if (typeof value !== "number" && typeof value !== "string") {
    badRequest("rssi must be a finite number");
  }

  const normalized = typeof value === "string" ? value.trim() : value;
  if (normalized === "") {
    badRequest("rssi must be a finite number");
  }

  const rssi = Number(normalized);
  if (!Number.isFinite(rssi)) {
    badRequest("rssi must be a finite number");
  }

  return rssi;
}

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
        rssi: parseRssi(req.body.rssi),
        updatedAt: new Date().toISOString()
      };

      hub.broadcast("ble.status", current);
      res.json(current);
    })
  );

  return router;
}
