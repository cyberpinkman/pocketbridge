import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import type { Config } from "./config.js";
import {
  serverBaseUrlFromPublicHost,
  websocketUrlFromServerBaseUrl
} from "./config.js";
import { createPocketBridgeRuntime, type PocketBridgeRuntime } from "./app.js";

type JsonObject = Record<string, unknown>;

export type LanPreflightOptions = {
  publicHost?: string;
  port?: number;
  pairCode?: string;
  deviceName?: string;
};

export type LanPreflightResult = {
  publicHost: string;
  pairCode: string;
  port: number;
  localBaseUrl: string;
  advertisedBaseUrl: string;
  advertisedWsUrl: string;
  macUiUrl: string;
  mobileFallbackUrl: string;
  lanAddresses: string[];
  checked: string[];
};

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

function defaultPublicHost(): string {
  return process.env.PB_PUBLIC_HOST ?? lanIps()[0];
}

function numberOption(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

async function config(options: LanPreflightOptions): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-lan-preflight-"));
  const port = options.port ?? numberOption(process.env.PB_LAN_CHECK_PORT, 0);
  const publicHost = options.publicHost ?? defaultPublicHost();
  const pairCode = options.pairCode ?? process.env.PB_PAIR_CODE ?? "123456";
  const advertisedBaseUrl = serverBaseUrlFromPublicHost(publicHost, port);
  return {
    port,
    dataDir,
    inboxDir: path.join(dataDir, "inbox"),
    metadataPath: path.join(dataDir, "metadata.json"),
    obsidianDir: path.join(dataDir, "obsidian", "PocketBridge"),
    snapzyWatchDir: path.join(dataDir, "watch", "snapzy"),
    pairCode,
    deviceName: options.deviceName ?? process.env.PB_DEVICE_NAME ?? os.hostname(),
    serverBaseUrl: advertisedBaseUrl,
    wsUrl: websocketUrlFromServerBaseUrl(advertisedBaseUrl),
    lanAddresses: lanIps(),
    maxUploadBytes: 100 * 1024 * 1024,
    pairingExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

async function listen(runtime: PocketBridgeRuntime, cfg: Config, publicHost: string): Promise<void> {
  await new Promise<void>((resolve) => runtime.server.listen(cfg.port, "127.0.0.1", resolve));
  const address = runtime.server.address() as AddressInfo;
  cfg.port = address.port;
  cfg.serverBaseUrl = serverBaseUrlFromPublicHost(publicHost, address.port);
  cfg.wsUrl = websocketUrlFromServerBaseUrl(cfg.serverBaseUrl);
}

async function json(url: string, options: RequestInit = {}): Promise<JsonObject> {
  const response = await fetch(url, options);
  const body = await response.text();
  assert.ok(response.ok, `${options.method ?? "GET"} ${url} failed: ${response.status} ${body}`);
  return JSON.parse(body) as JsonObject;
}

async function text(url: string): Promise<{ body: string; contentType: string }> {
  const response = await fetch(url);
  const body = await response.text();
  assert.ok(response.ok, `GET ${url} failed: ${response.status} ${body}`);
  return { body, contentType: response.headers.get("content-type") ?? "" };
}

async function waitForSocketPairing(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for websocket pairing.connected"));
    }, 5_000);

    socket.once("message", (data) => {
      const event = JSON.parse(data.toString()) as JsonObject;
      clearTimeout(timer);
      socket.close();
      try {
        assert.equal(event.type, "pairing.connected");
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function runLanPreflight(options: LanPreflightOptions = {}): Promise<LanPreflightResult> {
  const publicHost = options.publicHost ?? defaultPublicHost();
  const cfg = await config({ ...options, publicHost });
  let runtime: PocketBridgeRuntime | undefined;
  const checked: string[] = [];

  try {
    runtime = await createPocketBridgeRuntime(cfg, { watchSnapzy: false });
    await listen(runtime, cfg, publicHost);
    const localBaseUrl = `http://127.0.0.1:${cfg.port}`;
    const localWsUrl = `ws://127.0.0.1:${cfg.port}/ws`;

    const health = await json(`${localBaseUrl}/health`);
    assert.deepEqual(health, { ok: true, service: "pocketbridge", version: 1 });
    checked.push("health");

    const pairing = await json(`${localBaseUrl}/api/pairing`);
    assert.equal(pairing.serverBaseUrl, cfg.serverBaseUrl);
    assert.equal(pairing.wsUrl, cfg.wsUrl);
    assert.equal(pairing.pairCode, cfg.pairCode);
    assert.equal(pairing.deviceName, cfg.deviceName);
    checked.push("pairing-json");

    const qr = await text(`${localBaseUrl}/api/pairing/qr.svg`);
    assert.match(qr.contentType, /^image\/svg\+xml/);
    assert.match(qr.body, /^<svg/);
    checked.push("pairing-qr");

    const macUi = await text(`${localBaseUrl}/`);
    assert.match(macUi.body, /PocketBridge/);
    checked.push("mac-ui");

    const mobileFallback = await text(`${localBaseUrl}/mobile.html`);
    assert.match(mobileFallback.body, /Send to Mac/);
    checked.push("mobile-fallback");

    await waitForSocketPairing(`${localWsUrl}?pairCode=${encodeURIComponent(cfg.pairCode)}&client=mobile`);
    checked.push("websocket");

    const created = await json(`${localBaseUrl}/api/items/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PocketBridge-Pair-Code": cfg.pairCode
      },
      body: JSON.stringify({
        title: "LAN preflight note",
        text: "Phone-reachable pairing URLs are ready for the live demo.",
        origin: "mobile",
        sourceDevice: "LAN Preflight"
      })
    });
    assert.equal((created.item as JsonObject).origin, "mobile");
    checked.push("text-upload");

    return {
      publicHost,
      pairCode: cfg.pairCode,
      port: cfg.port,
      localBaseUrl,
      advertisedBaseUrl: cfg.serverBaseUrl,
      advertisedWsUrl: cfg.wsUrl,
      macUiUrl: `${cfg.serverBaseUrl}/`,
      mobileFallbackUrl: `${cfg.serverBaseUrl}/mobile.html`,
      lanAddresses: cfg.lanAddresses,
      checked
    };
  } finally {
    await runtime?.close();
    await fs.rm(cfg.dataDir, { recursive: true, force: true });
  }
}
