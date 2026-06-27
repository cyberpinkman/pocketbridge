import { strict as assert } from "node:assert";
import test from "node:test";
import { runLanPreflight } from "../../dist/server/src/lanPreflight.js";

test("LAN preflight validates phone-reachable pairing endpoints", async () => {
  const result = await runLanPreflight({ publicHost: "192.168.1.50" });

  assert.equal(result.publicHost, "192.168.1.50");
  assert.match(result.pairCode, /^\d{6}$/);
  assert.match(result.localBaseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.match(result.advertisedBaseUrl, /^http:\/\/192\.168\.1\.50:\d+$/);
  assert.equal(result.advertisedWsUrl, result.advertisedBaseUrl.replace(/^http/, "ws") + "/ws");
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
