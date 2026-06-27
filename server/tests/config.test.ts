import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureRuntimeDirs, loadConfig, pairingPayload } from "../src/config.js";

const envKeys = [
  "PORT",
  "PB_DATA_DIR",
  "PB_PUBLIC_HOST",
  "PB_SERVER_BASE_URL",
  "PB_WS_URL",
  "PB_OBSIDIAN_DIR",
  "PB_SNAPZY_WATCH_DIR",
  "PB_PAIR_CODE",
  "PB_DEVICE_NAME",
  "PB_MAX_UPLOAD_MB"
] as const;

type EnvKey = (typeof envKeys)[number];

async function withEnv<T>(values: Partial<Record<EnvKey, string>>, run: () => Promise<T> | T): Promise<T> {
  const previous = new Map<EnvKey, string | undefined>();
  for (const key of envKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values) as Array<[EnvKey, string]>) {
    process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("loadConfig maps runtime env overrides into the shared contract fields", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-config-data-"));
  const obsidianDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-vault-"));
  const snapzyWatchDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-snapzy-"));

  await withEnv(
    {
      PORT: "4123",
      PB_DATA_DIR: dataDir,
      PB_PUBLIC_HOST: "10.0.0.23",
      PB_OBSIDIAN_DIR: obsidianDir,
      PB_SNAPZY_WATCH_DIR: snapzyWatchDir,
      PB_PAIR_CODE: "654321",
      PB_DEVICE_NAME: "Demo Mac",
      PB_MAX_UPLOAD_MB: "5"
    },
    () => {
      const config = loadConfig();

      assert.equal(config.port, 4123);
      assert.equal(config.dataDir, dataDir);
      assert.equal(config.inboxDir, path.join(dataDir, "inbox"));
      assert.equal(config.metadataPath, path.join(dataDir, "metadata.json"));
      assert.equal(config.obsidianDir, obsidianDir);
      assert.equal(config.snapzyWatchDir, snapzyWatchDir);
      assert.equal(config.pairCode, "654321");
      assert.equal(config.deviceName, "Demo Mac");
      assert.equal(config.serverBaseUrl, "http://10.0.0.23:4123");
      assert.equal(config.wsUrl, "ws://10.0.0.23:4123/ws");
      assert.equal(config.maxUploadBytes, 5 * 1024 * 1024);
      assert.match(config.pairingExpiresAt, /^\d{4}-\d{2}-\d{2}T/);
    }
  );
});

test("explicit server and websocket URL overrides take precedence over public host", async () => {
  await withEnv(
    {
      PORT: "3000",
      PB_PUBLIC_HOST: "10.0.0.23",
      PB_SERVER_BASE_URL: "http://demo.local:7777",
      PB_PAIR_CODE: "123456"
    },
    () => {
      const config = loadConfig();

      assert.equal(config.serverBaseUrl, "http://demo.local:7777");
      assert.equal(config.wsUrl, "ws://demo.local:7777/ws");
    }
  );

  await withEnv(
    {
      PORT: "3000",
      PB_PUBLIC_HOST: "10.0.0.23",
      PB_SERVER_BASE_URL: "http://demo.local:7777",
      PB_WS_URL: "wss://demo.local/ws",
      PB_PAIR_CODE: "123456"
    },
    () => {
      assert.equal(loadConfig().wsUrl, "wss://demo.local/ws");
    }
  );
});

test("loadConfig generates a six digit pair code when no override is set", async () => {
  await withEnv({}, () => {
    assert.match(loadConfig().pairCode, /^\d{6}$/);
  });
});

test("invalid numeric env values fall back to safe defaults", async () => {
  await withEnv(
    {
      PORT: "not-a-port",
      PB_MAX_UPLOAD_MB: "not-a-size",
      PB_PAIR_CODE: "123456"
    },
    () => {
      const config = loadConfig();

      assert.equal(config.port, 3000);
      assert.equal(config.maxUploadBytes, 100 * 1024 * 1024);
    }
  );
});

test("non-positive upload size env values fall back to the default limit", async () => {
  await withEnv(
    {
      PB_MAX_UPLOAD_MB: "0",
      PB_PAIR_CODE: "123456"
    },
    () => {
      assert.equal(loadConfig().maxUploadBytes, 100 * 1024 * 1024);
    }
  );

  await withEnv(
    {
      PB_MAX_UPLOAD_MB: "-5",
      PB_PAIR_CODE: "123456"
    },
    () => {
      assert.equal(loadConfig().maxUploadBytes, 100 * 1024 * 1024);
    }
  );
});

test("ensureRuntimeDirs creates the configured runtime directories", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-runtime-dirs-"));
  const obsidianDir = path.join(dataDir, "custom-vault", "PocketBridge");
  const snapzyWatchDir = path.join(dataDir, "custom-watch", "snapzy");

  await withEnv(
    {
      PB_DATA_DIR: dataDir,
      PB_OBSIDIAN_DIR: obsidianDir,
      PB_SNAPZY_WATCH_DIR: snapzyWatchDir,
      PB_PAIR_CODE: "123456"
    },
    async () => {
      const config = loadConfig();
      await ensureRuntimeDirs(config);

      assert.equal((await fs.stat(config.inboxDir)).isDirectory(), true);
      assert.equal((await fs.stat(path.dirname(config.metadataPath))).isDirectory(), true);
      assert.equal((await fs.stat(config.obsidianDir)).isDirectory(), true);
      assert.equal((await fs.stat(config.snapzyWatchDir)).isDirectory(), true);
    }
  );
});

test("pairingPayload exposes Flutter-required connection fields and capabilities", async () => {
  await withEnv(
    {
      PORT: "4123",
      PB_PUBLIC_HOST: "10.0.0.23",
      PB_PAIR_CODE: "654321",
      PB_DEVICE_NAME: "Demo Mac"
    },
    () => {
      const config = loadConfig();
      const payload = pairingPayload(config);

      assert.equal(payload.protocol, "pocketbridge");
      assert.equal(payload.version, 1);
      assert.equal(payload.serverBaseUrl, "http://10.0.0.23:4123");
      assert.equal(payload.wsUrl, "ws://10.0.0.23:4123/ws");
      assert.equal(payload.pairCode, "654321");
      assert.equal(payload.deviceName, "Demo Mac");
      assert.deepEqual(payload.capabilities, ["upload", "download", "websocket", "knowledge", "ble-status"]);
      assert.equal(payload.expiresAt, config.pairingExpiresAt);
    }
  );
});
