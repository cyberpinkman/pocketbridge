import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import type { Config } from "../src/config.js";
import { ItemStore } from "../src/storage/item-store.js";
import { startSnapzyWatch } from "../src/watchers/snapzy-watch.js";
import type { WebSocketHub } from "../src/websocket/hub.js";

async function testConfig(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-snapzy-"));
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

async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs = 8000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== undefined) return value;
    await sleep(50);
  }
  throw new Error("Timed out waiting for Snapzy import");
}

test("snapzy watcher imports supported files and broadcasts item.created", async () => {
  const config = await testConfig();
  await fs.mkdir(config.snapzyWatchDir, { recursive: true });

  const store = new ItemStore(config);
  await store.init();

  const events: string[] = [];
  const hub = {
    broadcast(type: string) {
      events.push(type);
    }
  } as unknown as WebSocketHub;

  const watcher = startSnapzyWatch(config, store, hub);
  try {
    await new Promise<void>((resolve) => watcher.on("ready", resolve));
    await fs.writeFile(path.join(config.snapzyWatchDir, "ignore.json"), "{}");
    await sleep(900);
    assert.equal(events.length, 0);

    await fs.writeFile(path.join(config.snapzyWatchDir, "snap.png"), "png");

    await waitFor(async () => (events.includes("item.created") ? true : undefined));
    const item = await waitFor(async () => {
      const items = await store.listItems({ origin: "snapzy" });
      return items[0];
    });

    assert.equal(item.kind, "screenshot");
    assert.equal(item.origin, "snapzy");
    assert.equal(item.sourceDevice, "Test Mac");
    assert.equal(item.mimeType, "image/png");
    assert.equal(item.originalFilename, "snap.png");
    assert.deepEqual(item.tags, ["snapzy"]);
    assert.match(item.storageRelPath ?? "", /^inbox\/\d{4}-\d{2}-\d{2}\/itm_\d+_[a-z0-9]{8}\/original$/);
    assert.deepEqual(events, ["item.created"]);
  } finally {
    await watcher.close();
  }
});
