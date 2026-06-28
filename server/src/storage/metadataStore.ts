import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { PairingSession, PocketItem, PocketMetadata, ShareRequest } from "../types.js";

const initialMetadata: PocketMetadata = {
  items: [],
  pairingSessions: [],
  shares: []
};

let mutationQueue: Promise<void> = Promise.resolve();

export async function ensureStorage(): Promise<void> {
  await fs.mkdir(config.inboxDir, { recursive: true });

  try {
    await fs.access(config.metadataPath);
  } catch {
    await fs.writeFile(config.metadataPath, JSON.stringify(initialMetadata, null, 2));
  }
}

async function readMetadataFromDisk(): Promise<PocketMetadata> {
  await ensureStorage();
  const raw = await fs.readFile(config.metadataPath, "utf8");
  return JSON.parse(raw) as PocketMetadata;
}

async function writeMetadataToDisk(metadata: PocketMetadata): Promise<void> {
  await fs.mkdir(path.dirname(config.metadataPath), { recursive: true });
  const temporaryPath = `${config.metadataPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(metadata, null, 2));
  await fs.rename(temporaryPath, config.metadataPath);
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(operation, operation);
  mutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function updateMetadata<T>(operation: (metadata: PocketMetadata) => T | Promise<T>): Promise<T> {
  return enqueueMutation(async () => {
    const metadata = await readMetadataFromDisk();
    const result = await operation(metadata);
    await writeMetadataToDisk(metadata);
    return result;
  });
}

export async function readMetadata(): Promise<PocketMetadata> {
  await mutationQueue;
  return readMetadataFromDisk();
}

export async function writeMetadata(metadata: PocketMetadata): Promise<void> {
  await enqueueMutation(() => writeMetadataToDisk(metadata));
}

export async function addItem(item: PocketItem): Promise<PocketItem> {
  return updateMetadata((metadata) => {
    metadata.items.unshift(item);
    return item;
  });
}

export async function addPairingSession(session: PairingSession): Promise<PairingSession> {
  return updateMetadata((metadata) => {
    metadata.pairingSessions.unshift(session);
    return session;
  });
}

export async function updatePairingSession(session: PairingSession): Promise<PairingSession> {
  return updateMetadata((metadata) => {
    metadata.pairingSessions = metadata.pairingSessions.map((candidate) =>
      candidate.id === session.id ? session : candidate
    );
    return session;
  });
}

export async function addShare(share: ShareRequest): Promise<ShareRequest> {
  return updateMetadata((metadata) => {
    metadata.shares.unshift(share);
    return share;
  });
}

export async function updateItem(item: PocketItem): Promise<PocketItem> {
  return updateMetadata((metadata) => {
    metadata.items = metadata.items.map((candidate) => (candidate.id === item.id ? item : candidate));
    return item;
  });
}

export async function updateShare(share: ShareRequest): Promise<ShareRequest> {
  return updateMetadata((metadata) => {
    metadata.shares = metadata.shares.map((candidate) =>
      candidate.id === share.id ? share : candidate
    );
    return share;
  });
}
