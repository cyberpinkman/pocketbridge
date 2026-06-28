import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import WebSocket from "ws";
import { createApp } from "../../dist/server/src/app.js";
import { config } from "../../dist/server/src/config.js";
import { exportItemToMarkdown } from "../../dist/server/src/integrations/knowledgeBase.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";
import { attachWebsocket } from "../../dist/server/src/websocket/hub.js";

test("POST /export/:itemId copies file assets and marks the item exported", async () => {
  const originalMetadata = await readMetadata();
  const sourceFile = path.join(config.inboxDir, "knowledge-export-source.txt");
  const vaultDir = path.resolve("tmp", "test-knowledge-vault");
  await fs.mkdir(config.inboxDir, { recursive: true });
  await fs.writeFile(sourceFile, "knowledge asset");
  await fs.rm(vaultDir, { recursive: true, force: true });
  await writeMetadata({
    items: [
      {
        id: "knowledge-item",
        kind: "document",
        source: "snapzy",
        title: "Knowledge Export Source",
        createdAt: "2026-06-27T00:00:00.000Z",
        originalName: "knowledge-export-source.txt",
        mimeType: "text/plain",
        size: 15,
        filePath: sourceFile,
        status: "inbox"
      }
    ],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/export/knowledge-item`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultDir })
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.item.status, "exported");
      assert.match(body.outputPath, /tmp\/test-knowledge-vault\/inbox\/2026-06-27-knowledge-export-source-knowledge-item\.md$/);
      assert.match(body.assetPath, /tmp\/test-knowledge-vault\/assets\/pocketbridge\/knowledge-item-knowledge-export-source\.txt$/);

      const markdown = await fs.readFile(body.outputPath, "utf8");
      assert.match(markdown, /## Summary/);
      assert.match(markdown, /Knowledge Export Source captured from snapzy \/ Snapzy\./);
      assert.match(markdown, /## Content/);
      assert.match(markdown, /\[\[\.{2}\/assets\/pocketbridge\/knowledge-item-knowledge-export-source\.txt\]\]/);
      assert.equal(await fs.readFile(body.assetPath, "utf8"), "knowledge asset");

      const metadata = await readMetadata();
      assert.equal(metadata.items[0].status, "exported");
      assert.equal(metadata.items[0].knowledgeTarget, body.outputPath);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(sourceFile, { force: true });
    await fs.rm(vaultDir, { recursive: true, force: true });
  }
});

test("exportItemToMarkdown writes unique filenames and YAML-safe frontmatter", async () => {
  const vaultDir = path.resolve("tmp", "test-knowledge-safe-vault");
  await fs.rm(vaultDir, { recursive: true, force: true });

  try {
    const baseItem = {
      kind: "text",
      source: "phone",
      title: "Idea: alpha\nnext",
      createdAt: "2026-06-27T00:00:00.000Z",
      text: "Knowledge body",
      status: "inbox",
      sourceDevice: "Demo: Phone\nOne",
      tags: ["demo: tag", "multi\nline", ""]
    };

    const first = await exportItemToMarkdown({ ...baseItem, id: "same-title-a" }, { vaultDir });
    const second = await exportItemToMarkdown({ ...baseItem, id: "same-title-b" }, { vaultDir });

    assert.notEqual(first.outputPath, second.outputPath);
    assert.match(path.basename(first.outputPath), /^2026-06-27-idea-alpha-next-same-title-a\.md$/);
    assert.match(path.basename(second.outputPath), /^2026-06-27-idea-alpha-next-same-title-b\.md$/);

    const markdown = await fs.readFile(first.outputPath, "utf8");
    assert.match(markdown, /title: "Idea: alpha next"/);
    assert.match(markdown, /sourceDevice: "Demo: Phone One"/);
    assert.match(markdown, /tags:\n  - "demo: tag"\n  - "multi line"/);
    assert.doesNotMatch(markdown, /  - ""/);
    assert.match(markdown, /^# Idea: alpha next$/m);
  } finally {
    await fs.rm(vaultDir, { recursive: true, force: true });
  }
});

test("POST /export/:itemId broadcasts item.updated and knowledge.saved after exporting", async () => {
  const originalMetadata = await readMetadata();
  const sourceFile = path.join(config.inboxDir, "knowledge-export-broadcast.txt");
  const vaultDir = path.resolve("tmp", "test-knowledge-broadcast-vault");
  await fs.mkdir(config.inboxDir, { recursive: true });
  await fs.writeFile(sourceFile, "broadcast asset");
  await fs.rm(vaultDir, { recursive: true, force: true });
  await writeMetadata({
    items: [
      {
        id: "knowledge-broadcast-item",
        kind: "document",
        source: "snapzy",
        title: "Knowledge Export Broadcast",
        createdAt: "2026-06-27T00:00:00.000Z",
        originalName: "knowledge-export-broadcast.txt",
        mimeType: "text/plain",
        size: 15,
        filePath: sourceFile,
        status: "inbox"
      }
    ],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    const websocketServer = attachWebsocket(server);
    const received = [];
    let client;
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      client = new WebSocket(`ws://127.0.0.1:${address.port}/events`);
      client.on("message", (message) => {
        received.push(JSON.parse(String(message)));
      });
      await waitForMessage(received, "bridge.connected");

      const response = await fetch(`http://127.0.0.1:${address.port}/export/knowledge-broadcast-item`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultDir })
      });
      assert.equal(response.status, 200);

      const event = await waitForMessage(received, "item.updated");
      assert.equal(event.item.id, "knowledge-broadcast-item");
      assert.equal(event.item.status, "exported");
      assert.match(event.item.knowledgeTarget, /test-knowledge-broadcast-vault/);

      const savedEvent = await waitForMessage(received, "knowledge.saved");
      assert.equal(savedEvent.item.id, "knowledge-broadcast-item");
      assert.equal(savedEvent.item.status, "exported");
      assert.match(savedEvent.item.knowledgeTarget, /test-knowledge-broadcast-vault/);
    } finally {
      client?.close();
      await new Promise((resolve) => websocketServer.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(sourceFile, { force: true });
    await fs.rm(vaultDir, { recursive: true, force: true });
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
