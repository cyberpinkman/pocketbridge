import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("Mac Web UI targets the upstream PocketBridge API contract", async () => {
  const html = await fs.readFile("apps/mac_desktop/web/index.html", "utf8");
  const app = await fs.readFile("apps/mac_desktop/web/app.js", "utf8");

  assert.match(app, /currentPairCode/);
  assert.match(app, /X-PocketBridge-Pair-Code/);
  assert.match(app, /\/api\/pairing/);
  assert.match(app, /\/api\/pairing\/qr\.svg/);
  assert.match(app, /\/api\/items/);
  assert.match(app, /\/api\/items\/text/);
  assert.match(app, /\/api\/items\/upload/);
  assert.match(app, /\/api\/ble\/send\/\$\{selected\.id\}/);
  assert.match(app, /\/api\/knowledge\/\$\{selected\.id\}/);
  assert.match(app, /\/api\/ble\/status/);
  assert.match(app, /\/ws\?pairCode=/);
  assert.match(html, /id="trustLocked"/);
  assert.match(app, /trustLocked/);
  assert.match(app, /setBleDemoStatus\("locked"\)/);
  assert.match(app, /locked: -96/);
  assert.match(html, /PocketKey/);
  assert.match(html, /Capture Studio/);
  assert.match(html, /id="screenCapture"/);
  assert.match(html, /id="captureCanvas"/);
  assert.match(html, /id="saveCapture"/);
  assert.match(app, /getDisplayMedia/);
  assert.match(app, /captureCanvas/);
  assert.match(app, /toBlob/);
  assert.match(app, /PocketBridge Capture/);

  assert.doesNotMatch(html, /Import Snapzy folder/);
  assert.doesNotMatch(app, /\/api\/items\/\$\{selected\.id\}\/share-to-mobile/);
  assert.doesNotMatch(app, /api\("\/pairing\/session/);
  assert.doesNotMatch(app, /api\("\/upload/);
  assert.doesNotMatch(app, /api\("\/share/);
  assert.doesNotMatch(app, /api\(`\/export\/\$\{selected\.id\}/);
  assert.doesNotMatch(app, /api\("\/trust\/simulate/);
  assert.doesNotMatch(app, /WebSocket\(`\$\{protocol\}:\/\/\$\{location\.host\}\/events/);
});
