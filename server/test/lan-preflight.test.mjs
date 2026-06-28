import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { runLanPreflight } from "../../dist/server/src/lanPreflight.js";

const execFileAsync = promisify(execFile);

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

test("LAN preflight script works when PB_PUBLIC_HOST is set for live demo", async () => {
  const { stdout } = await execFileAsync("node", ["dist/server/scripts/lan-check.js"], {
    env: { ...process.env, PB_PUBLIC_HOST: "192.168.1.50" },
    timeout: 10_000
  });

  assert.match(stdout, /\[lan-check\] public host: 192\.168\.1\.50/);
  assert.match(stdout, /\[lan-check\] Mac UI: http:\/\/192\.168\.1\.50:\d+\//);
  assert.match(stdout, /\[lan-check\] checks: health -> pairing-json -> pairing-qr -> mac-ui -> mobile-fallback -> websocket -> text-upload/);
});
