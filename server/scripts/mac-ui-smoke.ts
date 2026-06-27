import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import type { Config } from "../src/config.js";
import { createPocketBridgeRuntime, type PocketBridgeRuntime } from "../src/app.js";

async function config(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-ui-smoke-"));
  return {
    port: 0,
    dataDir,
    inboxDir: path.join(dataDir, "inbox"),
    metadataPath: path.join(dataDir, "metadata.json"),
    obsidianDir: path.join(dataDir, "obsidian", "PocketBridge"),
    snapzyWatchDir: path.join(dataDir, "watch", "snapzy"),
    pairCode: "123456",
    deviceName: "Demo Mac",
    serverBaseUrl: "http://127.0.0.1:0",
    wsUrl: "ws://127.0.0.1:0/ws",
    lanAddresses: ["127.0.0.1"],
    maxUploadBytes: 100 * 1024 * 1024,
    pairingExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

async function listen(runtime: PocketBridgeRuntime, cfg: Config): Promise<void> {
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address() as AddressInfo;
  cfg.port = address.port;
  cfg.serverBaseUrl = `http://127.0.0.1:${address.port}`;
  cfg.wsUrl = `ws://127.0.0.1:${address.port}/ws`;
}

async function waitForWatcherReady(watcher: NonNullable<PocketBridgeRuntime["watcher"]>): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve) => watcher.once("ready", resolve)),
    sleep(2_000).then(() => undefined)
  ]);
}

function log(message: string): void {
  console.log(`[mac-ui-smoke] ${message}`);
}

const cfg = await config();
const runtime = await createPocketBridgeRuntime(cfg);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const pageErrors: Error[] = [];

try {
  await listen(runtime, cfg);
  assert.ok(runtime.watcher, "Snapzy watcher must be running for Mac UI smoke");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.goto(`${cfg.serverBaseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Connected");
  await page.waitForFunction(() => document.querySelector("#pairingPayload")?.textContent?.includes('"pairCode": "123456"'));
  await page.waitForFunction(() => {
    const qr = document.querySelector("#qr");
    return qr instanceof HTMLImageElement && qr.complete && qr.naturalWidth > 0;
  });
  assert.deepEqual(pageErrors, []);
  log("Mac UI loaded");

  await waitForWatcherReady(runtime.watcher);
  await fs.writeFile(path.join(cfg.snapzyWatchDir, "snapzy-ui.png"), "png");
  await page.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("snapzy-ui.png"));
  const itemsText = await page.locator("#items").innerText();
  assert.match(itemsText, /snapzy-ui\.png/);
  assert.match(itemsText, /screenshot/);
  assert.match(itemsText, /snapzy/);
  assert.deepEqual(pageErrors, []);
  log("Snapzy item appeared in PocketInbox");

  await page.getByRole("button", { name: "Away" }).click();
  await page.waitForFunction(() => document.querySelector("#bleStatus")?.textContent === "PocketKey away");
  const bleClass = await page.locator("#bleStatus").getAttribute("class");
  assert.match(bleClass ?? "", /\baway\b/);
  assert.deepEqual(pageErrors, []);
  log("BLE state appeared in Mac UI");
} finally {
  await browser?.close();
  await runtime.close();
  await fs.rm(cfg.dataDir, { recursive: true, force: true });
}
