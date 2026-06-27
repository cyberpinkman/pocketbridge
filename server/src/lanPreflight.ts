import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import { WebSocket } from "ws";
import { createApp } from "./app.js";
import { readMetadata, writeMetadata } from "./storage/metadataStore.js";
import { attachWebsocket } from "./websocket/hub.js";

type JsonObject = Record<string, unknown>;

export type LanPreflightOptions = {
  publicHost?: string;
};

export type LanPreflightResult = {
  publicHost: string;
  pairCode: string;
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
  return process.env.PB_PUBLIC_HOST?.trim() || lanIps()[0];
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
      clearTimeout(timer);
      socket.close();
      try {
        const event = JSON.parse(data.toString()) as JsonObject;
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
  const publicHost = options.publicHost?.trim() || defaultPublicHost();
  const originalMetadata = await readMetadata();
  await writeMetadata({ items: [], pairingSessions: [], shares: [] });

  const app = createApp();
  const server = http.createServer(app);
  const websocketServer = attachWebsocket(server);
  const checked: string[] = [];

  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    const localBaseUrl = `http://127.0.0.1:${port}`;
    const localWsUrl = `ws://127.0.0.1:${port}/ws`;
    const advertisedBaseUrl = `http://${publicHost}:${port}`;
    const advertisedWsUrl = `ws://${publicHost}:${port}/ws`;

    const health = await json(`${localBaseUrl}/health`);
    assert.equal(health.ok, true);
    assert.equal(health.service, "pocketbridge");
    checked.push("health");

    const pairing = await json(`${localBaseUrl}/api/pairing`, {
      headers: { "x-forwarded-host": `${publicHost}:${port}` }
    });
    assert.equal(pairing.serverBaseUrl, advertisedBaseUrl);
    assert.equal(pairing.wsUrl, advertisedWsUrl);
    assert.match(String(pairing.pairCode), /^\d{6}$/);
    checked.push("pairing-json");

    const pairCode = String(pairing.pairCode);
    const qr = await text(`${localBaseUrl}/api/pairing/qr.svg?pairCode=${pairCode}`);
    assert.match(qr.contentType, /^image\/svg\+xml/);
    assert.match(qr.body, /^<svg/);
    checked.push("pairing-qr");

    const macUi = await text(`${localBaseUrl}/`);
    assert.match(macUi.body, /PocketBridge/);
    checked.push("mac-ui");

    const mobileFallback = await text(`${localBaseUrl}/mobile.html`);
    assert.match(mobileFallback.body, /Send to Mac/);
    checked.push("mobile-fallback");

    await waitForSocketPairing(`${localWsUrl}?pairCode=${encodeURIComponent(pairCode)}&client=lan-check`);
    checked.push("websocket");

    const created = await json(`${localBaseUrl}/api/items/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PocketBridge-Pair-Code": pairCode
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
      pairCode,
      localBaseUrl,
      advertisedBaseUrl,
      advertisedWsUrl,
      macUiUrl: `${advertisedBaseUrl}/`,
      mobileFallbackUrl: `${advertisedBaseUrl}/mobile.html`,
      lanAddresses: lanIps(),
      checked
    };
  } finally {
    await new Promise<void>((resolve) => websocketServer.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await writeMetadata(originalMetadata);
  }
}
