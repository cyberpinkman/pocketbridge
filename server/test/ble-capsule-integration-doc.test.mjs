import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("BLE Capsule integration exposes a text bridge into PocketInbox", async () => {
  const script = await fs.readFile("integrations/ble-capsule/capsule-text.sh", "utf8");
  const readme = await fs.readFile("integrations/ble-capsule/README.md", "utf8");

  assert.match(script, /^#!\/usr\/bin\/env sh/);
  assert.match(script, /PB_BASE_URL/);
  assert.match(script, /PB_PAIR_CODE/);
  assert.match(script, /\/api\/items\/text/);
  assert.match(script, /X-PocketBridge-Pair-Code/);
  assert.match(script, /origin:\s*"mobile"/);
  assert.match(script, /sourceDevice:\s*process\.env\.PB_SOURCE_DEVICE/);
  assert.match(script, /ble-capsule/);

  assert.match(readme, /BLE Capsule/);
  assert.match(readme, /capsule-text\.sh/);
  assert.match(readme, /PB_PAIR_CODE/);
  assert.match(readme, /\/api\/items\/text/);
});
