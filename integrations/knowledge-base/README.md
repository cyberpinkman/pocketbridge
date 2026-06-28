# Knowledge Base Integration

MVP goal:

- Export PocketInbox items into Markdown and asset files that Obsidian can read.

Target shape:

```text
data/obsidian/PocketBridge/
  inbox/
    YYYY-MM-DD-title.md
  assets/
    pocketbridge/
```

Each exported Markdown file should preserve:

- source device
- capture time
- original filename
- local asset link
- deterministic summary placeholder
- extracted or user-provided note text

Current bridge contract:

- `POST /export/:itemId` defaults to `data/obsidian/PocketBridge` and accepts optional JSON `{ "vaultDir": "./custom-vault" }`.
- Markdown is written to `vaultDir/inbox/YYYY-MM-DD-title.md`.
- Markdown includes `## Summary` and `## Content` sections. The summary is a local placeholder generated from item text, or from title/source metadata for file-only items.
- If the item has `filePath`, the file is copied to `vaultDir/assets/pocketbridge/ITEM_ID-original-name.ext`.
- The Markdown uses an Obsidian-style asset reference such as `[[../assets/pocketbridge/ITEM_ID-original-name.ext]]`.
- Metadata is updated with `status: "exported"` and `knowledgeTarget` pointing to the Markdown path.
