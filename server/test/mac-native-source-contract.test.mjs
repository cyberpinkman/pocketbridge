import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Native Mac client unifies bridge, BLE, pairing, inbox, and demo controls", async () => {
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
  const swiftPackage = await fs.readFile("apps/mac_desktop/native/Package.swift", "utf8");
  const launcher = await fs.readFile("PocketBridge.command", "utf8");
  const appBundleScript = await fs.readFile("apps/mac_desktop/native/scripts/build-app-bundle.sh", "utf8");
  const demoShieldController = await fs.readFile(
    "apps/mac_desktop/native/Sources/PocketBridgeMacClient/DemoLockShieldController.swift",
    "utf8"
  );
  const sourceDir = "apps/mac_desktop/native/Sources/PocketBridgeMacClient";
  const files = await fs.readdir(sourceDir);
  const source = (
    await Promise.all(files.filter((file) => file.endsWith(".swift")).map((file) =>
      fs.readFile(path.join(sourceDir, file), "utf8")
    ))
  ).join("\n");

  assert.equal(pkg.scripts["mac:client"], "swift run --package-path apps/mac_desktop/native PocketBridgeMacClient");
  assert.equal(pkg.scripts["mac:client:build"], "swift build --package-path apps/mac_desktop/native -c release");
  assert.match(launcher, /build-app-bundle\.sh/);
  assert.match(launcher, /open -n "\$APP_DIR"/);
  assert.match(launcher, /pgrep -nx PocketBridgeMacClient/);
  assert.match(appBundleScript, /npm run mac:client:build/);
  assert.match(appBundleScript, /tmp\/demo-artifacts\/PocketBridge\.app/);
  assert.match(appBundleScript, /CFBundleExecutable/);
  assert.match(appBundleScript, /LSUIElement/);
  assert.match(appBundleScript, /codesign --force --sign - "\$APP_DIR"/);
  assert.match(swiftPackage, /PocketBridgeMacClient/);
  assert.match(source, /@main/);
  assert.match(source, /SwiftUI/);
  assert.match(source, /NSStatusBar\.system\.statusItem/);
  assert.match(source, /private let menu = NSMenu\(title: "PocketBridge"\)/);
  assert.match(source, /menuNeedsUpdate/);
  assert.match(source, /menu\.removeAllItems\(\)/);
  assert.match(source, /button\.title = "PB"/);
  assert.match(source, /button\.title = "PB OK"/);
  assert.match(source, /button\.title = "PB LOCK"/);
  assert.match(source, /applicationShouldTerminateAfterLastWindowClosed/);
  assert.match(source, /applicationShouldTerminate\(_ sender: NSApplication\)/);
  assert.match(source, /terminateCancel/);
  assert.match(source, /allowTermination = true/);
  assert.match(source, /Open PocketBridge/);
  assert.match(source, /Auto Demo Lock/);
  assert.match(source, /Quit PocketBridge/);
  assert.match(source, /Start/);
  assert.match(source, /Process\(\)/);
  assert.match(source, /PB_BLE_TRANSPORT/);
  assert.match(source, /PB_BLE_AGENT_URL/);
  assert.match(source, /PB_POCKETKEY_LOCKED_RSSI"\] = "-78"/);
  assert.match(source, /PB_POCKETKEY_LOCK_ACTION"\] = "demo"/);
  assert.match(source, /\/api\/pairing/);
  assert.match(source, /\/api\/items/);
  assert.match(source, /\/api\/items\/text/);
  assert.match(source, /\/api\/items\/upload/);
  assert.match(source, /\/api\/ble\/status/);
  assert.match(source, /\/api\/ble\/send\/\\\(itemId\)/);
  assert.match(source, /\/api\/knowledge\/\\\(itemId\)/);
  assert.match(source, /\/status/);
  assert.match(source, /\/lock/);
  assert.match(source, /QRCodeView/);
  assert.match(source, /DemoLockShieldController/);
  assert.match(demoShieldController, /isReleasedWhenClosed = false/);
  assert.match(demoShieldController, /orderOut\(nil\)/);
  assert.doesNotMatch(demoShieldController, /window\.close\(\)/);
  assert.match(source, /PocketBridge Locked/);
  assert.match(source, /PocketInbox/);
  assert.match(source, /screencapture/);
  assert.match(source, /Capture Screen/);
  assert.match(source, /Send to Phone/);
  assert.match(source, /Send by Bluetooth/);
  assert.match(source, /Demo Lock/);
  assert.match(source, /Demo Unlock/);
  assert.match(source, /Save Knowledge/);

  assert.doesNotMatch(source, /load\(URLRequest\(url: serverBaseURL/);
  assert.doesNotMatch(source, /apps\/mac_desktop\/web/);
});
