import path from "node:path";
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { Config } from "../config.js";
import type { ItemStore } from "../storage/item-store.js";
import { mimeTypeFromFilename } from "../storage/mime.js";
import type { WebSocketHub } from "../websocket/hub.js";

const SNAPZY_IMPORT_MIME_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain"
]);

export function startSnapzyWatch(config: Config, store: ItemStore, hub: WebSocketHub): FSWatcher {
  const watcher = chokidar.watch(config.snapzyWatchDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 700, pollInterval: 100 }
  });

  watcher.on("add", async (filePath) => {
    const mimeType = mimeTypeFromFilename(filePath);
    if (!mimeType || !SNAPZY_IMPORT_MIME_TYPES.has(mimeType)) return;

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
