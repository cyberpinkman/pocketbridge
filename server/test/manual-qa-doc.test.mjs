import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("manual QA checklist covers the remaining device-bound validation", async () => {
  const checklist = await fs.readFile("docs/MANUAL_QA_CHECKLIST.md", "utf8");

  assert.match(checklist, /Automated MVP confidence: 97%/);
  assert.match(checklist, /npm run demo:lan-check/);
  assert.match(checklist, /Flutter Workstation/);
  assert.match(checklist, /Physical Phone LAN And QR/);
  assert.match(checklist, /Built-in Capture Studio/);
  assert.match(checklist, /Standalone PocketKey/);
  assert.match(checklist, /Third-party Compatibility/);
  assert.match(checklist, /BLE Capsule Text Proof/);
  assert.match(checklist, /Acceptance Record/);
  assert.match(checklist, /Release Decision/);
});
