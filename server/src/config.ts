import path from "node:path";

const dataDir = path.resolve(process.cwd(), process.env.PB_DATA_DIR ?? "data");

export const config = {
  port: Number(process.env.POCKETBRIDGE_PORT ?? process.env.PORT ?? 3000),
  host: process.env.POCKETBRIDGE_HOST ?? "0.0.0.0",
  publicHost: process.env.PB_PUBLIC_HOST?.trim() || undefined,
  dataDir,
  inboxDir: path.join(dataDir, "inbox"),
  metadataPath: path.join(dataDir, "metadata.json"),
  snapzyWatchDir: path.resolve(process.cwd(), process.env.PB_SNAPZY_WATCH_DIR ?? path.join(dataDir, "watch", "snapzy")),
  legacySnapzyInboxDir: path.resolve(process.cwd(), "integrations", "snapzy", "inbox"),
  obsidianDir: path.resolve(process.cwd(), process.env.PB_OBSIDIAN_DIR ?? path.join(dataDir, "obsidian", "PocketBridge")),
  maxUploadBytes: Number(process.env.PB_MAX_UPLOAD_MB ?? 100) * 1024 * 1024
};
