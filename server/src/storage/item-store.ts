import fs from "node:fs/promises";
import path from "node:path";
import { customAlphabet } from "nanoid";
import type { Config } from "../config.js";
import type { ItemFilters, PocketItem, PocketItemKind, PocketItemOrigin } from "../types.js";
import { importExistingFile, writeUploadFile } from "./file-store.js";

type MetadataFile = {
  items: PocketItem[];
};

const randomIdSuffix = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);
const BACKUP_SUFFIX = ".bak";
const TEMP_SUFFIX = ".tmp";

export type CreateTextItemInput = {
  title: string;
  text: string;
  origin: PocketItemOrigin;
  sourceDevice: string;
  tags?: string[];
};

export type CreateUploadedFileItemInput = {
  title?: string;
  origin: PocketItemOrigin;
  sourceDevice: string;
  tags?: string[];
  sharedToMobile?: boolean;
  originalFilename: string;
  mimeType?: string;
  buffer: Buffer;
};

export type ImportFileItemInput = {
  title?: string;
  origin: PocketItemOrigin;
  sourceDevice: string;
  tags?: string[];
  sharedToMobile?: boolean;
  originalFilename: string;
  mimeType?: string;
  sourcePath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function newItemId(): string {
  return `itm_${Date.now()}_${randomIdSuffix()}`;
}

function kindFromMime(origin: PocketItemOrigin, mimeType?: string, filename?: string): PocketItemKind {
  if (origin === "snapzy" && (mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(filename ?? ""))) {
    return "screenshot";
  }

  if (mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(filename ?? "")) {
    return "image";
  }

  return "file";
}

function withDownloadUrl(item: PocketItem): PocketItem {
  if (!item.storageRelPath) return { ...item };
  return { ...item, downloadUrl: `/api/items/${item.id}/download` };
}

function cleanTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(target: string, value: unknown, options: { backupExisting?: boolean } = {}): Promise<void> {
  const payload = JSON.stringify(value, null, 2);
  const temp = `${target}${TEMP_SUFFIX}`;
  const backupExisting = options.backupExisting ?? true;

  await fs.mkdir(path.dirname(target), { recursive: true });
  if (backupExisting && (await fileExists(target))) {
    await fs.copyFile(target, `${target}${BACKUP_SUFFIX}`);
  }

  await fs.writeFile(temp, payload);
  await fs.rename(temp, target);
}

async function readMetadataFile(target: string): Promise<MetadataFile> {
  const raw = await fs.readFile(target, "utf8");
  const parsed = JSON.parse(raw) as MetadataFile;
  return { items: Array.isArray(parsed.items) ? parsed.items : [] };
}

export class ItemStore {
  private items: PocketItem[] = [];
  private loaded = false;

  constructor(private readonly config: Config) {}

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.config.metadataPath), { recursive: true });
    await this.load();
  }

  async createTextItem(input: CreateTextItemInput): Promise<PocketItem> {
    await this.load();
    const createdAt = nowIso();
    const item: PocketItem = {
      id: newItemId(),
      kind: "text",
      title: input.title.trim() || "Untitled text",
      origin: input.origin,
      sourceDevice: input.sourceDevice.trim() || "unknown",
      text: input.text,
      tags: cleanTags(input.tags),
      sharedToMobile: false,
      status: "inbox",
      createdAt,
      updatedAt: createdAt
    };

    this.items.unshift(item);
    await this.save();
    return withDownloadUrl(item);
  }

  async createUploadedFileItem(input: CreateUploadedFileItemInput): Promise<PocketItem> {
    await this.load();
    const id = newItemId();
    const file = await writeUploadFile(this.config, id, input.buffer);
    return await this.createStoredFileItem({
      id,
      title: input.title,
      origin: input.origin,
      sourceDevice: input.sourceDevice,
      tags: input.tags,
      sharedToMobile: input.sharedToMobile,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      storageRelPath: file.storageRelPath,
      sizeBytes: file.sizeBytes
    });
  }

  async importFileItem(input: ImportFileItemInput): Promise<PocketItem> {
    await this.load();
    const id = newItemId();
    const file = await importExistingFile(this.config, id, input.sourcePath);
    return await this.createStoredFileItem({
      id,
      title: input.title,
      origin: input.origin,
      sourceDevice: input.sourceDevice,
      tags: input.tags,
      sharedToMobile: input.sharedToMobile,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      storageRelPath: file.storageRelPath,
      sizeBytes: file.sizeBytes
    });
  }

  async listItems(filters: ItemFilters = {}): Promise<PocketItem[]> {
    await this.load();
    const limit = filters.limit ?? 100;
    return this.items
      .filter((item) => !filters.origin || item.origin === filters.origin)
      .filter((item) => filters.sharedToMobile === undefined || item.sharedToMobile === filters.sharedToMobile)
      .slice(0, limit)
      .map(withDownloadUrl);
  }

  async getItem(id: string): Promise<PocketItem | undefined> {
    await this.load();
    const item = this.items.find((candidate) => candidate.id === id);
    return item ? withDownloadUrl(item) : undefined;
  }

  async updateItem(id: string, patch: Partial<Omit<PocketItem, "id" | "createdAt">>): Promise<PocketItem | undefined> {
    await this.load();
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return undefined;

    const updated: PocketItem = {
      ...this.items[index],
      ...patch,
      updatedAt: nowIso()
    };

    this.items[index] = updated;
    await this.saveItemMetadata(updated);
    await this.save();
    return withDownloadUrl(updated);
  }

  private async createStoredFileItem(input: {
    id: string;
    title?: string;
    origin: PocketItemOrigin;
    sourceDevice: string;
    tags?: string[];
    sharedToMobile?: boolean;
    originalFilename: string;
    mimeType?: string;
    storageRelPath: string;
    sizeBytes: number;
  }): Promise<PocketItem> {
    const createdAt = nowIso();
    const title = input.title?.trim() || input.originalFilename || "Untitled file";
    const item: PocketItem = {
      id: input.id,
      kind: kindFromMime(input.origin, input.mimeType, input.originalFilename),
      title,
      origin: input.origin,
      sourceDevice: input.sourceDevice.trim() || "unknown",
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      originalFilename: input.originalFilename,
      storageRelPath: input.storageRelPath,
      tags: cleanTags(input.tags),
      sharedToMobile: input.sharedToMobile ?? false,
      status: "inbox",
      createdAt,
      updatedAt: createdAt,
      downloadUrl: `/api/items/${input.id}/download`
    };

    this.items.unshift(item);
    await this.saveItemMetadata(item);
    await this.save();
    return withDownloadUrl(item);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const parsed = await readMetadataFile(this.config.metadataPath);
      this.items = parsed.items;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        const backupPath = `${this.config.metadataPath}${BACKUP_SUFFIX}`;
        try {
          const backup = await readMetadataFile(backupPath);
          this.items = backup.items;
          await this.save({ backupExisting: false });
          this.loaded = true;
          return;
        } catch {
          throw error;
        }
      }

      this.items = [];
      await this.save();
    }

    this.loaded = true;
  }

  private async save(options: { backupExisting?: boolean } = {}): Promise<void> {
    const payload: MetadataFile = { items: this.items };
    await writeJsonAtomic(this.config.metadataPath, payload, options);
  }

  private async saveItemMetadata(item: PocketItem): Promise<void> {
    if (!item.storageRelPath) return;
    const metadataPath = path.join(this.config.dataDir, path.dirname(item.storageRelPath), "metadata.json");
    await writeJsonAtomic(metadataPath, { item: withDownloadUrl(item) });
  }
}
