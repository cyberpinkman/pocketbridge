import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { loadConfig, ensureRuntimeDirs } from "./config.js";
import { requirePairCode } from "./auth.js";
import { errorMiddleware } from "./http/errors.js";
import { pairingRouter } from "./http/pairing.js";
import { itemsRouter } from "./http/items.js";
import { knowledgeRouter } from "./http/knowledge.js";
import { bleRouter } from "./http/ble.js";
import { ItemStore } from "./storage/item-store.js";
import { WebSocketHub } from "./websocket/hub.js";
import { startSnapzyWatch } from "./watchers/snapzy-watch.js";

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(current, "apps", "mac_web"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.resolve(process.cwd(), "..");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(__dirname);

const config = loadConfig();
await ensureRuntimeDirs(config);

const store = new ItemStore(config);
await store.init();

const app = express();
const server = http.createServer(app);
const hub = new WebSocketHub(config);
hub.attach(server);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pocketbridge", version: 1 });
});

app.use("/api", pairingRouter(config));
app.use("/api", requirePairCode(config));
app.use("/api", itemsRouter(config, store, hub));
app.use("/api", knowledgeRouter(config, store, hub));
app.use("/api", bleRouter(config, hub));

const macWebDir = path.join(repoRoot, "apps", "mac_web");
app.use(express.static(macWebDir));

app.use(errorMiddleware);

startSnapzyWatch(config, store, hub);

server.listen(config.port, () => {
  console.log(`PocketBridge server: ${config.serverBaseUrl}`);
  console.log(`Pair code: ${config.pairCode}`);
  console.log(`Mac UI: ${config.serverBaseUrl}/`);
  console.log(`Mobile fallback: ${config.serverBaseUrl}/mobile.html`);
  console.log(`LAN candidates: ${config.lanAddresses.join(", ")}`);
  console.log("If the phone cannot connect, restart with PB_PUBLIC_HOST=<phone-reachable-ip>.");
  console.log(`Snapzy watch: ${config.snapzyWatchDir}`);
});
