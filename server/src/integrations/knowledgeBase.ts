import fs from "node:fs/promises";
import path from "node:path";
import type { PocketItem } from "../types.js";

export interface KnowledgeExportOptions {
  vaultDir: string;
  note?: string;
}

export interface KnowledgeExportResult {
  outputPath: string;
  assetPath?: string;
  assetReference?: string;
}

export async function exportItemToMarkdown(
  item: PocketItem,
  options: KnowledgeExportOptions
): Promise<KnowledgeExportResult> {
  const inboxDir = path.join(options.vaultDir, "inbox");
  const assetsDir = path.join(options.vaultDir, "assets", "pocketbridge");
  await fs.mkdir(inboxDir, { recursive: true });

  const filename = `${item.createdAt.slice(0, 10)}-${slugify(item.title)}.md`;
  const outputPath = path.join(inboxDir, filename);
  const asset = await copyAsset(item, assetsDir);
  const summary = summarizeItem(item);
  const markdown = [
    "---",
    `id: ${item.id}`,
    `title: ${item.title}`,
    `origin: ${toKnowledgeOrigin(item.source)}`,
    `sourceDevice: ${item.sourceDevice ?? defaultSourceDevice(item.source)}`,
    `source: ${item.source}`,
    `kind: ${item.kind}`,
    `createdAt: ${item.createdAt}`,
    "tags:",
    ...(item.tags ?? []).map((tag) => `  - ${tag}`),
    "---",
    "",
    `# ${item.title}`,
    "",
    "## Summary",
    "",
    summary,
    "",
    "## Content",
    "",
    item.text ?? "",
    "",
    options.note?.trim() ?? "",
    "",
    `Source: ${toKnowledgeOrigin(item.source)} / ${item.sourceDevice ?? defaultSourceDevice(item.source)}`,
    "",
    asset ? `Asset: [[${asset.reference}]]` : ""
  ].join("\n");

  await fs.writeFile(outputPath, markdown);
  return {
    outputPath,
    assetPath: asset?.path,
    assetReference: asset?.reference
  };
}

function toKnowledgeOrigin(source: PocketItem["source"]): "mobile" | "mac" | "snapzy" {
  if (source === "snapzy") {
    return "snapzy";
  }
  if (source === "mac" || source === "system") {
    return "mac";
  }
  return "mobile";
}

function defaultSourceDevice(source: PocketItem["source"]): string {
  if (source === "phone") {
    return "PocketBridge Mobile";
  }
  if (source === "snapzy") {
    return "Snapzy";
  }
  return "PocketBridge Mac";
}

function summarizeItem(item: PocketItem): string {
  const text = item.text?.replace(/\s+/g, " ").trim();
  if (text) {
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  const origin = toKnowledgeOrigin(item.source);
  const device = item.sourceDevice ?? defaultSourceDevice(item.source);
  return `${item.title} captured from ${origin} / ${device}.`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "pocketbridge-item";
}

async function copyAsset(
  item: PocketItem,
  assetsDir: string
): Promise<{ path: string; reference: string } | undefined> {
  if (!item.filePath) {
    return undefined;
  }

  await fs.mkdir(assetsDir, { recursive: true });
  const extension = path.extname(item.originalName ?? item.filePath);
  const baseName = slugify(path.basename(item.originalName ?? item.title, extension));
  const assetName = `${item.id}-${baseName}${extension}`;
  const assetPath = path.join(assetsDir, assetName);
  await fs.copyFile(item.filePath, assetPath);

  return {
    path: assetPath,
    reference: `../assets/pocketbridge/${assetName}`
  };
}
