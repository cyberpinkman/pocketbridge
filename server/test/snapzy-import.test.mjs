import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";
import { config } from "../../dist/server/src/config.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("POST /snapzy/import imports files from the Snapzy inbox folder", async () => {
  const originalMetadata = await readMetadata();
  const snapzyInbox = path.resolve("integrations", "snapzy", "inbox");
  const snapzyFile = path.join(snapzyInbox, "snapzy-note.txt");
  const importedFilePaths = [];
  await fs.mkdir(snapzyInbox, { recursive: true });
  await fs.writeFile(snapzyFile, "snapzy capture");
  await writeMetadata({ items: [], pairingSessions: [], shares: [] });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/snapzy/import`, {
        method: "POST"
      });
      assert.equal(response.status, 201);

      const body = await response.json();
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].source, "snapzy");
      assert.equal(body.items[0].title, "snapzy-note.txt");
      assert.match(body.items[0].id, /^itm_\d+_[a-z0-9_-]{8}$/);
      assert.equal(
        body.items[0].filePath,
        `${process.cwd()}/data/inbox/2026-06-27/${body.items[0].id}/original`
      );
      importedFilePaths.push(body.items[0].filePath);

      const importedContent = await fs.readFile(body.items[0].filePath, "utf8");
      assert.equal(importedContent, "snapzy capture");

      const metadata = await readMetadata();
      assert.equal(metadata.items[0].id, body.items[0].id);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(snapzyFile, { force: true });
    await Promise.all(importedFilePaths.map((filePath) => fs.rm(filePath, { force: true })));
  }
});

test("POST /snapzy/import imports files from the upstream Snapzy watch folder", async () => {
  const originalMetadata = await readMetadata();
  const snapzyWatchDir = path.resolve("data", "watch", "snapzy");
  const snapzyFile = path.join(snapzyWatchDir, "upstream-snapzy-note.txt");
  const importedFilePaths = [];
  await fs.mkdir(snapzyWatchDir, { recursive: true });
  await fs.writeFile(snapzyFile, "upstream snapzy capture");
  await writeMetadata({ items: [], pairingSessions: [], shares: [] });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/snapzy/import`, {
        method: "POST"
      });
      assert.equal(response.status, 201);

      const body = await response.json();
      const imported = body.items.find((item) => item.title === "upstream-snapzy-note.txt");
      assert.ok(imported);
      assert.equal(imported.source, "snapzy");
      assert.match(imported.id, /^itm_\d+_[a-z0-9_-]{8}$/);
      assert.equal(
        imported.filePath,
        `${process.cwd()}/data/inbox/2026-06-27/${imported.id}/original`
      );
      importedFilePaths.push(imported.filePath);

      const importedContent = await fs.readFile(imported.filePath, "utf8");
      assert.equal(importedContent, "upstream snapzy capture");

      const metadata = await readMetadata();
      assert.ok(metadata.items.some((item) => item.id === imported.id));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(snapzyFile, { force: true });
    await Promise.all(importedFilePaths.map((filePath) => fs.rm(filePath, { force: true })));
  }
});
