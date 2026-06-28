import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("package exposes a one-command demo readiness rehearsal", async () => {
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
  const script = await fs.readFile("server/scripts/demo-ready.ts", "utf8");
  const demoScript = await fs.readFile("docs/DEMO_SCRIPT.md", "utf8");

  assert.equal(pkg.scripts["demo:ready"], "npm run build && node dist/server/scripts/demo-ready.js");
  assert.match(script, /demo:live/);
  assert.match(script, /demo:ble-agent/);
  assert.match(script, /env:check/);
  assert.match(script, /PocketBridge demo readiness passed/);

  assert.match(demoScript, /npm run demo:ready/);
  assert.match(demoScript, /npm run demo:ble-agent/);
  assert.match(demoScript, /Start BLE Demo/);
  assert.match(demoScript, /PB_BLE_TRANSPORT=agent/);
  assert.doesNotMatch(demoScript, /Full BLE GATT transport and chunking protocol\./);
});
