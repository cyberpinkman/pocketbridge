import fs from "node:fs/promises";
import { randomInt } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { PairingPayload } from "./types.js";

export type Config = {
  port: number;
  dataDir: string;
  inboxDir: string;
  metadataPath: string;
  obsidianDir: string;
  snapzyWatchDir: string;
  pairCode: string;
  deviceName: string;
  serverBaseUrl: string;
  wsUrl: string;
  lanAddresses: string[];
  maxUploadBytes: number;
  pairingExpiresAt: string;
};

function defaultDataDir(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === "server" ? path.resolve(cwd, "..", "data") : path.resolve(cwd, "data");
}

function lanIps(): string[] {
  const addresses: string[] = [];
  for (const records of Object.values(os.networkInterfaces())) {
    for (const record of records ?? []) {
      if (record.family === "IPv4" && !record.internal) {
        addresses.push(record.address);
      }
    }
  }

  return addresses.length > 0 ? addresses : ["127.0.0.1"];
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumberEnv(name: string, fallback: number): number {
  const parsed = numberEnv(name, fallback);
  return parsed > 0 ? parsed : fallback;
}

function generatePairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function loadConfig(): Config {
  const port = numberEnv("PORT", 3000);
  const dataDir = path.resolve(process.env.PB_DATA_DIR ?? defaultDataDir());
  const lanAddresses = lanIps();
  const publicHost = process.env.PB_PUBLIC_HOST ?? lanAddresses[0];
  const serverBaseUrl = process.env.PB_SERVER_BASE_URL ?? `http://${publicHost}:${port}`;

  return {
    port,
    dataDir,
    inboxDir: path.join(dataDir, "inbox"),
    metadataPath: path.join(dataDir, "metadata.json"),
    obsidianDir: path.resolve(process.env.PB_OBSIDIAN_DIR ?? path.join(dataDir, "obsidian", "PocketBridge")),
    snapzyWatchDir: path.resolve(process.env.PB_SNAPZY_WATCH_DIR ?? path.join(dataDir, "watch", "snapzy")),
    pairCode: process.env.PB_PAIR_CODE ?? generatePairCode(),
    deviceName: process.env.PB_DEVICE_NAME ?? os.hostname(),
    serverBaseUrl,
    wsUrl: process.env.PB_WS_URL ?? serverBaseUrl.replace(/^http/, "ws") + "/ws",
    lanAddresses,
    maxUploadBytes: positiveNumberEnv("PB_MAX_UPLOAD_MB", 100) * 1024 * 1024,
    pairingExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
  };
}

export async function ensureRuntimeDirs(config: Config): Promise<void> {
  await fs.mkdir(config.inboxDir, { recursive: true });
  await fs.mkdir(path.dirname(config.metadataPath), { recursive: true });
  await fs.mkdir(config.obsidianDir, { recursive: true });
  await fs.mkdir(config.snapzyWatchDir, { recursive: true });
}

export function pairingPayload(config: Config): PairingPayload {
  return {
    protocol: "pocketbridge",
    version: 1,
    serverBaseUrl: config.serverBaseUrl,
    wsUrl: config.wsUrl,
    pairCode: config.pairCode,
    deviceName: config.deviceName,
    expiresAt: config.pairingExpiresAt,
    capabilities: ["upload", "download", "websocket", "knowledge", "ble-status"]
  };
}
