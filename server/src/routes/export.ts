import { Router } from "express";
import { config } from "../config.js";
import { exportItemToMarkdown } from "../integrations/knowledgeBase.js";
import { readMetadata, updateItem } from "../storage/metadataStore.js";
import { broadcast } from "../websocket/hub.js";

export const exportRouter = Router();

exportRouter.post("/:itemId", async (request, response, next) => {
  try {
    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item) {
      response.status(404).json({ error: "item not found" });
      return;
    }

    const vaultDir = typeof request.body.vaultDir === "string" && request.body.vaultDir.trim()
      ? request.body.vaultDir.trim()
      : config.obsidianDir;
    const exportResult = await exportItemToMarkdown(item, { vaultDir });
    const exportedItem = await updateItem({
      ...item,
      status: "exported",
      knowledgeTarget: exportResult.outputPath
    });
    broadcast({ type: "item.updated", item: exportedItem });
    response.json({
      ...exportResult,
      item: exportedItem
    });
  } catch (error) {
    next(error);
  }
});
