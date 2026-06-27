import assert from "node:assert/strict";
import test from "node:test";
import { runLanPreflight } from "../src/lan-preflight.js";

test("LAN preflight advertises phone-reachable pairing URLs", async () => {
  const result = await runLanPreflight({
    publicHost: "192.0.2.42",
    pairCode: "654321",
    deviceName: "LAN Test Mac"
  });

  assert.equal(result.publicHost, "192.0.2.42");
  assert.equal(result.pairCode, "654321");
  assert.equal(result.localBaseUrl, `http://127.0.0.1:${result.port}`);
  assert.equal(result.advertisedBaseUrl, `http://192.0.2.42:${result.port}`);
  assert.equal(result.advertisedWsUrl, `ws://192.0.2.42:${result.port}/ws`);
  assert.equal(result.macUiUrl, `${result.advertisedBaseUrl}/`);
  assert.equal(result.mobileFallbackUrl, `${result.advertisedBaseUrl}/mobile.html`);
  assert.deepEqual(result.checked, [
    "health",
    "pairing-json",
    "pairing-qr",
    "mac-ui",
    "mobile-fallback",
    "websocket",
    "text-upload"
  ]);
});

test("explicit LAN preflight options override ambient URL env vars", async () => {
  const oldServerBaseUrl = process.env.PB_SERVER_BASE_URL;
  const oldWsUrl = process.env.PB_WS_URL;
  process.env.PB_SERVER_BASE_URL = "http://stale.example:9999";
  process.env.PB_WS_URL = "ws://stale.example:9999/ws";

  try {
    const result = await runLanPreflight({
      publicHost: "192.0.2.77",
      pairCode: "777777"
    });

    assert.equal(result.advertisedBaseUrl, `http://192.0.2.77:${result.port}`);
    assert.equal(result.advertisedWsUrl, `ws://192.0.2.77:${result.port}/ws`);
  } finally {
    if (oldServerBaseUrl === undefined) {
      delete process.env.PB_SERVER_BASE_URL;
    } else {
      process.env.PB_SERVER_BASE_URL = oldServerBaseUrl;
    }

    if (oldWsUrl === undefined) {
      delete process.env.PB_WS_URL;
    } else {
      process.env.PB_WS_URL = oldWsUrl;
    }
  }
});
