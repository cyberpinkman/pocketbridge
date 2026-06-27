import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Config } from "../src/config.js";
import { ItemStore } from "../src/storage/item-store.js";

async function testConfig(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-store-"));
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

test("text items persist and reload from disk", async () => {
  const config = await testConfig();
  const store = new ItemStore(config);
  await store.init();

  const created = await store.createTextItem({
    title: "Demo idea",
    text: "Bridge phone ideas into the Mac knowledge base.",
    origin: "mobile",
    sourceDevice: "iPhone",
    tags: ["idea"]
  });

  const reloaded = new ItemStore(config);
  await reloaded.init();
  const item = await reloaded.getItem(created.id);

  assert.equal(item?.title, "Demo idea");
  assert.equal(item?.text, "Bridge phone ideas into the Mac knowledge base.");
  assert.deepEqual(item?.tags, ["idea"]);
});

test("uploaded files get date-based storage paths and download URLs", async () => {
  const config = await testConfig();
  const store = new ItemStore(config);
  await store.init();

  const item = await store.createUploadedFileItem({
    originalFilename: "shot.png",
    mimeType: "image/png",
    buffer: Buffer.from("png"),
    origin: "mobile",
    sourceDevice: "iPhone"
  });

  assert.equal(item.kind, "image");
  assert.match(item.storageRelPath ?? "", /^inbox\/\d{4}-\d{2}-\d{2}\/itm_\d+_[a-z0-9]{8}\/original$/);
  assert.equal(item.downloadUrl, `/api/items/${item.id}/download`);
});

test("uploaded file items write sidecar metadata in the item directory", async () => {
  const config = await testConfig();
  const store = new ItemStore(config);
  await store.init();

  const item = await store.createUploadedFileItem({
    originalFilename: "document.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("pdf"),
    origin: "mac",
    sourceDevice: "Mac",
    sharedToMobile: true
  });

  assert.ok(item.storageRelPath);
  const metadataPath = path.join(config.dataDir, path.dirname(item.storageRelPath), "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as { item: { id: string; downloadUrl?: string } };

  assert.equal(metadata.item.id, item.id);
  assert.equal(metadata.item.downloadUrl, `/api/items/${item.id}/download`);
});

test("metadata writes keep a backup and recover from a corrupt primary file", async () => {
  const config = await testConfig();
  const store = new ItemStore(config);
  await store.init();

  const first = await store.createTextItem({
    title: "First",
    text: "One",
    origin: "mobile",
    sourceDevice: "Phone"
  });
  await store.createTextItem({
    title: "Second",
    text: "Two",
    origin: "mobile",
    sourceDevice: "Phone"
  });

  const backupPath = `${config.metadataPath}.bak`;
  const backup = JSON.parse(await fs.readFile(backupPath, "utf8")) as { items: Array<{ id: string }> };
  assert.equal(backup.items[0].id, first.id);

  await fs.writeFile(config.metadataPath, "{corrupt", "utf8");
  const recovered = new ItemStore(config);
  await recovered.init();

  const item = await recovered.getItem(first.id);
  assert.equal(item?.title, "First");

  const backupAfterRecovery = JSON.parse(await fs.readFile(backupPath, "utf8")) as { items: Array<{ id: string }> };
  assert.equal(backupAfterRecovery.items[0].id, first.id);
});
