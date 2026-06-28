import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("Mobile browser fallback targets the upstream PocketBridge API contract", async () => {
  const index = await fs.readFile("apps/mac_desktop/web/index.html", "utf8");
  const html = await fs.readFile("apps/mac_desktop/web/mobile.html", "utf8");
  const script = await fs.readFile("apps/mac_desktop/web/mobile.js", "utf8");

  assert.match(index, /href="\/mobile\.html"/);

  assert.match(html, /PocketBridge Mobile/);
  assert.match(html, /id="textForm"/);
  assert.match(html, /id="fileForm"/);
  assert.match(html, /PocketKey/);
  assert.match(html, /id="trustPhone"/);
  assert.match(html, /id="awayPhone"/);
  assert.match(html, /id="rssiInput"/);
  assert.match(html, /Bluetooth RSSI/);
  assert.match(html, /id="items"/);
  assert.match(html, /src="\/mobile\.js"/);

  assert.match(script, /\/api\/pairing/);
  assert.match(script, /X-PocketBridge-Pair-Code/);
  assert.match(script, /\/api\/items\/text/);
  assert.match(script, /\/api\/items\/upload/);
  assert.match(script, /\/api\/items\?sharedToMobile=true/);
  assert.match(script, /\/api\/ble\/status/);
  assert.match(script, /\/api\/ble\/rssi/);
  assert.match(script, /startPocketKeyHeartbeat/);
  assert.match(script, /5000/);
  assert.match(script, /setPocketKeyStatus/);
  assert.match(script, /sendPocketKeyRssi/);
  assert.match(script, /sendPocketKeyRssi\(\{ quiet: true \}\)/);
  assert.match(script, /PocketBridge Phone/);
  assert.match(script, /wsUrl/);
  assert.match(script, /client=mobile/);
  assert.doesNotMatch(script, /fetch\([^)]*["']\/upload/);
  assert.doesNotMatch(script, /fetch\([^)]*["']\/share/);
  assert.doesNotMatch(script, /pairing\/confirm/);
});
