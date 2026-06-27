import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import type { Config } from "../src/config.js";
import { createPocketBridgeRuntime, type PocketBridgeRuntime } from "../src/app.js";

type JsonObject = Record<string, unknown>;

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
  console.log(`[ui-smoke] ${message}`);
}

function authHeaders(cfg: Config, json = true): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "X-PocketBridge-Pair-Code": cfg.pairCode
  };
}

async function json(cfg: Config, pathOrUrl: string, options: RequestInit = {}): Promise<JsonObject> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${cfg.serverBaseUrl}${pathOrUrl}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      "X-PocketBridge-Pair-Code": cfg.pairCode
    }
  });
  const body = await response.text();
  assert.ok(response.ok, `${options.method ?? "GET"} ${url} failed: ${response.status} ${body}`);
  return JSON.parse(body) as JsonObject;
}

const cfg = await config();
const runtime = await createPocketBridgeRuntime(cfg);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const macPageErrors: Error[] = [];
const mobilePageErrors: Error[] = [];

try {
  await listen(runtime, cfg);
  assert.ok(runtime.watcher, "Snapzy watcher must be running for UI smoke");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const macPage = await context.newPage();
  const mobilePage = await context.newPage();
  macPage.on("pageerror", (error) => {
    macPageErrors.push(error);
  });
  mobilePage.on("pageerror", (error) => {
    mobilePageErrors.push(error);
  });

  await macPage.goto(`${cfg.serverBaseUrl}/`, { waitUntil: "domcontentloaded" });
  await macPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Connected");
  await macPage.waitForFunction(() => document.querySelector("#pairingPayload")?.textContent?.includes('"pairCode": "123456"'));
  await macPage.waitForFunction(() => {
    const qr = document.querySelector("#qr");
    return qr instanceof HTMLImageElement && qr.complete && qr.naturalWidth > 0;
  });
  assert.deepEqual(macPageErrors, []);
  log("Mac UI loaded");

  await mobilePage.goto(`${cfg.serverBaseUrl}/mobile.html`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForFunction(() => document.querySelector("#status")?.textContent === "Connected");
  await mobilePage.waitForFunction(() => document.querySelector("#deviceName")?.textContent === "Demo Mac");
  assert.deepEqual(mobilePageErrors, []);
  log("Mobile fallback loaded");

  await mobilePage.locator("#textTitle").fill("Fallback note");
  await mobilePage.locator("#textBody").fill("Mobile fallback to Mac UI.");
  await mobilePage.getByRole("button", { name: "Upload text" }).click();
  await mobilePage.waitForFunction(() => document.querySelector("#status")?.textContent === "Upload text complete");
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("Fallback note"));
  assert.match(await macPage.locator("#items").innerText(), /Mobile fallback to Mac UI\./);
  assert.deepEqual(macPageErrors, []);
  assert.deepEqual(mobilePageErrors, []);
  log("Mobile fallback text appeared in PocketInbox");

  await macPage.getByRole("button", { name: "Save" }).click();
  await macPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Save complete");
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("obsidian/PocketBridge/"));
  assert.match(await macPage.locator("#items").innerText(), /obsidian\/PocketBridge\/.*\.md/);
  assert.deepEqual(macPageErrors, []);
  log("Knowledge path appeared in PocketInbox");

  await macPage.locator("#searchInput").fill("Fallback");
  await macPage.getByRole("button", { name: "Search" }).click();
  await macPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Search complete");
  assert.match(await macPage.locator("#items").innerText(), /Fallback note/);
  assert.deepEqual(macPageErrors, []);
  log("PocketInbox search returned fallback item");

  await macPage.locator("#searchInput").fill("no-such-fallback-note");
  await macPage.getByRole("button", { name: "Search" }).click();
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("Inbox empty"));
  assert.match(await macPage.locator("#items").innerText(), /Inbox empty/);
  assert.deepEqual(macPageErrors, []);
  log("PocketInbox search empty state rendered");

  await macPage.locator("#searchInput").fill("");
  await macPage.getByRole("button", { name: "Search" }).click();
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("Fallback note"));
  await macPage.getByRole("button", { name: "Archive" }).click();
  await macPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Archive complete");
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("Inbox empty"));
  assert.match(await macPage.locator("#items").innerText(), /Inbox empty/);
  assert.deepEqual(macPageErrors, []);
  log("PocketInbox archive hid item by default");

  await macPage.locator("#includeArchived").check();
  await macPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Refresh complete");
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("Fallback note"));
  assert.match(await macPage.locator("#items").innerText(), /archived/);
  assert.deepEqual(macPageErrors, []);
  log("PocketInbox show archived displayed archived item");

  await macPage.getByRole("button", { name: "Restore" }).click();
  await macPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Restore complete");
  await macPage.waitForFunction(() => {
    const text = document.querySelector("#items")?.textContent ?? "";
    return text.includes("Fallback note") && !text.includes("archived");
  });
  assert.doesNotMatch(await macPage.locator("#items").innerText(), /archived/);
  assert.deepEqual(macPageErrors, []);
  log("PocketInbox restore cleared archived state");

  macPage.once("dialog", (dialog) => {
    assert.match(dialog.message(), /Delete "Fallback note" from PocketBridge\?/);
    void dialog.accept();
  });
  await macPage.getByRole("button", { name: "Delete" }).click();
  await macPage.waitForFunction(() => document.querySelector("#status")?.textContent === "Delete complete");
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("Inbox empty"));
  assert.match(await macPage.locator("#items").innerText(), /Inbox empty/);
  assert.deepEqual(macPageErrors, []);
  log("PocketInbox delete removed item");

  await waitForWatcherReady(runtime.watcher);
  await fs.writeFile(path.join(cfg.snapzyWatchDir, "snapzy-ui.png"), "png");
  await macPage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("snapzy-ui.png"));
  const itemsText = await macPage.locator("#items").innerText();
  assert.match(itemsText, /snapzy-ui\.png/);
  assert.match(itemsText, /screenshot/);
  assert.match(itemsText, /snapzy/);
  assert.deepEqual(macPageErrors, []);
  log("Snapzy item appeared in PocketInbox");

  const sharedForm = new FormData();
  sharedForm.append("file", new Blob(["shared from Mac"], { type: "text/plain" }), "mac-shared.txt");
  sharedForm.append("origin", "mac");
  sharedForm.append("sourceDevice", "Demo Mac");
  sharedForm.append("sharedToMobile", "true");
  await json(cfg, "/api/items/upload", {
    method: "POST",
    headers: authHeaders(cfg, false),
    body: sharedForm
  });
  await mobilePage.waitForFunction(() => document.querySelector("#items")?.textContent?.includes("mac-shared.txt"));
  assert.match(await mobilePage.locator("#items").innerText(), /file \/ mac/);
  const [download] = await Promise.all([
    mobilePage.waitForEvent("download"),
    mobilePage.getByRole("button", { name: "Download" }).click()
  ]);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, "Mobile fallback download must create a local download artifact");
  assert.equal(await fs.readFile(downloadedPath, "utf8"), "shared from Mac");
  assert.deepEqual(mobilePageErrors, []);
  log("Mobile fallback shared download worked");

  await macPage.getByRole("button", { name: "Away" }).click();
  await macPage.waitForFunction(() => document.querySelector("#bleStatus")?.textContent === "PocketKey away");
  const bleClass = await macPage.locator("#bleStatus").getAttribute("class");
  assert.match(bleClass ?? "", /\baway\b/);
  assert.deepEqual(macPageErrors, []);
  log("BLE state appeared in Mac UI");
} finally {
  await browser?.close();
  await runtime.close();
  await fs.rm(cfg.dataDir, { recursive: true, force: true });
}
