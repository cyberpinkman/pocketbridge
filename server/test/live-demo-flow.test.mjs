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

test("live demo rehearsal covers annotated capture, BLE send, and RSSI PocketKey", async () => {
  const originalMetadata = await readMetadata();
  const vaultDir = path.resolve("tmp", "live-demo-vault");
  const importedPaths = [];
  let client;

  await fs.rm(vaultDir, { recursive: true, force: true });
  await writeMetadata({ items: [], pairingSessions: [], shares: [] });

  const server = http.createServer(createApp());
  const websocketServer = attachWebsocket(server);

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const pairing = await getJson(`${baseUrl}/api/pairing`);
    assert.equal(pairing.protocol, "pocketbridge");
    assert.match(pairing.pairCode, /^\d{6}$/);

    const authHeaders = { "X-PocketBridge-Pair-Code": pairing.pairCode };
    const received = [];
    client = new WebSocket(`${pairing.wsUrl}?pairCode=${pairing.pairCode}&client=mobile`);
    client.on("message", (message) => {
      received.push(JSON.parse(String(message)));
    });
    await waitForMessage(received, "pairing.connected");

    const phoneText = await postJson(`${baseUrl}/api/items/text`, {
      title: "Live demo phone idea",
      text: "Phone capture lands in PocketInbox and becomes knowledge.",
      origin: "mobile",
      sourceDevice: "Live Demo Phone",
      tags: ["live", "phone"]
    }, authHeaders);
    assert.equal(phoneText.item.origin, "mobile");
    await waitForItem(received, phoneText.item.id);

    const fileForm = new FormData();
    fileForm.set("origin", "mobile");
    fileForm.set("sourceDevice", "Live Demo Phone");
    fileForm.set("title", "Live phone file");
    fileForm.set("tags", JSON.stringify(["live", "file"]));
    fileForm.set("file", new Blob(["live demo file"], { type: "text/plain" }), "live-demo.txt");
    const phoneFileResponse = await fetch(`${baseUrl}/api/items/upload`, {
      method: "POST",
      headers: authHeaders,
      body: fileForm
    });
    assert.equal(phoneFileResponse.status, 201);
    const phoneFile = await phoneFileResponse.json();
    assert.equal(phoneFile.item.downloadUrl, `/api/items/${phoneFile.item.id}/download`);
    const metadataAfterPhoneFile = await readMetadata();
    const phoneFileMetadata = metadataAfterPhoneFile.items.find((item) => item.id === phoneFile.item.id);
    if (phoneFileMetadata?.filePath) {
      importedPaths.push(phoneFileMetadata.filePath);
    }

    const downloadResponse = await fetch(`${baseUrl}${phoneFile.item.downloadUrl}`, {
      headers: authHeaders
    });
    assert.equal(downloadResponse.status, 200);
    assert.equal(await downloadResponse.text(), "live demo file");

    const exported = await postJson(`${baseUrl}/api/knowledge/${phoneText.item.id}`, {
      vaultDir,
      tags: ["live", "knowledge"],
      note: "Live demo rehearsal."
    }, authHeaders);
    assert.equal(exported.item.status, "saved_to_knowledge");
    assert.match(await fs.readFile(exported.item.knowledgePath, "utf8"), /Live demo rehearsal/);

    const captureForm = new FormData();
    captureForm.set("origin", "mac");
    captureForm.set("sourceDevice", "PocketBridge Capture");
    captureForm.set("title", "Annotated Capture");
    captureForm.set("tags", JSON.stringify(["capture", "annotation"]));
    captureForm.set("file", new Blob(["annotated capture png"], { type: "image/png" }), "annotated-capture.png");
    const captureResponse = await fetch(`${baseUrl}/api/items/upload`, {
      method: "POST",
      headers: authHeaders,
      body: captureForm
    });
    assert.equal(captureResponse.status, 201);
    const capture = await captureResponse.json();
    assert.equal(capture.item.kind, "image");
    assert.equal(capture.item.sourceDevice, "PocketBridge Capture");
    const metadataAfterCapture = await readMetadata();
    const captureMetadata = metadataAfterCapture.items.find((item) => item.id === capture.item.id);
    if (captureMetadata?.filePath) {
      importedPaths.push(captureMetadata.filePath);
    }

    const bleSend = await postJson(`${baseUrl}/api/ble/send/${capture.item.id}`, {}, authHeaders);
    assert.equal(bleSend.transfer.channel, "ble");
    assert.equal(bleSend.transfer.status, "queued");
    assert.equal(bleSend.item.sharedToMobile, true);
    await waitForMessage(received, "item.shared");
    const sharedItems = await getJson(`${baseUrl}/api/items?sharedToMobile=true`, authHeaders);
    assert.equal(sharedItems.items.some((item) => item.id === capture.item.id), true);

    const unlocked = await postJson(`${baseUrl}/api/ble/rssi`, {
      deviceName: "Live Demo Phone",
      rssi: -49
    }, authHeaders);
    assert.equal(unlocked.status, "trusted");
    assert.equal(unlocked.lockState, "unlocked");

    const locked = await postJson(`${baseUrl}/api/ble/rssi`, {
      deviceName: "Live Demo Phone",
      rssi: -92
    }, authHeaders);
    assert.equal(locked.status, "locked");
    assert.equal(locked.lockState, "locked");
  } finally {
    client?.close();
    await new Promise((resolve) => websocketServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    await writeMetadata(originalMetadata);
    await fs.rm(vaultDir, { recursive: true, force: true });
    await Promise.all(importedPaths.map((filePath) => fs.rm(filePath, { force: true })));
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
  while (Date.now() - startedAt < 1500) {
    const match = received.find((message) => message.type === type);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${type}`);
}

async function waitForItem(received, itemId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1500) {
    const match = received.find((message) => message.data?.item?.id === itemId);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for item ${itemId}`);
}

async function waitForMetadataItem(title) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2500) {
    const metadata = await readMetadata();
    const match = metadata.items.find((item) => item.title === title);
    if (match) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out waiting for ${title}`);
}
