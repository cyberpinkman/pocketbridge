import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import type { Express } from "express";
import type { FSWatcher } from "chokidar";
import { loadConfig, ensureRuntimeDirs } from "./config.js";
import type { Config } from "./config.js";
import { requirePairCode } from "./auth.js";
import { errorMiddleware } from "./http/errors.js";
import { pairingRouter } from "./http/pairing.js";
import { itemsRouter } from "./http/items.js";
import { knowledgeRouter } from "./http/knowledge.js";
import { bleRouter } from "./http/ble.js";
import { ItemStore } from "./storage/item-store.js";
import { WebSocketHub } from "./websocket/hub.js";
import { startSnapzyWatch } from "./watchers/snapzy-watch.js";

type RuntimeOptions = {
  repoRoot?: string;
  watchSnapzy?: boolean;
};

export type PocketBridgeRuntime = {
  config: Config;
  app: Express;
  server: http.Server;
  store: ItemStore;
  hub: WebSocketHub;
  watcher?: FSWatcher;
  close: () => Promise<void>;
};

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

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function createPocketBridgeRuntime(
  config: Config = loadConfig(),
  options: RuntimeOptions = {}
): Promise<PocketBridgeRuntime> {
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

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = options.repoRoot ?? findRepoRoot(__dirname);
  app.use(express.static(path.join(repoRoot, "apps", "mac_web")));
  app.use(errorMiddleware);

  const watcher = options.watchSnapzy === false ? undefined : startSnapzyWatch(config, store, hub);

  return {
    config,
    app,
    server,
    store,
    hub,
    watcher,
    close: async () => {
      await watcher?.close();
      await hub.close();
      await closeServer(server);
    }
  };
}
