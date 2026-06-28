import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("demo script documents the live rehearsal and fallback paths", async () => {
  const script = await fs.readFile("docs/DEMO_SCRIPT.md", "utf8");

  assert.match(script, /npm run demo:live/);
  assert.match(script, /npm run mac:client/);
  assert.match(script, /http:\/\/<Mac-LAN-IP>:3000\/mobile\.html/);
  assert.match(script, /native Mac client/i);
  assert.match(script, /Capture Screen/);
  assert.match(script, /Send by Bluetooth/);
  assert.match(script, /real Android BLE RSSI/);
  assert.match(script, /PocketKey/);
  assert.match(script, /trusted -> away -> locked/);
  assert.match(script, /Flutter/);
  assert.match(script, /flutter.*dart/i);
});
