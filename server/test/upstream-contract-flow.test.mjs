import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import WebSocket from "ws";
import { createApp } from "../../dist/server/src/app.js";
import { config } from "../../dist/server/src/config.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";
import { attachWebsocket } from "../../dist/server/src/websocket/hub.js";

test("upstream contract demo flow runs through QR, /api, /ws, knowledge, and BLE", async () => {
  const originalMetadata = await readMetadata();
  const vaultDir = path.resolve("tmp", "upstream-contract-vault");
  const uploadedPaths = [];
  await fs.rm(vaultDir, { recursive: true, force: true });
  await writeMetadata({ items: [], pairingSessions: [], shares: [] });

  const server = http.createServer(createApp());
  const websocketServer = attachWebsocket(server);
  let client;

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const pairingResponse = await fetch(`${baseUrl}/api/pairing`);
    assert.equal(pairingResponse.status, 200);
    const pairing = await pairingResponse.json();
    assert.equal(pairing.protocol, "pocketbridge");
    assert.match(pairing.pairCode, /^\d{6}$/);
    assert.equal(pairing.wsUrl, `ws://127.0.0.1:${address.port}/ws`);

    const qrResponse = await fetch(`${baseUrl}/api/pairing/qr.svg?pairCode=${pairing.pairCode}`);
    assert.equal(qrResponse.status, 200);
    assert.match(qrResponse.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(await qrResponse.text(), /<svg/);

    const authHeaders = { "X-PocketBridge-Pair-Code": pairing.pairCode };
    const received = [];
    client = new WebSocket(`${pairing.wsUrl}?pairCode=${pairing.pairCode}&client=mobile`);
    client.on("message", (message) => {
      received.push(JSON.parse(String(message)));
    });
    await waitForMessage(received, "pairing.connected");

    const textItem = await postJson(`${baseUrl}/api/items/text`, {
      title: "Contract demo idea",
      text: "PocketBridge can move ideas from phone to Mac knowledge.",
      origin: "mobile",
      sourceDevice: "Contract Phone",
      tags: ["contract", "demo"]
    }, authHeaders);
    assert.equal(textItem.item.origin, "mobile");
    assert.equal(textItem.item.status, "inbox");
    assert.equal(textItem.item.sharedToMobile, false);
    const createdEvent = await waitForMessage(received, "item.created");
    assert.equal(createdEvent.version, 1);
    assert.equal(createdEvent.data.item.id, textItem.item.id);

    const form = new FormData();
    form.set("origin", "mobile");
    form.set("sourceDevice", "Contract Phone");
    form.set("title", "Contract upload");
    form.set("tags", JSON.stringify(["contract", "file"]));
    form.set("file", new Blob(["contract file content"], { type: "text/plain" }), "contract.txt");
    const uploadResponse = await fetch(`${baseUrl}/api/items/upload`, {
      method: "POST",
      headers: authHeaders,
      body: form
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.item.kind, "file");
    assert.equal(uploaded.item.downloadUrl, `/api/items/${uploaded.item.id}/download`);
    const metadataAfterUpload = await readMetadata();
    const uploadedItem = metadataAfterUpload.items.find((item) => item.id === uploaded.item.id);
    if (uploadedItem?.filePath) {
      uploadedPaths.push(uploadedItem.filePath);
    }

    const shared = await postJson(`${baseUrl}/api/items/${uploaded.item.id}/share-to-mobile`, {
      sharedToMobile: true
    }, authHeaders);
    assert.equal(shared.item.sharedToMobile, true);
    const sharedList = await getJson(`${baseUrl}/api/items?sharedToMobile=true`, authHeaders);
    assert.equal(sharedList.items.some((item) => item.id === uploaded.item.id), true);
    await waitForMessage(received, "item.shared");

    const downloadResponse = await fetch(`${baseUrl}${uploaded.item.downloadUrl}`, {
      headers: authHeaders
    });
    assert.equal(downloadResponse.status, 200);
    assert.equal(await downloadResponse.text(), "contract file content");

    const exported = await postJson(`${baseUrl}/api/knowledge/${textItem.item.id}`, {
      vaultDir,
      tags: ["contract", "knowledge"]
    }, authHeaders);
    assert.equal(exported.item.status, "saved_to_knowledge");
    assert.match(
      exported.item.knowledgePath,
      new RegExp(`upstream-contract-vault/inbox/${textItem.item.createdAt.slice(0, 10)}-contract-demo-idea\\.md$`)
    );
    assert.match(await fs.readFile(exported.item.knowledgePath, "utf8"), /PocketBridge can move ideas/);

    const ble = await postJson(`${baseUrl}/api/ble/status`, {
      status: "trusted",
      deviceName: "Contract Phone",
      rssi: -49
    }, authHeaders);
    assert.equal(ble.status, "trusted");
    const bleRead = await getJson(`${baseUrl}/api/ble/status`, authHeaders);
    assert.equal(bleRead.deviceName, "Contract Phone");
  } finally {
    client?.close();
    await new Promise((resolve) => websocketServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    await writeMetadata(originalMetadata);
    await fs.rm(vaultDir, { recursive: true, force: true });
    await Promise.all(uploadedPaths.map((filePath) => fs.rm(filePath, { force: true })));
  }
});

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  return response.json();
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  assert.equal(response.status >= 200 && response.status < 300, true);
  return response.json();
}

async function waitForMessage(received, type) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1000) {
    const match = received.find((message) => message.type === type);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${type}`);
}
