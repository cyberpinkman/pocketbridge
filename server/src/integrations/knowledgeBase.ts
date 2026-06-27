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

  const filename = `${item.createdAt.slice(0, 10)}-${slugify(item.title)}-${filenameSafeId(item.id)}.md`;
  const outputPath = path.join(inboxDir, filename);
  const asset = await copyAsset(item, assetsDir);
  const summary = summarizeItem(item);
  const title = markdownInlineText(item.title);
  const sourceDevice = markdownInlineText(item.sourceDevice ?? defaultSourceDevice(item.source));
  const markdown = [
    "---",
    `id: ${yamlString(item.id)}`,
    `title: ${yamlString(title)}`,
    `origin: ${yamlString(toKnowledgeOrigin(item.source))}`,
    `sourceDevice: ${yamlString(sourceDevice)}`,
    `source: ${yamlString(item.source)}`,
    `kind: ${yamlString(item.kind)}`,
    `createdAt: ${yamlString(item.createdAt)}`,
    "tags:",
    ...yamlStringList(item.tags),
    "---",
    "",
    `# ${title}`,
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
    `Source: ${toKnowledgeOrigin(item.source)} / ${sourceDevice}`,
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
  return `${markdownInlineText(item.title)} captured from ${origin} / ${device}.`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "pocketbridge-item";
}

function filenameSafeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
}

function markdownInlineText(value: string): string {
  return normalizeInlineText(value) || "Untitled";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlStringList(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => normalizeInlineText(value))
    .filter((value) => value.length > 0)
    .map((value) => `  - ${yamlString(value)}`);
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
