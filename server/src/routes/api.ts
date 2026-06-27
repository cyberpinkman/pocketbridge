import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { config } from "../config.js";
import { exportItemToMarkdown } from "../integrations/knowledgeBase.js";
import { getBleStatus, setBleStatus, type BleStatusValue } from "../integrations/trustState.js";
import { publicBaseUrl } from "../startupInfo.js";
import { addItem, addPairingSession, addShare, readMetadata, removeItem, updateItem } from "../storage/metadataStore.js";
import type { PairingSession, PocketItem, PocketItemKind, PocketItemSource, ShareRequest } from "../types.js";
import { broadcast } from "../websocket/hub.js";

export const apiRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: config.inboxDir,
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname);
      callback(null, `${Date.now()}-${nanoid()}${extension}`);
    }
  }),
  limits: { fileSize: config.maxUploadBytes }
});

apiRouter.get("/pairing", async (request, response, next) => {
  try {
    response.json(await createPairingPayload(request));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/pairing/qr.svg", async (request, response, next) => {
  try {
    const payload = await createPairingPayload(request, request.query.pairCode);
    const svg = await QRCode.toString(JSON.stringify(payload), { type: "svg" });
    response.type("image/svg+xml").send(svg);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/items", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const origin = typeof request.query.origin === "string" ? request.query.origin : undefined;
    const sharedToMobile = typeof request.query.sharedToMobile === "string"
      ? request.query.sharedToMobile === "true"
      : undefined;
    const includeArchived = parseBooleanQuery(request.query.includeArchived);
    const limit = parseItemsLimit(request.query.limit);
    const items = visibleItems(metadata.items, includeArchived)
      .map(toUpstreamItem)
      .filter((item) => (origin ? item.origin === origin : true))
      .filter((item) =>
        typeof sharedToMobile === "boolean" ? item.sharedToMobile === sharedToMobile : true
      )
      .slice(0, limit);
    response.json({ items });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/inbox", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    const includeArchived = parseBooleanQuery(request.query.includeArchived);
    const limit = parseItemsLimit(request.query.limit);
    const items = filterItems(visibleItems(metadata.items, includeArchived), query).slice(0, limit).map(toUpstreamItem);
    response.json({ items, total: items.length });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/search", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    const origin = typeof request.query.origin === "string" ? request.query.origin : undefined;
    const sharedToMobile = typeof request.query.sharedToMobile === "string"
      ? request.query.sharedToMobile === "true"
      : undefined;
    const includeArchived = parseBooleanQuery(request.query.includeArchived);
    const limit = parseItemsLimit(request.query.limit);
    const items = filterItems(visibleItems(metadata.items, includeArchived), query)
      .map(toUpstreamItem)
      .filter((item) => (origin ? item.origin === origin : true))
      .filter((item) =>
        typeof sharedToMobile === "boolean" ? item.sharedToMobile === sharedToMobile : true
      )
      .slice(0, limit);
    response.json({ query, items, total: items.length });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/items/search", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    const origin = typeof request.query.origin === "string" ? request.query.origin : undefined;
    const sharedToMobile = typeof request.query.sharedToMobile === "string"
      ? request.query.sharedToMobile === "true"
      : undefined;
    const includeArchived = parseBooleanQuery(request.query.includeArchived);
    const limit = parseItemsLimit(request.query.limit);
    const items = filterItems(visibleItems(metadata.items, includeArchived), query)
      .map(toUpstreamItem)
      .filter((item) => (origin ? item.origin === origin : true))
      .filter((item) =>
        typeof sharedToMobile === "boolean" ? item.sharedToMobile === sharedToMobile : true
      )
      .slice(0, limit);
    response.json({ query, items, total: items.length });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/items/text", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const { title, text, origin, sourceDevice, tags } = request.body as {
      title?: unknown;
      text?: unknown;
      origin?: unknown;
      sourceDevice?: unknown;
      tags?: unknown;
    };
    if (typeof text !== "string" || text.trim() === "") {
      response.status(400).json({
        error: { code: "BAD_REQUEST", message: "text is required" }
      });
      return;
    }

    const normalizedOrigin = typeof origin === "string" ? origin.trim() : "";
    const normalizedSourceDevice = typeof sourceDevice === "string" ? sourceDevice.trim() : "";
    if (!isUpstreamOrigin(normalizedOrigin) || !normalizedSourceDevice) {
      response.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "origin must be mobile, mac, or snapzy; sourceDevice is required"
        }
      });
      return;
    }

    const now = new Date().toISOString();
    const item: PocketItem = {
      id: createItemId(),
      kind: "text",
      source: toLocalSource(normalizedOrigin),
      title: typeof title === "string" && title.trim() ? title.trim() : summarizeText(text),
      createdAt: now,
      updatedAt: now,
      text: text.trim(),
      status: "inbox",
      sourceDevice: normalizedSourceDevice,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      sharedToMobile: false
    };

    await addItem(item);
    broadcast({ type: "item.created", item });
    response.status(201).json({ item: toUpstreamItem(item) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/items/upload", upload.single("file"), async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const file = request.file;
    if (!file) {
      response.status(400).json({
        error: { code: "BAD_REQUEST", message: "file is required" }
      });
      return;
    }

    const origin = typeof request.body.origin === "string" ? request.body.origin.trim() : "";
    const sourceDevice = typeof request.body.sourceDevice === "string"
      ? request.body.sourceDevice.trim()
      : "";
    if (!isUpstreamOrigin(origin) || !sourceDevice) {
      await fs.rm(file.path, { force: true });
      response.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "origin must be mobile, mac, or snapzy; sourceDevice is required"
        }
      });
      return;
    }

    const now = new Date().toISOString();
    const itemId = createItemId();
    const filePath = await moveUploadIntoContractPath(file.path, itemId, now);
    const item: PocketItem = {
      id: itemId,
      kind: inferKind(file.mimetype, toLocalSource(origin)),
      source: toLocalSource(origin),
      title: typeof request.body.title === "string" && request.body.title.trim()
        ? request.body.title.trim()
        : file.originalname,
      createdAt: now,
      updatedAt: now,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      filePath,
      status: "inbox",
      sourceDevice,
      tags: parseTags(request.body.tags),
      sharedToMobile: request.body.sharedToMobile === "true"
    };

    await addItem(item);
    broadcast({ type: "item.created", item });
    response.status(201).json({ item: toUpstreamItem(item) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/items/:itemId", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item) {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: "item not found" }
      });
      return;
    }

    response.json({ item: toUpstreamItem(item) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/items/:itemId/share-to-mobile", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item) {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: "item not found" }
      });
      return;
    }

    const shouldShare = request.body.sharedToMobile !== false;
    const updatedItem = await updateItem({
      ...item,
      sharedToMobile: shouldShare,
      updatedAt: new Date().toISOString()
    });

    if (shouldShare) {
      const share: ShareRequest = {
        id: nanoid(),
        itemId: updatedItem.id,
        target: "phone",
        status: "queued",
        createdAt: updatedItem.updatedAt ?? new Date().toISOString()
      };
      await addShare(share);
      broadcast({ type: "share.queued", share });
    }

    broadcast({ type: "item.updated", item: updatedItem });
    response.json({ item: toUpstreamItem(updatedItem) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/items/:itemId/archive", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    if (typeof request.body.archived !== "boolean") {
      response.status(400).json({
        error: { code: "BAD_REQUEST", message: "archived must be a boolean" }
      });
      return;
    }

    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item) {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: "item not found" }
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedItem = await updateItem({
      ...item,
      archivedAt: request.body.archived ? now : undefined,
      updatedAt: now
    });

    broadcast({ type: "item.updated", item: updatedItem });
    response.json({ item: toUpstreamItem(updatedItem) });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/items/:itemId", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const item = await removeItem(request.params.itemId);
    if (!item) {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: "item not found" }
      });
      return;
    }

    await removeInboxArtifact(item);
    broadcast({ type: "item.deleted", item });
    response.json({ item: { id: item.id } });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/items/:itemId/download", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item?.filePath) {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: "downloadable file not found" }
      });
      return;
    }

    const resolvedFilePath = path.resolve(item.filePath);
    const inboxRoot = path.resolve(config.inboxDir);
    if (!resolvedFilePath.startsWith(`${inboxRoot}${path.sep}`)) {
      response.status(403).json({
        error: { code: "UNAUTHORIZED", message: "file is outside PocketInbox" }
      });
      return;
    }

    try {
      await fs.access(resolvedFilePath);
    } catch {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: "downloadable file not found" }
      });
      return;
    }

    response.download(resolvedFilePath, item.originalName ?? path.basename(resolvedFilePath));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/knowledge/:itemId", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item) {
      response.status(404).json({
        error: { code: "NOT_FOUND", message: "item not found" }
      });
      return;
    }

    const vaultDir = typeof request.body.vaultDir === "string" && request.body.vaultDir.trim()
      ? request.body.vaultDir.trim()
      : config.obsidianDir;
    const exportTags = Array.isArray(request.body.tags) ? request.body.tags.map(String) : item.tags;
    const exportNote = typeof request.body.note === "string" ? request.body.note : undefined;
    const itemForExport = {
      ...item,
      tags: exportTags
    };
    const exportResult = await exportItemToMarkdown(itemForExport, { vaultDir, note: exportNote });
    const updatedItem = await updateItem({
      ...itemForExport,
      status: "exported",
      knowledgeTarget: exportResult.outputPath,
      updatedAt: new Date().toISOString()
    });

    broadcast({ type: "item.updated", item: updatedItem });
    broadcast({ type: "knowledge.saved", item: updatedItem });
    response.json({ item: toUpstreamItem(updatedItem) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/ble/status", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    response.json(getBleStatus());
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/ble/status", async (request, response, next) => {
  try {
    const auth = await requirePairCode(request);
    if (!auth.ok) {
      response.status(401).json(unauthorizedError());
      return;
    }

    const status = request.body.status;
    if (!isBleStatus(status)) {
      response.status(400).json({
        error: { code: "BAD_REQUEST", message: "status must be trusted, away, locked, or unknown" }
      });
      return;
    }

    const deviceName = typeof request.body.deviceName === "string" && request.body.deviceName.trim()
      ? request.body.deviceName.trim()
      : "PocketBridge Mobile";
    const rssi = typeof request.body.rssi === "number" ? request.body.rssi : undefined;
    const bleStatus = setBleStatus(status, deviceName, rssi);

    broadcast({
      type: "trust.changed",
      trusted: bleStatus.status === "trusted",
      reason: `BLE status: ${bleStatus.status}`
    });
    response.json(bleStatus);
  } catch (error) {
    next(error);
  }
});

function createPairCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function createPairingPayload(request: {
  protocol: string;
  get(name: string): string | undefined;
}, requestedPairCode?: unknown) {
  const now = new Date();
  const requested = typeof requestedPairCode === "string" && isPairCode(requestedPairCode)
    ? requestedPairCode
    : undefined;
  const configured = !requested && isPairCode(process.env.PB_PAIR_CODE)
    ? process.env.PB_PAIR_CODE
    : undefined;
  const preferredPairCode = requested ?? configured;
  const metadata = preferredPairCode ? await readMetadata() : undefined;
  const existingSession = metadata?.pairingSessions.find(
    (candidate) => candidate.token === preferredPairCode && Date.parse(candidate.expiresAt) >= Date.now()
  );
  const pairCode = existingSession?.token ?? preferredPairCode ?? createPairCode();
  const expiresAt = existingSession?.expiresAt ?? new Date(now.getTime() + 10 * 60 * 1000).toISOString();

  if (!existingSession) {
    const session: PairingSession = {
      id: nanoid(),
      token: pairCode,
      createdAt: now.toISOString(),
      expiresAt
    };
    await addPairingSession(session);
  }

  const serverBaseUrl = resolveServerBaseUrl(request);
  return {
    protocol: "pocketbridge",
    version: 1,
    serverBaseUrl,
    wsUrl: serverBaseUrl.replace(/^http/, "ws") + "/ws",
    pairCode,
    deviceName: process.env.PB_DEVICE_NAME ?? "PocketBridge Mac",
    expiresAt,
    capabilities: ["upload", "download", "websocket", "knowledge", "ble-status"]
  };
}

function createItemId(): string {
  return `itm_${Date.now()}_${nanoid(8).toLowerCase()}`;
}

function isPairCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{6}$/.test(value);
}

async function moveUploadIntoContractPath(sourcePath: string, itemId: string, createdAt: string): Promise<string> {
  const targetDir = path.join(config.inboxDir, createdAt.slice(0, 10), itemId);
  const targetPath = path.join(targetDir, "original");
  await fs.mkdir(targetDir, { recursive: true });
  await fs.rename(sourcePath, targetPath);
  return targetPath;
}

async function requirePairCode(request: {
  get(name: string): string | undefined;
}): Promise<{ ok: boolean }> {
  const pairCode = request.get("x-pocketbridge-pair-code");
  if (!pairCode) {
    return { ok: false };
  }

  const metadata = await readMetadata();
  const session = metadata.pairingSessions.find((candidate) => candidate.token === pairCode);
  if (!session || Date.parse(session.expiresAt) < Date.now()) {
    return { ok: false };
  }

  return { ok: true };
}

function unauthorizedError(): { error: { code: string; message: string } } {
  return { error: { code: "UNAUTHORIZED", message: "Invalid pair code" } };
}

function resolveServerBaseUrl(request: { protocol: string; get(name: string): string | undefined }): string {
  const publicHost = config.publicHost;
  if (publicHost) {
    return publicBaseUrl(config);
  }

  return `${request.protocol}://${
    request.get("x-forwarded-host") ?? request.get("host") ?? `localhost:${config.port}`
  }`;
}

function toLocalSource(origin: unknown): PocketItemSource {
  if (origin === "mac" || origin === "snapzy") {
    return origin;
  }
  return "phone";
}

function isUpstreamOrigin(value: string): value is "mobile" | "mac" | "snapzy" {
  return value === "mobile" || value === "mac" || value === "snapzy";
}

function toUpstreamOrigin(source: PocketItemSource): "mobile" | "mac" | "snapzy" {
  if (source === "snapzy") {
    return "snapzy";
  }
  if (source === "mac" || source === "system") {
    return "mac";
  }
  return "mobile";
}

function toUpstreamKind(item: PocketItem): "text" | "image" | "file" | "screenshot" {
  if (item.kind === "text") {
    return "text";
  }
  if (item.kind === "image") {
    return item.source === "snapzy" ? "screenshot" : "image";
  }
  return "file";
}

function toUpstreamStatus(item: PocketItem): "inbox" | "saved_to_knowledge" {
  return item.status === "exported" ? "saved_to_knowledge" : "inbox";
}

function inferKind(mimeType: string | undefined, source: PocketItemSource): PocketItemKind {
  if (source === "snapzy") {
    return "image";
  }
  if (mimeType?.startsWith("image/")) {
    return "image";
  }
  return "document";
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }
  try {
    const decoded = JSON.parse(value);
    return Array.isArray(decoded) ? decoded.map(String) : [];
  } catch {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
}

function parseItemsLimit(value: unknown): number {
  if (typeof value !== "string") {
    return 100;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

function parseBooleanQuery(value: unknown): boolean {
  return value === "true";
}

function isBleStatus(value: unknown): value is BleStatusValue {
  return value === "trusted" || value === "away" || value === "locked" || value === "unknown";
}

function filterItems(items: PocketItem[], query: string): PocketItem[] {
  if (!query) {
    return items;
  }

  const normalizedQuery = query.toLowerCase();
  return items.filter((item) => itemSearchText(item).includes(normalizedQuery));
}

function visibleItems(items: PocketItem[], includeArchived: boolean): PocketItem[] {
  return includeArchived ? items : items.filter((item) => !isArchived(item));
}

function isArchived(item: PocketItem): boolean {
  return item.status === "archived" || Boolean(item.archivedAt);
}

function itemSearchText(item: PocketItem): string {
  return [
    item.title,
    item.text,
    item.kind,
    item.source,
    item.sourceDevice,
    item.status,
    item.originalName,
    item.mimeType,
    ...(item.tags ?? [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toUpstreamItem(item: PocketItem) {
  return {
    id: item.id,
    kind: toUpstreamKind(item),
    title: item.title,
    origin: toUpstreamOrigin(item.source),
    sourceDevice: item.sourceDevice ?? defaultSourceDevice(item.source),
    mimeType: item.mimeType,
    sizeBytes: item.size,
    originalFilename: item.originalName,
    storageRelPath: toStorageRelPath(item.filePath),
    text: item.text,
    tags: item.tags ?? [],
    sharedToMobile: item.sharedToMobile ?? false,
    status: toUpstreamStatus(item),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? item.createdAt,
    archivedAt: item.archivedAt,
    downloadUrl: item.filePath ? `/api/items/${item.id}/download` : undefined,
    knowledgePath: item.knowledgeTarget
  };
}

async function removeInboxArtifact(item: PocketItem): Promise<void> {
  if (!item.filePath) {
    return;
  }

  const resolvedFilePath = path.resolve(item.filePath);
  const inboxRoot = path.resolve(config.inboxDir);
  if (!resolvedFilePath.startsWith(`${inboxRoot}${path.sep}`)) {
    return;
  }

  const parentDir = path.dirname(resolvedFilePath);
  const removalTarget = path.basename(parentDir) === item.id ? parentDir : resolvedFilePath;
  await fs.rm(removalTarget, { recursive: true, force: true });
}

function toStorageRelPath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const relativePath = path.relative(config.dataDir, path.resolve(filePath));
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }
  return relativePath.split(path.sep).join("/");
}

function defaultSourceDevice(source: PocketItemSource): string {
  if (source === "phone") {
    return "PocketBridge Mobile";
  }
  if (source === "snapzy") {
    return "Snapzy";
  }
  return "PocketBridge Mac";
}

function summarizeText(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
}
