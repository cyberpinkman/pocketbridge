import { strict as assert } from "node:assert";
import http from "node:http";
import test from "node:test";
import WebSocket from "ws";
import { attachWebsocket, broadcast } from "../../dist/server/src/websocket/hub.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("broadcast sends bridge events to connected websocket clients", async () => {
  const server = http.createServer();
  const websocketServer = attachWebsocket(server);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  const received = [];
  const client = new WebSocket(`ws://127.0.0.1:${address.port}/events`);
  client.on("message", (message) => {
    received.push(JSON.parse(String(message)));
  });

  await waitForMessage(received, "bridge.connected");

  broadcast({
    type: "item.created",
    item: {
      id: "test-item",
      kind: "text",
      source: "phone",
      title: "Realtime test",
      createdAt: "2026-06-27T00:00:00.000Z",
      text: "Realtime test",
      status: "inbox"
    }
  });

  const itemEvent = await waitForMessage(received, "item.created");
  assert.equal(itemEvent.item.id, "test-item");

  client.close();
  await new Promise((resolve) => websocketServer.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

test("/ws sends upstream event envelopes to paired clients", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  const server = http.createServer();
  const websocketServer = attachWebsocket(server);

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    const received = [];
    const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws?pairCode=123456&client=mobile`);
    client.on("message", (message) => {
      received.push(JSON.parse(String(message)));
    });

    const connected = await waitForMessage(received, "pairing.connected");
    assert.equal(connected.version, 1);
    assert.match(connected.eventId, /^evt_/);
    assert.ok(connected.sentAt);
    assert.equal(connected.data.client, "mobile");

    broadcast({
      type: "item.created",
      item: {
        id: "test-upstream-item",
        kind: "document",
        source: "phone",
        title: "Upstream realtime test",
        createdAt: "2026-06-27T00:00:00.000Z",
        filePath: `${process.cwd()}/data/inbox/realtime-upload.txt`,
        originalName: "realtime-upload.txt",
        status: "inbox",
        tags: ["realtime"],
        sourceDevice: "Demo Phone"
      }
    });

    const itemEvent = await waitForMessage(received, "item.created");
    assert.equal(itemEvent.version, 1);
    assert.match(itemEvent.eventId, /^evt_/);
    assert.equal(itemEvent.data.item.id, "test-upstream-item");
    assert.equal(itemEvent.data.item.kind, "file");
    assert.equal(itemEvent.data.item.origin, "mobile");
    assert.equal(itemEvent.data.item.sourceDevice, "Demo Phone");
    assert.equal(itemEvent.data.item.storageRelPath, "inbox/realtime-upload.txt");
    assert.equal(itemEvent.data.item.storageRelPath.includes(process.cwd()), false);
    assert.deepEqual(itemEvent.data.item.tags, ["realtime"]);
    assert.equal(itemEvent.data.item.status, "inbox");
    assert.equal(itemEvent.data.item.sharedToMobile, false);

    broadcast({
      type: "knowledge.saved",
      item: {
        id: "saved-upstream-item",
        kind: "text",
        source: "phone",
        title: "Saved realtime test",
        createdAt: "2026-06-27T00:00:00.000Z",
        status: "exported",
        knowledgeTarget: "/tmp/pocketbridge-vault/inbox/saved-realtime-test.md",
        sourceDevice: "Demo Phone"
      }
    });

    const knowledgeEvent = await waitForMessage(received, "knowledge.saved");
    assert.equal(knowledgeEvent.version, 1);
    assert.equal(knowledgeEvent.data.item.id, "saved-upstream-item");
    assert.equal(knowledgeEvent.data.item.status, "saved_to_knowledge");
    assert.equal(knowledgeEvent.data.item.knowledgePath, "/tmp/pocketbridge-vault/inbox/saved-realtime-test.md");

    broadcast({
      type: "item.deleted",
      item: {
        id: "deleted-upstream-item",
        kind: "text",
        source: "phone",
        title: "Deleted realtime test",
        createdAt: "2026-06-27T00:00:00.000Z",
        status: "inbox",
        sourceDevice: "Demo Phone"
      }
    });

    const deletedEvent = await waitForMessage(received, "item.deleted");
    assert.equal(deletedEvent.version, 1);
    assert.deepEqual(deletedEvent.data.item, { id: "deleted-upstream-item" });

    client.close();
  } finally {
    await writeMetadata(originalMetadata);
    await new Promise((resolve) => websocketServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});

test("/ws rejects missing or invalid upstream client roles", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  const server = http.createServer();
  const websocketServer = attachWebsocket(server);

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    const missingClient = new WebSocket(`ws://127.0.0.1:${address.port}/ws?pairCode=123456`);
    const missingClose = await waitForClose(missingClient);
    assert.equal(missingClose.code, 1008);
    assert.equal(missingClose.reason, "Invalid client");

    const invalidClient = new WebSocket(`ws://127.0.0.1:${address.port}/ws?pairCode=123456&client=lan-check`);
    const invalidClose = await waitForClose(invalidClient);
    assert.equal(invalidClose.code, 1008);
    assert.equal(invalidClose.reason, "Invalid client");
  } finally {
    await writeMetadata(originalMetadata);
    await new Promise((resolve) => websocketServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }
});

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

async function waitForClose(client) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.close();
      reject(new Error("Timed out waiting for websocket close"));
    }, 1000);

    client.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });

    client.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
