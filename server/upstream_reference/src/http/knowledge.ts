import path from "node:path";
import { Router } from "express";
import type { Config } from "../config.js";
import type { ItemStore } from "../storage/item-store.js";
import { writeKnowledgeMarkdown } from "../storage/knowledge-writer.js";
import type { WebSocketHub } from "../websocket/hub.js";
import { asyncHandler, badRequest, notFound } from "./errors.js";

function parseTags(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function paramString(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    badRequest(`${name} is required`);
  }

  return value;
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function knowledgePathForResponse(config: Config, target: string): string {
  const baseDir = path.dirname(config.dataDir);
  return normalizePath(path.relative(baseDir, target));
}

export function knowledgeRouter(config: Config, store: ItemStore, hub: WebSocketHub): Router {
  const router = Router();

  router.post(
    "/knowledge/:id",
    asyncHandler(async (req, res) => {
      const id = paramString(req.params.id, "id");
      const item = await store.getItem(id);
      if (!item) notFound("Item not found");

      const target = await writeKnowledgeMarkdown(config, item, {
        tags: parseTags(req.body.tags),
        note: typeof req.body.note === "string" ? req.body.note : undefined
      });

      const updated = await store.updateItem(item.id, {
        status: "saved_to_knowledge",
        knowledgePath: knowledgePathForResponse(config, target)
      });

      hub.broadcast("knowledge.saved", { item: updated });
      res.json({ item: updated });
    })
  );

  return router;
}
