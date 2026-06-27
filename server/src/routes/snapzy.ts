import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { addItem } from "../storage/metadataStore.js";
import type { PocketItem, PocketItemKind } from "../types.js";
import { broadcast } from "../websocket/hub.js";

export const snapzyRouter = Router();

snapzyRouter.post("/import", async (_request, response, next) => {
  try {
    const items: PocketItem[] = [];

    for (const snapzyInbox of snapzyInboxDirs()) {
      await fs.mkdir(snapzyInbox, { recursive: true });
      const entries = await fs.readdir(snapzyInbox, { withFileTypes: true });
      const files = entries.filter((entry) => entry.isFile());

      for (const file of files) {
        const sourcePath = path.join(snapzyInbox, file.name);
        const item = await importSnapzyFile(sourcePath);
        broadcast({ type: "item.created", item });
        items.push(item);
      }
    }

    response.status(201).json({ items });
  } catch (error) {
    next(error);
  }
});

export async function importSnapzyFile(sourcePath: string): Promise<PocketItem> {
  const fileName = path.basename(sourcePath);
  const extension = path.extname(fileName);
  const createdAt = new Date().toISOString();
  const itemId = createItemId();
  const targetPath = path.join(config.inboxDir, createdAt.slice(0, 10), itemId, "original");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);

  const stats = await fs.stat(targetPath);
  const item: PocketItem = {
    id: itemId,
    kind: inferKind(extension),
    source: "snapzy",
    title: fileName,
    createdAt,
    originalName: fileName,
    mimeType: inferMimeType(extension),
    size: stats.size,
    filePath: targetPath,
    status: "inbox"
  };

  return addItem(item);
}

function snapzyInboxDirs(): string[] {
  if (process.env.SNAPZY_EXPORT_DIR) {
    return [path.resolve(process.env.SNAPZY_EXPORT_DIR)];
  }
  if (process.env.PB_SNAPZY_WATCH_DIR) {
    return [config.snapzyWatchDir];
  }

  return [
    config.snapzyWatchDir,
    config.legacySnapzyInboxDir
  ];
}

function createItemId(): string {
  return `itm_${Date.now()}_${nanoid(8).toLowerCase()}`;
}

function inferKind(extension: string): PocketItemKind {
  const normalized = extension.toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].includes(normalized)) {
    return "image";
  }
  return "document";
}

function inferMimeType(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".txt":
      return "text/plain";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
