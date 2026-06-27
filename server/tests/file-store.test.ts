import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import { absoluteStoragePath } from "../src/storage/file-store.js";

async function testConfig(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-files-"));
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

test("absoluteStoragePath only accepts relative paths inside the inbox directory", async () => {
  const config = await testConfig();

  assert.equal(
    absoluteStoragePath(config, "inbox/..safe/original"),
    path.join(config.inboxDir, "..safe", "original")
  );
  assert.throws(() => absoluteStoragePath(config, "../outside.txt"), /Storage path escapes inbox directory/);
  assert.throws(() => absoluteStoragePath(config, "metadata.json"), /Storage path escapes inbox directory/);
  assert.throws(() => absoluteStoragePath(config, path.join(config.inboxDir, "original")), /Storage path escapes inbox directory/);
});
