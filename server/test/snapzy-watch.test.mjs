import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startSnapzyWatch } from "../../dist/server/src/integrations/snapzyWatch.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("Snapzy watcher imports new files from the upstream watch folder", async () => {
  const originalMetadata = await readMetadata();
  const watchDir = await fs.mkdtemp(path.join(os.tmpdir(), "pocketbridge-snapzy-watch-"));
  const importedFilePaths = [];
  await writeMetadata({ items: [], pairingSessions: [], shares: [] });

  const watcher = startSnapzyWatch({ watchDir });

  try {
    await fs.writeFile(path.join(watchDir, "auto-snapzy.txt"), "auto snapzy capture");

    const item = await waitForImportedItem("auto-snapzy.txt");
    assert.equal(item.source, "snapzy");
    assert.equal(item.originalName, "auto-snapzy.txt");
    assert.match(item.id, /^itm_\d+_[a-z0-9_-]{8}$/);
    assert.ok(item.filePath.endsWith(`${item.id}/original`));
    importedFilePaths.push(item.filePath);

    const importedContent = await fs.readFile(item.filePath, "utf8");
    assert.equal(importedContent, "auto snapzy capture");
  } finally {
    watcher.close();
    await writeMetadata(originalMetadata);
    await fs.rm(watchDir, { recursive: true, force: true });
    await Promise.all(importedFilePaths.map((filePath) => fs.rm(filePath, { force: true })));
  }
});

async function waitForImportedItem(title) {
  const deadline = Date.now() + 2500;

  while (Date.now() < deadline) {
    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.title === title);
    if (item) {
      return item;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.fail(`Timed out waiting for ${title}`);
}
