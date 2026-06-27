import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { config } from "../config.js";
import { readMetadata } from "../storage/metadataStore.js";

export const itemsRouter = Router();

itemsRouter.get("/", async (_request, response, next) => {
  try {
    const metadata = await readMetadata();
    response.json({ items: metadata.items });
  } catch (error) {
    next(error);
  }
});

itemsRouter.get("/:itemId/download", async (request, response, next) => {
  try {
    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item?.filePath) {
      response.status(404).json({ error: "downloadable file not found" });
      return;
    }

    const resolvedFilePath = path.resolve(item.filePath);
    const inboxRoot = path.resolve(config.inboxDir);
    if (!resolvedFilePath.startsWith(`${inboxRoot}${path.sep}`)) {
      response.status(403).json({ error: "file is outside PocketInbox" });
      return;
    }

    try {
      await fs.access(resolvedFilePath);
    } catch {
      response.status(404).json({ error: "downloadable file not found" });
      return;
    }

    response.download(resolvedFilePath, item.originalName ?? path.basename(resolvedFilePath));
  } catch (error) {
    next(error);
  }
});
