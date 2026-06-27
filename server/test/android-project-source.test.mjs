import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("Android project uses the PocketBridge app identity", async () => {
  const gradle = await fs.readFile("apps/mobile_flutter/android/app/build.gradle.kts", "utf8");
  const mainActivity = await fs.readFile(
    "apps/mobile_flutter/android/app/src/main/kotlin/app/pocketbridge/mobile/MainActivity.kt",
    "utf8"
  );

  assert.match(gradle, /namespace = "app\.pocketbridge\.mobile"/);
  assert.match(gradle, /applicationId = "app\.pocketbridge\.mobile"/);
  assert.doesNotMatch(gradle, /com\.example/);
  assert.match(mainActivity, /package app\.pocketbridge\.mobile/);
});

test("Android manifest supports the local-network demo path", async () => {
  const manifest = await fs.readFile("apps/mobile_flutter/android/app/src/main/AndroidManifest.xml", "utf8");

  assert.match(manifest, /android:label="PocketBridge"/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android:usesCleartextTraffic="true"/);
});
