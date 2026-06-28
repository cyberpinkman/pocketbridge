import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config.js";

export type StoredFile = {
  storageRelPath: string;
  sizeBytes: number;
};

export class StoragePathError extends Error {
  constructor(storageRelPath: string) {
    super(`Storage path escapes inbox directory: ${storageRelPath}`);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function itemDir(config: Config, itemId: string): string {
  return path.join(config.inboxDir, today(), itemId);
}

function rel(config: Config, absolutePath: string): string {
  return path.relative(config.dataDir, absolutePath).split(path.sep).join("/");
}

export async function writeUploadFile(config: Config, itemId: string, buffer: Buffer): Promise<StoredFile> {
  const dir = itemDir(config, itemId);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, "original");
  await fs.writeFile(target, buffer);
  return { storageRelPath: rel(config, target), sizeBytes: buffer.length };
}

export async function importExistingFile(config: Config, itemId: string, sourcePath: string): Promise<StoredFile> {
  const dir = itemDir(config, itemId);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, "original");
  await fs.copyFile(sourcePath, target);
  const stat = await fs.stat(target);
  return { storageRelPath: rel(config, target), sizeBytes: stat.size };
}

export function absoluteStoragePath(config: Config, storageRelPath: string): string {
  if (path.isAbsolute(storageRelPath)) {
    throw new StoragePathError(storageRelPath);
  }

  const inboxRoot = path.resolve(config.inboxDir);
  const resolved = path.resolve(config.dataDir, storageRelPath);
  const relative = path.relative(inboxRoot, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new StoragePathError(storageRelPath);
  }

  return resolved;
}
