import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { Router } from "express";
import multer from "multer";
import type { Config } from "../config.js";
import type { ItemStore } from "../storage/item-store.js";
import { absoluteStoragePath } from "../storage/file-store.js";
import { isPocketItemOrigin, type PocketItem, type PocketItemOrigin } from "../types.js";
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

function parseBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;

  badRequest(`${name} must be true or false`);
}

function parseLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    badRequest("limit must be a positive integer");
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    badRequest("limit must be a positive integer");
  }

  return Math.min(parsed, 500);
}

function paramString(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    badRequest(`${name} is required`);
  }

  return value;
}

function uploadStagingDir(config: Config): string {
  return path.join(config.dataDir, "tmp", "uploads");
}

function uploadStorage(config: Config): multer.StorageEngine {
  return multer.diskStorage({
    destination(_req, _file, callback) {
      const stagingDir = uploadStagingDir(config);
      fs.mkdir(stagingDir, { recursive: true }).then(
        () => callback(null, stagingDir),
        (error) => callback(error as Error, stagingDir)
      );
    },
    filename(_req, _file, callback) {
      callback(null, `${Date.now()}-${randomUUID()}`);
    }
  });
}

async function cleanupStagedUpload(file: Express.Multer.File): Promise<void> {
  if (!file.path) return;
  await fs.rm(file.path, { force: true });
}

export function itemsRouter(config: Config, store: ItemStore, hub: WebSocketHub): Router {
  const router = Router();
  const upload = multer({ storage: uploadStorage(config), limits: { fileSize: config.maxUploadBytes } });

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

      let item: PocketItem;
      try {
        const origin = parseOrigin(req.body.origin);
        item = await store.importFileItem({
          title: typeof req.body.title === "string" ? req.body.title : undefined,
          origin,
          sourceDevice: String(req.body.sourceDevice ?? config.deviceName),
          tags: parseTags(req.body.tags),
          sharedToMobile: parseBoolean(req.body.sharedToMobile, "sharedToMobile"),
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          sourcePath: req.file.path
        });
      } finally {
        await cleanupStagedUpload(req.file);
      }

      hub.broadcast("item.created", { item });
      res.status(201).json({ item });
    })
  );

  router.get(
    "/items",
    asyncHandler(async (req, res) => {
      const origin = req.query.origin ? parseOrigin(req.query.origin) : undefined;
      const sharedToMobile = parseBoolean(req.query.sharedToMobile, "sharedToMobile");
      const includeArchived = parseBoolean(req.query.includeArchived, "includeArchived") ?? false;
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
      const sharedToMobile = parseBoolean(req.query.sharedToMobile, "sharedToMobile");
      const includeArchived = parseBoolean(req.query.includeArchived, "includeArchived") ?? false;
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
      const item = await store.updateItem(id, {
        sharedToMobile: parseBoolean(req.body.sharedToMobile, "sharedToMobile") ?? true
      });
      if (!item) notFound("Item not found");

      hub.broadcast("item.shared", { item });
      res.json({ item });
    })
  );

  router.post(
    "/items/:id/archive",
    asyncHandler(async (req, res) => {
      const id = paramString(req.params.id, "id");
      const item = await store.archiveItem(id, parseBoolean(req.body.archived, "archived") ?? true);
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
