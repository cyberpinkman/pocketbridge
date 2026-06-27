import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { addItem } from "../storage/metadataStore.js";
import type { PocketItem, PocketItemKind, PocketItemSource } from "../types.js";
import { broadcast } from "../websocket/hub.js";

const upload = multer({
  storage: multer.diskStorage({
    destination: config.inboxDir,
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname);
      callback(null, `${Date.now()}-${nanoid()}${extension}`);
    }
  })
});

export const uploadRouter = Router();

uploadRouter.post("/", upload.single("file"), async (request, response, next) => {
  try {
    const source = normalizeSource(request.body.source);
    const text = typeof request.body.text === "string" ? request.body.text.trim() : undefined;
    const file = request.file;

    if (!file && !text) {
      response.status(400).json({ error: "file or text is required" });
      return;
    }

    const item: PocketItem = {
      id: nanoid(),
      kind: inferKind(file?.mimetype, text),
      source,
      title: buildTitle(file?.originalname, text),
      createdAt: new Date().toISOString(),
      originalName: file?.originalname,
      mimeType: file?.mimetype,
      size: file?.size,
      filePath: file?.path,
      text,
      status: "inbox"
    };

    await addItem(item);
    broadcast({ type: "item.created", item });
    response.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

function normalizeSource(value: unknown): PocketItemSource {
  if (value === "mac" || value === "snapzy" || value === "system") {
    return value;
  }

  return "phone";
}

function inferKind(mimeType: string | undefined, text: string | undefined): PocketItemKind {
  if (!mimeType && text) {
    return "text";
  }

  if (mimeType?.startsWith("image/")) {
    return "image";
  }

  return "document";
}

function buildTitle(originalName: string | undefined, text: string | undefined): string {
  if (originalName) {
    return originalName;
  }

  if (text) {
    return text.length > 40 ? `${text.slice(0, 40)}...` : text;
  }

  return "Untitled item";
}
