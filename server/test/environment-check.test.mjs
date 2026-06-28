import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";
import {
  formatEnvironmentReport,
  getEnvironmentStatus
} from "../../dist/server/src/environmentCheck.js";

test("package exposes an environment check command", async () => {
  const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));

  assert.equal(
    packageJson.scripts["env:check"],
    "npm run build && node dist/server/src/environmentCheck.js"
  );
});

test("environment check reports missing Flutter and Dart as blocked", () => {
  const status = getEnvironmentStatus((command) => {
    if (command === "node") {
      return { ok: true, output: "v20.20.2" };
    }
    if (command === "npm") {
      return { ok: true, output: "10.9.0" };
    }
    return { ok: false, output: "" };
  });

  assert.equal(status.node.ok, true);
  assert.equal(status.npm.ok, true);
  assert.equal(status.flutter.ok, false);
  assert.equal(status.dart.ok, false);

  const report = formatEnvironmentReport(status);
  assert.match(report, /Node: OK/);
  assert.match(report, /npm: OK/);
  assert.match(report, /Flutter: BLOCKED/);
  assert.match(report, /Dart: BLOCKED/);
  assert.match(report, /Use the browser fallback/);
});
