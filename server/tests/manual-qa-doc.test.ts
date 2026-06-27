import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve("..");
const checklistPath = path.join(repoRoot, "docs", "MANUAL_QA_CHECKLIST.md");

test("manual QA checklist covers deferred physical-device validation", async () => {
  const checklist = await fs.readFile(checklistPath, "utf8");

  assert.match(checklist, /cd server\nnpm run build\nnpm test\nnpm run demo:smoke\nnpm run demo:ui-smoke\nnpm run demo:lan-check/);
  assert.match(checklist, /cd apps\/mobile_flutter\n(?:.*\n)*?\$HOME\/development\/flutter\/bin\/dart analyze/);
  assert.match(checklist, /Android Real Phone LAN And QR/);
  assert.match(checklist, /Mobile Browser Fallback/);
  assert.match(checklist, /Snapzy Integration/);
  assert.match(checklist, /Knowledge export writes Markdown under `data\/obsidian\/PocketBridge\/`/);
  assert.match(checklist, /Attached asset is copied under `data\/obsidian\/PocketBridge\/attachments\/`/);
  assert.doesNotMatch(checklist, /data\/obsidian\/PocketBridge\/inbox/);
  assert.doesNotMatch(checklist, /data\/obsidian\/PocketBridge\/assets\/pocketbridge/);
  assert.match(checklist, /BLEUnlock Integration/);
  assert.match(checklist, /curl -X POST "\$BASE_URL\/api\/ble\/status"/);
  assert.doesNotMatch(checklist, /integrations\//);
  assert.match(checklist, /Acceptance Record/);
  assert.match(checklist, /Release Decision/);
});
