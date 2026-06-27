import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Locator } from "playwright";
import type { Config } from "../src/config.js";
import { createPocketBridgeRuntime, type PocketBridgeRuntime } from "../src/app.js";

type JsonObject = Record<string, unknown>;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

async function config(): Promise<Config> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-record-fallback-"));
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

async function waitForWatcherReady(watcher: NonNullable<PocketBridgeRuntime["watcher"]>): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve) => watcher.once("ready", resolve)),
    sleep(2_000).then(() => undefined)
  ]);
}

async function waitForText(locator: Locator, expected: string | RegExp, label: string, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await locator.textContent({ timeout: 500 }).catch(() => undefined);
    if (typeof expected === "string" ? text === expected : expected.test(text ?? "")) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function recordingPath(): string {
  return path.resolve(process.env.PB_FALLBACK_RECORDING_PATH ?? path.join(repoRoot, "docs/demo-recordings/fallback-demo.webm"));
}

function directorHtml(cfg: Config): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>PocketBridge fallback demo recording</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #12161b;
        color: #eef3f7;
        font: 14px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 54px;
        padding: 0 18px;
        border-bottom: 1px solid #2f3944;
        background: #171d24;
      }
      h1 {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
      }
      .pair {
        color: #9fb0c2;
        font-size: 13px;
      }
      .stage {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 392px;
        gap: 12px;
        height: calc(100vh - 54px);
        padding: 12px;
      }
      .panel {
        overflow: hidden;
        border: 1px solid #2f3944;
        border-radius: 8px;
        background: #f6f7f8;
      }
      .panel-title {
        height: 32px;
        padding: 7px 10px;
        background: #202833;
        color: #dbe5ee;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
      }
      iframe {
        width: 100%;
        height: calc(100% - 32px);
        border: 0;
        background: #fff;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>PocketBridge fallback run</h1>
      <div class="pair">server ${cfg.serverBaseUrl} - pair ${cfg.pairCode}</div>
    </header>
    <main class="stage">
      <section class="panel">
        <div class="panel-title">Mac PocketInbox</div>
        <iframe data-demo="mac" title="Mac PocketInbox" src="${cfg.serverBaseUrl}/"></iframe>
      </section>
      <section class="panel">
        <div class="panel-title">Mobile browser fallback</div>
        <iframe data-demo="mobile" title="Mobile browser fallback" src="${cfg.serverBaseUrl}/mobile.html"></iframe>
      </section>
    </main>
  </body>
</html>`;
}

function log(message: string): void {
  console.log(`[record-fallback] ${message}`);
}

const cfg = await config();
const runtime = await createPocketBridgeRuntime(cfg);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const pageErrors: Error[] = [];
const outputPath = recordingPath();
let videoDir: string | undefined;

try {
  await listen(runtime, cfg);
  assert.ok(runtime.watcher, "Snapzy watcher must be running for fallback recording");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  browser = await chromium.launch({ headless: true });
  videoDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-fallback-video-"));
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1280, height: 720 }
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.setContent(directorHtml(cfg), { waitUntil: "domcontentloaded" });
  const video = page.video();
  const mac = page.frameLocator('iframe[data-demo="mac"]');
  const mobile = page.frameLocator('iframe[data-demo="mobile"]');

  await waitForText(mac.locator("#status"), "Connected", "Mac UI connection");
  await waitForText(mobile.locator("#status"), "Connected", "mobile fallback connection");
  await waitForText(mobile.locator("#deviceName"), "Demo Mac", "mobile device name");
  await page.waitForTimeout(700);
  log("recording connected UIs");

  await mobile.locator("#textTitle").fill("Fallback recording note");
  await mobile.locator("#textBody").fill("Recorded browser fallback upload.");
  await page.waitForTimeout(300);
  await mobile.getByRole("button", { name: "Upload text" }).click();
  await waitForText(mobile.locator("#status"), "Upload text complete", "mobile fallback upload");
  await waitForText(mac.locator("#items"), /Fallback recording note/, "Mac inbox fallback item");
  await page.waitForTimeout(700);
  log("recording fallback text upload");

  await mobile.locator("#fileInput").setInputFiles({
    name: "recorded-fallback-file.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("recorded browser fallback file upload")
  });
  await page.waitForTimeout(300);
  await mobile.getByRole("button", { name: "Upload file" }).click();
  await waitForText(mobile.locator("#status"), "Upload file complete", "mobile fallback file upload");
  await waitForText(mac.locator("#items"), /recorded-fallback-file\.txt/, "Mac inbox fallback file item");
  await page.waitForTimeout(700);
  log("recording fallback file upload");

  await mac.getByRole("button", { name: "Save" }).first().click();
  await waitForText(mac.locator("#status"), "Save complete", "Mac knowledge save");
  await waitForText(mac.locator("#items"), /obsidian\/PocketBridge\/.*\.md/, "knowledge path in Mac UI");
  await page.waitForTimeout(700);
  log("recording knowledge path");

  await waitForWatcherReady(runtime.watcher);
  await fs.writeFile(path.join(cfg.snapzyWatchDir, "recorded-snapzy.png"), "png");
  await waitForText(mac.locator("#items"), /recorded-snapzy\.png/, "Snapzy import in Mac UI");
  await page.waitForTimeout(700);
  log("recording Snapzy import");

  const sharedForm = new FormData();
  sharedForm.append("file", new Blob(["shared during fallback recording"], { type: "text/plain" }), "recorded-share.txt");
  sharedForm.append("origin", "mac");
  sharedForm.append("sourceDevice", "Demo Mac");
  sharedForm.append("sharedToMobile", "true");
  await json(cfg, "/api/items/upload", {
    method: "POST",
    headers: authHeaders(cfg, false),
    body: sharedForm
  });
  await waitForText(mobile.locator("#items"), /recorded-share\.txt/, "shared file in mobile fallback");
  await page.waitForTimeout(500);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    mobile.getByRole("button", { name: "Download" }).click()
  ]);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, "Mobile fallback download must create a local download artifact");
  assert.equal(await fs.readFile(downloadedPath, "utf8"), "shared during fallback recording");
  await page.waitForTimeout(700);
  log("recording share-back download");

  await mac.getByRole("button", { name: "Away" }).click();
  await waitForText(mac.locator("#bleStatus"), "PocketKey away", "BLE away state in Mac UI");
  await page.waitForTimeout(1_000);
  assert.deepEqual(pageErrors, []);
  log("recording BLE state");

  await page.close();
  await context.close();
  const tempVideoPath = await video?.path();
  assert.ok(tempVideoPath, "Playwright must produce a recording");
  await fs.copyFile(tempVideoPath, outputPath);
  const stat = await fs.stat(outputPath);
  assert.ok(stat.size > 0, "Fallback recording must not be empty");
  log(`wrote ${outputPath}`);
} finally {
  await browser?.close();
  await runtime.close();
  await fs.rm(cfg.dataDir, { recursive: true, force: true });
  if (videoDir) {
    await fs.rm(videoDir, { recursive: true, force: true });
  }
}
