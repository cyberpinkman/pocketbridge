import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { Router } from "express";
import multer from "multer";
import type { Config } from "../config.js";
import type { ItemStore } from "../storage/item-store.js";
import { absoluteStoragePath } from "../storage/file-store.js";
import { isPocketItemOrigin, type PocketItemOrigin } from "../types.js";
import type { WebSocketHub } from "../websocket/hub.js";
import { asyncHandler, badRequest, notFound } from "./errors.js";

function parseTags(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

function parseOrigin(value: unknown): PocketItemOrigin {
  if (!isPocketItemOrigin(value)) {
    badRequest("origin must be mobile, mac, or snapzy");
  }

  return value;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  return value === true || value === "true";
}

function parseLimit(value: unknown): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return Math.min(parsed, 500);
}

function paramString(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    badRequest(`${name} is required`);
  }

  return value;
}

export function itemsRouter(config: Config, store: ItemStore, hub: WebSocketHub): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });

  router.post(
    "/items/text",
    asyncHandler(async (req, res) => {
      const origin = parseOrigin(req.body.origin);
      const text = String(req.body.text ?? "").trim();
      if (!text) badRequest("text is required");

      const item = await store.createTextItem({
        title: String(req.body.title ?? "Untitled text"),
        text,
        origin,
        sourceDevice: String(req.body.sourceDevice ?? config.deviceName),
        tags: parseTags(req.body.tags)
      });

      hub.broadcast("item.created", { item });
      res.status(201).json({ item });
    })
  );

  router.post(
    "/items/upload",
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) badRequest("file is required");
      const origin = parseOrigin(req.body.origin);

      const item = await store.createUploadedFileItem({
        title: typeof req.body.title === "string" ? req.body.title : undefined,
        origin,
        sourceDevice: String(req.body.sourceDevice ?? config.deviceName),
        tags: parseTags(req.body.tags),
        sharedToMobile: parseBoolean(req.body.sharedToMobile),
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer
      });

      hub.broadcast("item.created", { item });
      res.status(201).json({ item });
    })
  );

  router.get(
    "/items",
    asyncHandler(async (req, res) => {
      const origin = req.query.origin ? parseOrigin(req.query.origin) : undefined;
      const sharedToMobile =
        req.query.sharedToMobile === undefined ? undefined : String(req.query.sharedToMobile) === "true";
      const includeArchived = parseBoolean(req.query.includeArchived) ?? false;
      const items = await store.listItems({
        origin,
        sharedToMobile,
        includeArchived,
        limit: parseLimit(req.query.limit)
      });
      res.json({ items });
    })
  );

  router.get(
    "/items/search",
    asyncHandler(async (req, res) => {
      const query = String(req.query.q ?? "").trim();
      if (!query) badRequest("q is required");

      const origin = req.query.origin ? parseOrigin(req.query.origin) : undefined;
      const sharedToMobile =
        req.query.sharedToMobile === undefined ? undefined : String(req.query.sharedToMobile) === "true";
      const includeArchived = parseBoolean(req.query.includeArchived) ?? false;
      const items = await store.searchItems(query, {
        origin,
        sharedToMobile,
        includeArchived,
        limit: parseLimit(req.query.limit)
      });
      res.json({ items });
    })
  );

  router.get(
    "/items/:id",
    asyncHandler(async (req, res) => {
      const id = paramString(req.params.id, "id");
      const item = await store.getItem(id);
      if (!item) notFound("Item not found");
      res.json({ item });
    })
  );

  router.get(
    "/items/:id/download",
    asyncHandler(async (req, res) => {
      const id = paramString(req.params.id, "id");
      const item = await store.getItem(id);
      if (!item) notFound("Item not found");
      if (!item.storageRelPath) notFound("Item has no downloadable file");

      const absolutePath = absoluteStoragePath(config, item.storageRelPath);
      try {
        await fs.access(absolutePath, constants.R_OK);
      } catch {
        notFound("Item file not found");
      }
      res.setHeader("Content-Type", item.mimeType ?? "application/octet-stream");
      res.download(absolutePath, item.originalFilename ?? path.basename(absolutePath));
    })
  );

  router.post(
    "/items/:id/share-to-mobile",
    asyncHandler(async (req, res) => {
      const id = paramString(req.params.id, "id");
      const item = await store.updateItem(id, { sharedToMobile: parseBoolean(req.body.sharedToMobile) ?? true });
      if (!item) notFound("Item not found");

      hub.broadcast("item.shared", { item });
      res.json({ item });
    })
  );

  router.post(
    "/items/:id/archive",
    asyncHandler(async (req, res) => {
      const id = paramString(req.params.id, "id");
      const item = await store.archiveItem(id, parseBoolean(req.body.archived) ?? true);
      if (!item) notFound("Item not found");

      hub.broadcast("item.updated", { item });
      res.json({ item });
    })
  );

  router.delete(
    "/items/:id",
    asyncHandler(async (req, res) => {
      const id = paramString(req.params.id, "id");
      const item = await store.deleteItem(id);
      if (!item) notFound("Item not found");

      hub.broadcast("item.deleted", { item });
      res.json({ item });
    })
  );

  return router;
}
