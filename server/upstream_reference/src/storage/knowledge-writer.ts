import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config.js";
import type { PocketItem } from "../types.js";
import { absoluteStoragePath } from "./file-store.js";

function slugify(title: string, fallback: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();

  return slug || fallback;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function normalizeTags(values: string[]): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const tag = value.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function derivedTagsFor(item: PocketItem): string[] {
  return normalizeTags([item.kind, item.origin]);
}

function markdownHeading(value: string): string {
  return value.replace(/\r?\n/g, " ").trim() || "Untitled";
}

function markdownLinkLabel(value: string): string {
  return (
    value
      .replace(/[\[\]|]/g, "-")
      .replace(/\r?\n/g, " ")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .trim() || "source"
  );
}

function obsidianPath(value: string): string {
  return value.split(path.sep).join("/");
}

function safeAttachmentName(item: PocketItem): string {
  const original = item.originalFilename?.trim() || "original";
  const cleaned = original.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/^-+|-+$/g, "");
  return `${item.id}-${cleaned || "original"}`;
}

type KnowledgeAttachment = {
  vaultRelPath: string;
  label: string;
};

async function copyAttachment(config: Config, item: PocketItem): Promise<KnowledgeAttachment | undefined> {
  if (!item.storageRelPath) return undefined;

  const source = absoluteStoragePath(config, item.storageRelPath);
  const attachmentsDir = path.join(config.obsidianDir, "attachments");
  const filename = safeAttachmentName(item);
  const target = path.join(attachmentsDir, filename);
  await fs.mkdir(attachmentsDir, { recursive: true });
  await fs.copyFile(source, target);

  return {
    vaultRelPath: obsidianPath(path.join("attachments", filename)),
    label: markdownLinkLabel(item.originalFilename ?? item.title)
  };
}

function markdownForFile(item: PocketItem, attachment?: KnowledgeAttachment): string {
  if (!item.storageRelPath) return "";

  const sourcePath = obsidianPath(item.storageRelPath);
  const attachmentLink = attachment ? `\n\n[[${attachment.vaultRelPath}|${attachment.label}]]` : "";
  return `File: ${sourcePath}${attachmentLink}`;
}

function frontmatterFor(item: PocketItem, tagLines: string): string {
  const lines = [
    "---",
    `id: ${yamlString(item.id)}`,
    `title: ${yamlString(item.title)}`,
    `kind: ${yamlString(item.kind)}`,
    `origin: ${yamlString(item.origin)}`,
    `sourceDevice: ${yamlString(item.sourceDevice)}`,
    `createdAt: ${yamlString(item.createdAt)}`,
    `updatedAt: ${yamlString(item.updatedAt)}`
  ];

  if (item.mimeType) lines.push(`mimeType: ${yamlString(item.mimeType)}`);
  if (item.sizeBytes !== undefined) lines.push(`sizeBytes: ${item.sizeBytes}`);
  if (item.originalFilename) lines.push(`originalFilename: ${yamlString(item.originalFilename)}`);
  if (item.storageRelPath) lines.push(`storageRelPath: ${yamlString(obsidianPath(item.storageRelPath))}`);

  if (tagLines) {
    lines.push("tags:", tagLines);
  } else {
    lines.push("tags: []");
  }

  lines.push("---");
  return lines.join("\n");
}

function markdownFor(item: PocketItem, tags: string[], note?: string, attachment?: KnowledgeAttachment): string {
  const allTags = normalizeTags([...item.tags, ...tags, ...derivedTagsFor(item)]);
  const tagLines = allTags.length > 0 ? allTags.map((tag) => `  - ${yamlString(tag)}`).join("\n") : "";
  const title = markdownHeading(item.title);
  const body = item.text?.trim() || markdownForFile(item, attachment);
  const summarySection = `\n\n## Summary\n\nPending summary.`;
  const noteSection = note?.trim() ? `\n\n## Note\n\n${note.trim()}` : "";
  const fileSection = item.storageRelPath ? `\n\n## Source File\n\n${obsidianPath(item.storageRelPath)}` : "";

  return `${frontmatterFor(item, tagLines)}\n\n# ${title}\n\n${body}${summarySection}${noteSection}${fileSection}\n`;
}

export async function writeKnowledgeMarkdown(
  config: Config,
  item: PocketItem,
  input: { tags?: string[]; note?: string } = {}
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const baseName = `${date}-${slugify(item.title, item.id)}-${item.id}`;
  await fs.mkdir(config.obsidianDir, { recursive: true });
  const attachment = await copyAttachment(config, item);
  let target = path.join(config.obsidianDir, `${baseName}.md`);
  let copy = 2;
  while (true) {
    try {
      const handle = await fs.open(target, "wx");
      try {
        await handle.writeFile(markdownFor(item, input.tags ?? [], input.note, attachment), "utf8");
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      target = path.join(config.obsidianDir, `${baseName}-${copy}.md`);
      copy += 1;
    }
  }
  return target;
}
