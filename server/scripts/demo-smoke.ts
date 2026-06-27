import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { WebSocket } from "ws";
import type { Config } from "../src/config.js";
import { createPocketBridgeRuntime } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function config(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-demo-smoke-"));
  return {
    port: 0,
    dataDir,
    inboxDir: path.join(dataDir, "inbox"),
    metadataPath: path.join(dataDir, "metadata.json"),
    obsidianDir: path.join(dataDir, "obsidian", "PocketBridge"),
    snapzyWatchDir: path.join(dataDir, "watch", "snapzy"),
    pairCode: "123456",
    deviceName: "Demo Mac",
    serverBaseUrl: "http://127.0.0.1:0",
    wsUrl: "ws://127.0.0.1:0/ws",
    lanAddresses: ["127.0.0.1"],
    maxUploadBytes: 100 * 1024 * 1024,
    pairingExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

function authHeaders(cfg: Config, json = true): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "X-PocketBridge-Pair-Code": cfg.pairCode
  };
}

async function json(cfg: Config, pathOrUrl: string, options: RequestInit = {}): Promise<JsonObject> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${cfg.serverBaseUrl}${pathOrUrl}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      "X-PocketBridge-Pair-Code": cfg.pairCode
    }
  });
  const body = await response.text();
  assert.ok(response.ok, `${options.method ?? "GET"} ${url} failed: ${response.status} ${body}`);
  return JSON.parse(body) as JsonObject;
}

function itemFrom(payload: JsonObject): JsonObject {
  assert.equal(typeof payload.item, "object");
  assert.notEqual(payload.item, null);
  return payload.item as JsonObject;
}

function itemsFrom(payload: JsonObject): JsonObject[] {
  assert.ok(Array.isArray(payload.items), "Response must contain items[]");
  return payload.items as JsonObject[];
}

async function waitFor<T>(read: () => Promise<T | undefined>, label: string, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function nextEvent(socket: WebSocket, expectedType: string): Promise<JsonObject> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), 5_000);
    socket.on("message", function onMessage(data) {
      const event = JSON.parse(data.toString()) as JsonObject;
      if (event.type !== expectedType) return;
      socket.off("message", onMessage);
      clearTimeout(timer);
      resolve(event);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function waitForWatcherReady(watcher: NonNullable<Awaited<ReturnType<typeof createPocketBridgeRuntime>>["watcher"]>): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve) => watcher.once("ready", resolve)),
    sleep(2_000).then(() => undefined)
  ]);
}

function log(message: string): void {
  console.log(`[demo-smoke] ${message}`);
}

const cfg = await config();
const runtime = await createPocketBridgeRuntime(cfg);
const socketEvents: JsonObject[] = [];
let socket: WebSocket | undefined;

try {
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address() as AddressInfo;
  cfg.port = address.port;
  cfg.serverBaseUrl = `http://127.0.0.1:${address.port}`;
  cfg.wsUrl = `ws://127.0.0.1:${address.port}/ws`;

  log(`server ${cfg.serverBaseUrl}`);
  log(`data ${cfg.dataDir}`);

  const health = await json(cfg, "/health");
  assert.deepEqual(health, { ok: true, service: "pocketbridge", version: 1 });
  log("health ok");

  const pairing = await json(cfg, "/api/pairing");
  assert.equal(pairing.serverBaseUrl, cfg.serverBaseUrl);
  assert.equal(pairing.wsUrl, cfg.wsUrl);
  assert.equal(pairing.pairCode, cfg.pairCode);
  log("pairing ok");

  const macHtml = await fetch(`${cfg.serverBaseUrl}/`).then((response) => response.text());
  assert.match(macHtml, /PocketInbox/);
  const mobileHtml = await fetch(`${cfg.serverBaseUrl}/mobile.html`).then((response) => response.text());
  assert.match(mobileHtml, /Send to Mac/);

  socket = new WebSocket(`${cfg.wsUrl}?pairCode=${cfg.pairCode}&client=mobile`);
  socket.on("message", (data) => socketEvents.push(JSON.parse(data.toString()) as JsonObject));
  await nextEvent(socket, "pairing.connected");

  const createdEvent = nextEvent(socket, "item.created");
  const textItem = itemFrom(
    await json(cfg, "/api/items/text", {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify({
        title: "Demo idea",
        text: "Phone to Mac to knowledge.",
        origin: "mobile",
        sourceDevice: "Demo Phone",
        tags: ["demo"]
      })
    })
  );
  await createdEvent;
  assert.equal(textItem.origin, "mobile");
  log("text upload ok");

  const uploadForm = new FormData();
  uploadForm.append("file", new Blob(["demo file"], { type: "text/plain" }), "demo.txt");
  uploadForm.append("origin", "mobile");
  uploadForm.append("sourceDevice", "Demo Phone");
  uploadForm.append("tags", JSON.stringify(["demo"]));
  const fileItem = itemFrom(
    await json(cfg, "/api/items/upload", {
      method: "POST",
      headers: authHeaders(cfg, false),
      body: uploadForm
    })
  );
  assert.equal(fileItem.originalFilename, "demo.txt");
  log("file upload ok");

  const knowledgeItem = itemFrom(
    await json(cfg, `/api/knowledge/${textItem.id}`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify({ tags: ["pocketbridge", "demo"], note: "Saved during demo smoke." })
    })
  );
  assert.equal(knowledgeItem.status, "saved_to_knowledge");
  const knowledgePath = path.join(path.dirname(cfg.dataDir), knowledgeItem.knowledgePath as string);
  assert.match(await fs.readFile(knowledgePath, "utf8"), /Saved during demo smoke\./);
  log("knowledge export ok");

  assert.ok(runtime.watcher, "Snapzy watcher must be running for demo smoke");
  await waitForWatcherReady(runtime.watcher);
  await fs.writeFile(path.join(cfg.snapzyWatchDir, "snapzy-demo.png"), "png");
  const snapzyItem = await waitFor(async () => {
    const payload = await json(cfg, "/api/items?origin=snapzy");
    return itemsFrom(payload)[0];
  }, "Snapzy import");
  assert.equal(snapzyItem.origin, "snapzy");
  log("snapzy import ok");

  await json(cfg, `/api/items/${snapzyItem.id}/share-to-mobile`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ sharedToMobile: true })
  });
  const sharedItems = itemsFrom(await json(cfg, "/api/items?sharedToMobile=true"));
  assert.ok(sharedItems.some((item) => item.id === snapzyItem.id));
  log("share back ok");

  const download = await fetch(`${cfg.serverBaseUrl}${snapzyItem.downloadUrl}`, {
    headers: authHeaders(cfg, false)
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "png");

  const searchItems = itemsFrom(await json(cfg, "/api/items/search?q=demo"));
  assert.ok(searchItems.length >= 2);

  const archived = itemFrom(
    await json(cfg, `/api/items/${fileItem.id}/archive`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify({ archived: true })
    })
  );
  assert.equal(typeof archived.archivedAt, "string");

  await json(cfg, `/api/items/${fileItem.id}/archive`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ archived: false })
  });

  const deleted = itemFrom(
    await json(cfg, `/api/items/${fileItem.id}`, {
      method: "DELETE",
      headers: authHeaders(cfg, false)
    })
  );
  assert.equal(deleted.id, fileItem.id);

  const trusted = await json(cfg, "/api/ble/status", {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ status: "trusted", deviceName: "Demo Phone", rssi: -48 })
  });
  assert.equal(trusted.status, "trusted");
  const away = await json(cfg, "/api/ble/status", {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({ status: "away", deviceName: "Demo Phone" })
  });
  assert.equal(away.status, "away");
  log("ble status ok");

  assert.ok(socketEvents.some((event) => event.type === "item.created"));
  log("Pair -> Upload -> Inbox -> Knowledge -> Snapzy -> Share back -> BLE passed");
} finally {
  socket?.close();
  await runtime.close();
  await fs.rm(cfg.dataDir, { recursive: true, force: true });
}
