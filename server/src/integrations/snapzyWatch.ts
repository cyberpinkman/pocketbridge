import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { importSnapzyFile } from "../routes/snapzy.js";
import { broadcast } from "../websocket/hub.js";

export interface SnapzyWatchOptions {
  watchDir?: string;
  debounceMs?: number;
}

export interface SnapzyWatchHandle {
  close(): void;
}

export function startSnapzyWatch(options: SnapzyWatchOptions = {}): SnapzyWatchHandle {
  const watchDir = options.watchDir ?? config.snapzyWatchDir;
  const pollMs = options.debounceMs ?? 500;
  const seen = new Set<string>();

  fs.mkdirSync(watchDir, { recursive: true });
  for (const entry of fs.readdirSync(watchDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      seen.add(path.join(watchDir, entry.name));
    }
  }

  const interval = setInterval(() => {
    void scanForNewFiles(watchDir, seen);
  }, pollMs);

  return {
    close() {
      clearInterval(interval);
    }
  };
}

async function scanForNewFiles(watchDir: string, seen: Set<string>): Promise<void> {
  const entries = await fs.promises.readdir(watchDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const sourcePath = path.join(watchDir, entry.name);
    if (seen.has(sourcePath)) {
      continue;
    }

    seen.add(sourcePath);
    await importWatchedFile(sourcePath);
  }
}

async function importWatchedFile(sourcePath: string): Promise<void> {
  try {
    const stats = await fs.promises.stat(sourcePath);
    if (!stats.isFile()) {
      return;
    }

    const item = await importSnapzyFile(sourcePath);
    broadcast({ type: "item.created", item });
    console.log(`[snapzy] imported ${sourcePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    console.error(`[snapzy] failed to import ${sourcePath}`, error);
  }
}
