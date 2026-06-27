import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("BLEUnlock integration exposes an event-script bridge for PocketKey status", async () => {
  const script = await fs.readFile("integrations/bleunlock/pocketkey-status.sh", "utf8");
  const readme = await fs.readFile("integrations/bleunlock/README.md", "utf8");

  assert.match(script, /^#!\/usr\/bin\/env sh/);
  assert.match(script, /PB_BASE_URL/);
  assert.match(script, /PB_PAIR_CODE/);
  assert.match(script, /\/api\/ble\/status/);
  assert.match(script, /X-PocketBridge-Pair-Code/);
  assert.match(script, /trusted\|away\|locked\|unknown/);

  assert.match(readme, /pocketkey-status\.sh/);
  assert.match(readme, /PB_PAIR_CODE/);
  assert.match(readme, /trusted/);
  assert.match(readme, /away/);
  assert.match(readme, /locked/);
});
