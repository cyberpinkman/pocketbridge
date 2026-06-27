import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve("..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const checklistPath = path.join(repoRoot, "docs", "MANUAL_QA_CHECKLIST.md");
const readmePath = path.join(repoRoot, "README.md");

test("CI uploads the Flutter Android debug APK for teammate handoff", async () => {
  const workflow = await fs.readFile(workflowPath, "utf8");
  const checklist = await fs.readFile(checklistPath, "utf8");
  const readme = await fs.readFile(readmePath, "utf8");

  assert.match(workflow, /flutter build apk --debug --no-pub/);
  assert.match(workflow, /uses: actions\/upload-artifact@v4/);
  assert.match(workflow, /name: pocketbridge-mobile-debug-apk/);
  assert.match(workflow, /path: apps\/mobile_flutter\/build\/app\/outputs\/flutter-apk\/app-debug\.apk/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 7/);

  assert.match(checklist, /pocketbridge-mobile-debug-apk/);
  assert.match(readme, /pocketbridge-mobile-debug-apk/);
});
