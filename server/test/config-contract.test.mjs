import { strict as assert } from "node:assert";
import path from "node:path";
import test from "node:test";

test("config defaults to upstream server, data, Snapzy, and Obsidian paths", async () => {
  const config = await loadConfigWithEnv({});

  assert.equal(config.port, 3000);
  assert.equal(config.publicHost, undefined);
  assert.equal(config.dataDir, path.resolve("data"));
  assert.equal(config.inboxDir, path.resolve("data", "inbox"));
  assert.equal(config.metadataPath, path.resolve("data", "metadata.json"));
  assert.equal(config.snapzyWatchDir, path.resolve("data", "watch", "snapzy"));
  assert.equal(config.legacySnapzyInboxDir, path.resolve("integrations", "snapzy", "inbox"));
  assert.equal(config.obsidianDir, path.resolve("data", "obsidian", "PocketBridge"));
  assert.equal(config.maxUploadBytes, 100 * 1024 * 1024);
});

test("config accepts upstream PB_* environment overrides while preserving old port env", async () => {
  const dataDir = path.resolve("tmp", "pb-data-contract");
  const config = await loadConfigWithEnv({
    PORT: "3111",
    PB_DATA_DIR: dataDir,
    PB_SNAPZY_WATCH_DIR: path.join(dataDir, "snapzy-custom"),
    PB_OBSIDIAN_DIR: path.join(dataDir, "obsidian-custom"),
    PB_MAX_UPLOAD_MB: "12",
    PB_PUBLIC_HOST: "192.168.1.50"
  });

  assert.equal(config.port, 3111);
  assert.equal(config.publicHost, "192.168.1.50");
  assert.equal(config.dataDir, dataDir);
  assert.equal(config.inboxDir, path.join(dataDir, "inbox"));
  assert.equal(config.metadataPath, path.join(dataDir, "metadata.json"));
  assert.equal(config.snapzyWatchDir, path.join(dataDir, "snapzy-custom"));
  assert.equal(config.obsidianDir, path.join(dataDir, "obsidian-custom"));
  assert.equal(config.maxUploadBytes, 12 * 1024 * 1024);

  const legacyPortConfig = await loadConfigWithEnv({
    PORT: "3111",
    POCKETBRIDGE_PORT: "4317"
  });
  assert.equal(legacyPortConfig.port, 4317);

  const invalidUploadLimitConfig = await loadConfigWithEnv({
    PB_MAX_UPLOAD_MB: "not-a-number"
  });
  assert.equal(invalidUploadLimitConfig.maxUploadBytes, 100 * 1024 * 1024);

  const nonPositiveUploadLimitConfig = await loadConfigWithEnv({
    PB_MAX_UPLOAD_MB: "0"
  });
  assert.equal(nonPositiveUploadLimitConfig.maxUploadBytes, 100 * 1024 * 1024);
});

async function loadConfigWithEnv(env) {
  const originalEnv = { ...process.env };
  for (const key of [
    "PORT",
    "POCKETBRIDGE_PORT",
    "PB_DATA_DIR",
    "PB_SNAPZY_WATCH_DIR",
    "PB_OBSIDIAN_DIR",
    "PB_MAX_UPLOAD_MB",
    "PB_PUBLIC_HOST"
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  try {
    const moduleUrl = new URL(
      `../../dist/server/src/config.js?case=${Date.now()}-${Math.random()}`,
      import.meta.url
    );
    return (await import(moduleUrl.href)).config;
  } finally {
    process.env = originalEnv;
  }
}
