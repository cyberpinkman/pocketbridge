import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

const releaseRoot = "release/demo";

test("standard demo package exposes Mac client launchers and mobile APK status", async () => {
  const files = await Promise.all([
    fs.readFile(`${releaseRoot}/DEMO_STEPS.md`, "utf8"),
    fs.readFile(`${releaseRoot}/Start-PocketBridge-Mac.command`, "utf8"),
    fs.readFile(`${releaseRoot}/Run-Demo-Ready.command`, "utf8"),
    fs.readFile(`${releaseRoot}/Start-BLE-Agent.command`, "utf8"),
    fs.readFile(`${releaseRoot}/Build-Mobile-APK.command`, "utf8"),
    fs.readFile(`${releaseRoot}/PocketBridge-Mac-Demo.app/Contents/Info.plist`, "utf8"),
    fs.readFile(`${releaseRoot}/PocketBridge-Mac-Demo.app/Contents/MacOS/PocketBridge-Mac-Demo`, "utf8"),
  ]);
  const [steps, macLauncher, readyLauncher, bleLauncher, apkBuilder, plist, appExecutable] = files;
  const releaseEntries = await fs.readdir(releaseRoot);

  assert.match(steps, /PocketBridge Standard Demo Package/);
  assert.match(steps, /Mac demo client/);
  assert.match(steps, /Android APK/);
  assert.match(macLauncher, /npm run build/);
  assert.match(macLauncher, /npm run start/);
  assert.match(readyLauncher, /npm run demo:ready/);
  assert.match(bleLauncher, /swift run PocketBridgeBLEAgent/);
  assert.match(apkBuilder, /build apk --debug/);
  assert.match(apkBuilder, /PocketBridge-Mobile\.apk/);
  assert.match(plist, /PocketBridge Mac Demo/);
  assert.match(appExecutable, /Start-PocketBridge-Mac\.command/);
  assert.ok(
    releaseEntries.includes("PocketBridge-Mobile.apk") ||
      releaseEntries.includes("APK_BUILD_BLOCKED.md"),
    "release package must include either the Android APK or an explicit APK build blocker"
  );
});
