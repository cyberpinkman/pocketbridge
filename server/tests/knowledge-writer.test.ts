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
  assert.match(markdown, /# Idea from phone/);
  assert.match(markdown, /Turn screenshots into a personal knowledge stream\./);
  assert.match(markdown, /Imported live\./);
});
