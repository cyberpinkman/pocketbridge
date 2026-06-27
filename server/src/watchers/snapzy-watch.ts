import path from "node:path";
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { Config } from "../config.js";
import type { ItemStore } from "../storage/item-store.js";
import type { WebSocketHub } from "../websocket/hub.js";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".txt": "text/plain"
};

export function startSnapzyWatch(config: Config, store: ItemStore, hub: WebSocketHub): FSWatcher {
  const watcher = chokidar.watch(config.snapzyWatchDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 700, pollInterval: 100 }
  });

  watcher.on("add", async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) return;

    try {
      const item = await store.importFileItem({
        title: path.basename(filePath),
        origin: "snapzy",
        sourceDevice: config.deviceName,
        tags: ["snapzy"],
        originalFilename: path.basename(filePath),
        mimeType,
        sourcePath: filePath
      });

      hub.broadcast("item.created", { item });
      console.log(`[snapzy] imported ${filePath}`);
    } catch (error) {
      console.error(`[snapzy] failed to import ${filePath}`, error);
    }
  });

  return watcher;
}
