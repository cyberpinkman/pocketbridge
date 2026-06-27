import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import type { Config } from "../src/config.js";
import { createPocketBridgeRuntime } from "../src/app.js";
import type { PocketBridgeRuntime } from "../src/app.js";

async function testConfig(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-http-"));
  return {
    port: 0,
    dataDir,
    inboxDir: path.join(dataDir, "inbox"),
    metadataPath: path.join(dataDir, "metadata.json"),
    obsidianDir: path.join(dataDir, "obsidian", "PocketBridge"),
    snapzyWatchDir: path.join(dataDir, "watch", "snapzy"),
    pairCode: "123456",
    deviceName: "Test Mac",
    serverBaseUrl: "http://127.0.0.1:0",
    wsUrl: "ws://127.0.0.1:0/ws",
    lanAddresses: ["127.0.0.1"],
    maxUploadBytes: 100 * 1024 * 1024,
    pairingExpiresAt: new Date().toISOString()
  };
}

async function startRuntime(inputConfig?: Config): Promise<{ runtime: PocketBridgeRuntime; config: Config }> {
  const config = inputConfig ?? (await testConfig());
  const runtime = await createPocketBridgeRuntime(config, { watchSnapzy: false });
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address() as AddressInfo;
  config.port = address.port;
  config.serverBaseUrl = `http://127.0.0.1:${address.port}`;
  config.wsUrl = `ws://127.0.0.1:${address.port}/ws`;
  return { runtime, config };
}

function authHeaders(config: Config, json = true): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "X-PocketBridge-Pair-Code": config.pairCode
  };
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  assert.ok(response.ok, `${response.status} ${body}`);
  return JSON.parse(body) as Record<string, unknown>;
}

async function badRequestResponse(response: Response, message: string): Promise<Record<string, unknown>> {
  return await errorResponse(response, 400, "BAD_REQUEST", message);
}

async function errorResponse(
  response: Response,
  status: number,
  code: string,
  message: string
): Promise<Record<string, unknown>> {
  const body = await response.text();
  assert.equal(response.status, status, body);
  const payload = JSON.parse(body) as { error?: { code?: string; message?: string } };
  assert.equal(payload.error?.code, code);
  assert.equal(payload.error?.message, message);
  return payload as Record<string, unknown>;
}

function itemFrom(payload: Record<string, unknown>): Record<string, unknown> {
  assert.equal(typeof payload.item, "object");
  assert.notEqual(payload.item, null);
  return payload.item as Record<string, unknown>;
}

async function nextEvent(socket: WebSocket): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for websocket event")), 2_000);
    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function closeEvent(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for websocket close")), 2_000);
    socket.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test("HTTP API smoke covers pairing, upload, list, share, download, knowledge, archive, delete, and BLE", async () => {
  const { runtime, config } = await startRuntime();
  try {
    const health = await jsonResponse(await fetch(`${config.serverBaseUrl}/health`));
    assert.deepEqual(health, { ok: true, service: "pocketbridge", version: 1 });

    const pairing = await jsonResponse(await fetch(`${config.serverBaseUrl}/api/pairing`));
    assert.equal(pairing.serverBaseUrl, config.serverBaseUrl);
    assert.equal(pairing.wsUrl, config.wsUrl);
    assert.equal(pairing.pairCode, config.pairCode);

    const qr = await fetch(`${config.serverBaseUrl}/api/pairing/qr.svg`);
    const qrBody = await qr.text();
    assert.equal(qr.status, 200);
    assert.match(qr.headers.get("content-type") ?? "", /^image\/svg\+xml/);
    assert.equal(qr.headers.get("cache-control"), "no-store");
    assert.match(qrBody, /^<svg/);

    const unauthorized = await fetch(`${config.serverBaseUrl}/api/items`);
    assert.equal(unauthorized.status, 401);

    const textPayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/text`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({
          title: "Smoke idea",
          text: "Phone to Mac to knowledge.",
          origin: "mobile",
          sourceDevice: "PocketBridge Android",
          tags: ["demo"]
        })
      })
    );
    const textItem = itemFrom(textPayload);
    assert.equal(textItem.kind, "text");
    assert.equal(textItem.origin, "mobile");

    const form = new FormData();
    form.append("file", new Blob(["demo file"], { type: "application/octet-stream" }), "demo.txt");
    form.append("origin", "mobile");
    form.append("sourceDevice", "PocketBridge Android");
    form.append("tags", JSON.stringify(["demo"]));
    const filePayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/upload`, {
        method: "POST",
        headers: authHeaders(config, false),
        body: form
      })
    );
    const fileItem = itemFrom(filePayload);
    assert.equal(fileItem.kind, "file");
    assert.equal(fileItem.mimeType, "text/plain");
    assert.equal(fileItem.originalFilename, "demo.txt");
    assert.equal(typeof fileItem.downloadUrl, "string");

    const listPayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items`, { headers: authHeaders(config, false) })
    );
    const listedItems = listPayload.items as Record<string, unknown>[];
    assert.deepEqual(
      listedItems.map((item) => item.id),
      [fileItem.id, textItem.id]
    );

    const sharedPayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/${fileItem.id}/share-to-mobile`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({ sharedToMobile: true })
      })
    );
    assert.equal(itemFrom(sharedPayload).sharedToMobile, true);

    const sharedList = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items?sharedToMobile=true`, { headers: authHeaders(config, false) })
    );
    assert.deepEqual(
      (sharedList.items as Record<string, unknown>[]).map((item) => item.id),
      [fileItem.id]
    );

    const download = await fetch(`${config.serverBaseUrl}${fileItem.downloadUrl}`, {
      headers: authHeaders(config, false)
    });
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-type") ?? "", /^text\/plain/);
    assert.equal(await download.text(), "demo file");

    const knowledgePayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/knowledge/${textItem.id}`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({ tags: ["pocketbridge"], note: "Saved during HTTP smoke." })
      })
    );
    const knowledgeItem = itemFrom(knowledgePayload);
    assert.equal(knowledgeItem.status, "saved_to_knowledge");
    assert.equal(typeof knowledgeItem.knowledgePath, "string");
    const knowledgePath = path.join(path.dirname(config.dataDir), knowledgeItem.knowledgePath as string);
    assert.match(await fs.readFile(knowledgePath, "utf8"), /Saved during HTTP smoke\./);

    const searchPayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/search?q=Smoke`, { headers: authHeaders(config, false) })
    );
    assert.deepEqual(
      (searchPayload.items as Record<string, unknown>[]).map((item) => item.id),
      [textItem.id]
    );

    const archivedPayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/${textItem.id}/archive`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({ archived: true })
      })
    );
    assert.equal(typeof itemFrom(archivedPayload).archivedAt, "string");

    const hiddenSearch = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/search?q=Smoke`, { headers: authHeaders(config, false) })
    );
    assert.deepEqual(hiddenSearch.items, []);

    const deletedPayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/${fileItem.id}`, {
        method: "DELETE",
        headers: authHeaders(config, false)
      })
    );
    assert.equal(itemFrom(deletedPayload).id, fileItem.id);

    const blePayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/ble/status`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({ status: "trusted", deviceName: "Demo Phone", rssi: -48 })
      })
    );
    assert.equal(blePayload.status, "trusted");
    assert.equal(blePayload.deviceName, "Demo Phone");
  } finally {
    await runtime.close();
  }
});

test("HTTP API rejects invalid boolean and limit parameters", async () => {
  const { runtime, config } = await startRuntime();
  try {
    const textPayload = await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/text`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({
          title: "Validation target",
          text: "Check strict parameters.",
          origin: "mobile",
          sourceDevice: "PocketBridge Android"
        })
      })
    );
    const textItem = itemFrom(textPayload);

    await badRequestResponse(
      await fetch(`${config.serverBaseUrl}/api/items?sharedToMobile=maybe`, {
        headers: authHeaders(config, false)
      }),
      "sharedToMobile must be true or false"
    );
    await badRequestResponse(
      await fetch(`${config.serverBaseUrl}/api/items?includeArchived=yes`, {
        headers: authHeaders(config, false)
      }),
      "includeArchived must be true or false"
    );
    await badRequestResponse(
      await fetch(`${config.serverBaseUrl}/api/items?limit=all`, {
        headers: authHeaders(config, false)
      }),
      "limit must be a positive integer"
    );
    await badRequestResponse(
      await fetch(`${config.serverBaseUrl}/api/items/search?q=Validation&limit=-1`, {
        headers: authHeaders(config, false)
      }),
      "limit must be a positive integer"
    );
    await badRequestResponse(
      await fetch(`${config.serverBaseUrl}/api/items/${textItem.id}/share-to-mobile`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({ sharedToMobile: "later" })
      }),
      "sharedToMobile must be true or false"
    );
    await badRequestResponse(
      await fetch(`${config.serverBaseUrl}/api/items/${textItem.id}/archive`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({ archived: "yes" })
      }),
      "archived must be true or false"
    );
  } finally {
    await runtime.close();
  }
});

test("HTTP API returns contract error codes for auth, missing items, and oversized uploads", async () => {
  const config = await testConfig();
  config.maxUploadBytes = 4;
  const runtimeState = await startRuntime(config);

  try {
    await errorResponse(
      await fetch(`${runtimeState.config.serverBaseUrl}/api/items`),
      401,
      "UNAUTHORIZED",
      "Invalid pair code"
    );
    await errorResponse(
      await fetch(`${runtimeState.config.serverBaseUrl}/api/items/itm_missing`, {
        headers: authHeaders(runtimeState.config, false)
      }),
      404,
      "NOT_FOUND",
      "Item not found"
    );

    const form = new FormData();
    form.append("file", new Blob(["too large"], { type: "text/plain" }), "too-large.txt");
    form.append("origin", "mobile");
    form.append("sourceDevice", "PocketBridge Android");
    await errorResponse(
      await fetch(`${runtimeState.config.serverBaseUrl}/api/items/upload`, {
        method: "POST",
        headers: authHeaders(runtimeState.config, false),
        body: form
      }),
      413,
      "UPLOAD_TOO_LARGE",
      "Upload exceeds configured limit"
    );
  } finally {
    await runtimeState.runtime.close();
  }
});

test("websocket rejects invalid pair codes", async () => {
  const { runtime, config } = await startRuntime();
  const socket = new WebSocket(`${config.wsUrl}?pairCode=000000&client=mobile`);
  try {
    const closed = await closeEvent(socket);
    assert.equal(closed.code, 1008);
    assert.equal(closed.reason, "Invalid pair code");
  } finally {
    socket.close();
    await runtime.close();
  }
});

test("websocket clients receive pairing, item, and BLE events", async () => {
  const { runtime, config } = await startRuntime();
  const socket = new WebSocket(`${config.wsUrl}?pairCode=${config.pairCode}&client=mobile`);
  try {
    const connected = await nextEvent(socket);
    assert.equal(connected.type, "pairing.connected");

    const createdEvent = nextEvent(socket);
    await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/items/text`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({
          title: "Socket idea",
          text: "Broadcast this.",
          origin: "mobile",
          sourceDevice: "PocketBridge Android",
          tags: ["demo"]
        })
      })
    );

    const event = await createdEvent;
    assert.equal(event.type, "item.created");
    assert.equal(typeof event.eventId, "string");
    assert.equal(event.version, 1);

    const bleEvent = nextEvent(socket);
    await jsonResponse(
      await fetch(`${config.serverBaseUrl}/api/ble/status`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({ status: "away", deviceName: "Demo Phone", rssi: -80 })
      })
    );

    const eventPayload = await bleEvent;
    assert.equal(eventPayload.type, "ble.status");
    const data = eventPayload.data as Record<string, unknown>;
    assert.equal(data.status, "away");
    assert.equal(data.deviceName, "Demo Phone");
    assert.equal(data.rssi, -80);
  } finally {
    socket.close();
    await runtime.close();
  }
});
