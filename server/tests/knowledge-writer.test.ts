import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import type { PocketItem } from "../src/types.js";
import { writeKnowledgeMarkdown } from "../src/storage/knowledge-writer.js";

async function testConfig(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-knowledge-"));
  return {
    port: 3000,
    dataDir,
    inboxDir: path.join(dataDir, "inbox"),
    metadataPath: path.join(dataDir, "metadata.json"),
    obsidianDir: path.join(dataDir, "obsidian", "PocketBridge"),
    snapzyWatchDir: path.join(dataDir, "watch", "snapzy"),
    pairCode: "123456",
    deviceName: "Test Mac",
    serverBaseUrl: "http://127.0.0.1:3000",
    wsUrl: "ws://127.0.0.1:3000/ws",
    lanAddresses: ["127.0.0.1"],
    maxUploadBytes: 100 * 1024 * 1024,
    pairingExpiresAt: new Date().toISOString()
  };
}

test("writes markdown with frontmatter and item text", async () => {
  const config = await testConfig();
  const item: PocketItem = {
    id: "itm_1782547200000_a9f4c21b",
    kind: "text",
    title: "Idea from phone",
    origin: "mobile",
    sourceDevice: "iPhone",
    text: "Turn screenshots into a personal knowledge stream.",
    tags: ["idea"],
    sharedToMobile: false,
    status: "inbox",
    createdAt: "2026-06-27T12:00:00.000Z",
    updatedAt: "2026-06-27T12:00:00.000Z"
  };

  const target = await writeKnowledgeMarkdown(config, item, { tags: ["demo"], note: "Imported live." });
  const markdown = await fs.readFile(target, "utf8");

  assert.match(target, /2026-\d{2}-\d{2}-idea-from-phone-itm_1782547200000_a9f4c21b\.md$/);
  assert.match(markdown, /id: "itm_1782547200000_a9f4c21b"/);
  assert.match(markdown, /updatedAt: "2026-06-27T12:00:00\.000Z"/);
  assert.match(markdown, /  - "idea"/);
  assert.match(markdown, /  - "demo"/);
  assert.match(markdown, /  - "text"/);
  assert.match(markdown, /  - "mobile"/);
  assert.match(markdown, /# Idea from phone/);
  assert.match(markdown, /Turn screenshots into a personal knowledge stream\./);
  assert.match(markdown, /## Summary\n\nPending summary\./);
  assert.match(markdown, /Imported live\./);
});

test("file item markdown preserves source metadata and links the copied file", async () => {
  const config = await testConfig();
  const storageRelPath = "inbox/2026-06-27/itm_1782547200000_b7e2c31a/original";
  await fs.mkdir(path.join(config.dataDir, path.dirname(storageRelPath)), { recursive: true });
  await fs.writeFile(path.join(config.dataDir, storageRelPath), "png");

  const item: PocketItem = {
    id: "itm_1782547200000_b7e2c31a",
    kind: "image",
    title: "Receipt [June]\n2026",
    origin: "mobile",
    sourceDevice: "Android",
    mimeType: "image/png",
    sizeBytes: 481223,
    originalFilename: "receipt|demo.png",
    storageRelPath,
    tags: ["receipt:demo"],
    sharedToMobile: false,
    status: "inbox",
    createdAt: "2026-06-27T12:00:00.000Z",
    updatedAt: "2026-06-27T12:00:00.000Z"
  };

  const target = await writeKnowledgeMarkdown(config, item, { tags: ["mobile upload"] });
  const markdown = await fs.readFile(target, "utf8");

  assert.match(markdown, /kind: "image"/);
  assert.match(markdown, /mimeType: "image\/png"/);
  assert.match(markdown, /sizeBytes: 481223/);
  assert.match(markdown, /originalFilename: "receipt\|demo\.png"/);
  assert.match(markdown, /storageRelPath: "inbox\/2026-06-27\/itm_1782547200000_b7e2c31a\/original"/);
  assert.match(markdown, /  - "receipt:demo"/);
  assert.match(markdown, /  - "mobile upload"/);
  assert.match(markdown, /  - "image"/);
  assert.match(markdown, /  - "mobile"/);
  assert.match(markdown, /# Receipt \[June\] 2026/);
  assert.match(markdown, /File: inbox\/2026-06-27\/itm_1782547200000_b7e2c31a\/original/);
  assert.match(markdown, /\[\[attachments\/itm_1782547200000_b7e2c31a-receipt-demo\.png\|receipt-demo\.png\]\]/);

  const attachment = path.join(config.obsidianDir, "attachments", "itm_1782547200000_b7e2c31a-receipt-demo.png");
  assert.equal(await fs.readFile(attachment, "utf8"), "png");
});

test("repeated exports create a new note instead of overwriting", async () => {
  const config = await testConfig();
  const item: PocketItem = {
    id: "itm_1782547200000_a9f4c21b",
    kind: "text",
    title: "Idea from phone",
    origin: "mobile",
    sourceDevice: "iPhone",
    text: "First body.",
    tags: [],
    sharedToMobile: false,
    status: "inbox",
    createdAt: "2026-06-27T12:00:00.000Z",
    updatedAt: "2026-06-27T12:00:00.000Z"
  };

  const first = await writeKnowledgeMarkdown(config, item, { note: "first" });
  const second = await writeKnowledgeMarkdown(config, item, { note: "second" });

  assert.notEqual(first, second);
  assert.match(path.basename(second), /-2\.md$/);
  assert.match(await fs.readFile(first, "utf8"), /first/);
  assert.match(await fs.readFile(second, "utf8"), /second/);
});
