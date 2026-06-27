import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config.js";
import type { PocketItem } from "../types.js";

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

function markdownFor(item: PocketItem, tags: string[], note?: string): string {
  const allTags = Array.from(new Set([...item.tags, ...tags]));
  const tagLines = allTags.length > 0 ? allTags.map((tag) => `  - ${tag}`).join("\n") : "  []";
  const body = item.text?.trim() || (item.storageRelPath ? `File: ${item.storageRelPath}` : "");
  const noteSection = note?.trim() ? `\n\n## Note\n\n${note.trim()}` : "";
  const fileSection = item.storageRelPath ? `\n\n## Source File\n\n${item.storageRelPath}` : "";

  return `---\nid: ${yamlString(item.id)}\ntitle: ${yamlString(item.title)}\norigin: ${yamlString(item.origin)}\nsourceDevice: ${yamlString(item.sourceDevice)}\ncreatedAt: ${yamlString(item.createdAt)}\ntags:\n${tagLines}\n---\n\n# ${item.title}\n\n${body}${noteSection}${fileSection}\n`;
}

export async function writeKnowledgeMarkdown(
  config: Config,
  item: PocketItem,
  input: { tags?: string[]; note?: string } = {}
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-${slugify(item.title, item.id)}-${item.id}.md`;
  const target = path.join(config.obsidianDir, filename);
  await fs.mkdir(config.obsidianDir, { recursive: true });
  await fs.writeFile(target, markdownFor(item, input.tags ?? [], input.note), "utf8");
  return target;
}
