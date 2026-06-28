import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createApp } from "../src/app.js";
import { readMetadata, writeMetadata } from "../src/storage/metadataStore.js";

const agentUrl = process.env.PB_BLE_AGENT_URL ?? "http://127.0.0.1:41237";
const macAgentDir = path.resolve(process.cwd(), "integrations", "real-ble-agent", "mac-agent");

async function main(): Promise<void> {
  const originalTransport = process.env.PB_BLE_TRANSPORT;
  const originalAgentUrl = process.env.PB_BLE_AGENT_URL;
  process.env.PB_BLE_TRANSPORT = "agent";
  process.env.PB_BLE_AGENT_URL = agentUrl;

  const originalMetadata = await readMetadata();
  const demoFilePath = path.join(process.cwd(), "data", "inbox", "ble-agent-demo-capture.txt");
  let agent: ChildProcessWithoutNullStreams | undefined;
  const server = http.createServer(createApp());

  try {
    await fs.mkdir(path.dirname(demoFilePath), { recursive: true });
    await fs.writeFile(demoFilePath, "PocketBridge BLE agent demo payload\n", "utf8");
    await writeMetadata({
      items: [
        {
          id: "demo-capture",
          kind: "document",
          source: "mac",
          title: "BLE Agent Demo Capture",
          createdAt: new Date().toISOString(),
          status: "inbox",
          sourceDevice: "PocketBridge Capture",
          filePath: demoFilePath,
          mimeType: "text/plain",
          size: 36,
          sharedToMobile: false
        }
      ],
      pairingSessions: [
        {
          id: "demo-pairing",
          token: "123456",
          createdAt: new Date().toISOString(),
          expiresAt: "2999-01-01T00:00:00.000Z"
        }
      ],
      shares: []
    });

    agent = await startSwiftAgent();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address !== "object" || !address) {
      throw new Error("Bridge server did not expose a local port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/ble/send/demo-capture`, {
      method: "POST",
      headers: { "x-pocketbridge-pair-code": "123456" }
    });
    const body = await response.json();
    if (response.status !== 200) {
      throw new Error(`BLE agent send failed: ${response.status} ${JSON.stringify(body)}`);
    }
    if (body.transfer?.channel !== "ble" || body.transfer?.status !== "queued") {
      throw new Error(`Unexpected BLE transfer envelope: ${JSON.stringify(body.transfer)}`);
    }

    console.log("BLE agent demo rehearsal passed");
    console.log(`Transfer ${body.transfer.id} queued through ${agentUrl}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (agent) {
      agent.kill("SIGTERM");
      await onceExit(agent);
    }
    await writeMetadata(originalMetadata);
    await fs.rm(demoFilePath, { force: true });
    restoreEnv("PB_BLE_TRANSPORT", originalTransport);
    restoreEnv("PB_BLE_AGENT_URL", originalAgentUrl);
  }
}

async function startSwiftAgent(): Promise<ChildProcessWithoutNullStreams> {
  const agent = spawn("swift", ["run", "PocketBridgeBLEAgent"], {
    cwd: macAgentDir,
    env: process.env
  });

  let output = "";
  agent.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  agent.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    if (await agentResponds()) {
      return agent;
    }
    if (agent.exitCode !== null) {
      throw new Error(`Swift BLE agent exited early:\n${output}`);
    }
    await delay(250);
  }

  agent.kill("SIGTERM");
  throw new Error(`Timed out waiting for PocketBridgeBLEAgent:\n${output}`);
}

async function agentResponds(): Promise<boolean> {
  try {
    const response = await fetch(new URL("/transfers", agentUrl), { method: "GET" });
    return response.status === 404;
  } catch {
    return false;
  }
}

async function onceExit(process: ChildProcessWithoutNullStreams): Promise<void> {
  if (process.exitCode !== null || process.killed) {
    return;
  }
  await new Promise<void>((resolve) => process.once("exit", () => resolve()));
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
