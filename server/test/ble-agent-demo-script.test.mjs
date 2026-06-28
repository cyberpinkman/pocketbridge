import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("package exposes a Mac BLE agent demo rehearsal command", async () => {
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
  const script = await fs.readFile("server/scripts/ble-agent-demo-check.ts", "utf8");
  const readme = await fs.readFile("integrations/real-ble-agent/README.md", "utf8");

  assert.equal(pkg.scripts["demo:ble-agent"], "npm run build && node dist/server/scripts/ble-agent-demo-check.js");
  assert.match(script, /PB_BLE_TRANSPORT/);
  assert.match(script, /PB_BLE_AGENT_URL/);
  assert.match(script, /swift/);
  assert.match(script, /PocketBridgeBLEAgent/);
  assert.match(script, /\/api\/ble\/send\/demo-capture/);
  assert.match(script, /BLE agent demo rehearsal passed/);
  assert.match(readme, /npm run demo:ble-agent/);
});
