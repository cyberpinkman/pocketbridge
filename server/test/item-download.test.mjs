import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";
import { config } from "../../dist/server/src/config.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("GET /items/:id/download streams a file-backed inbox item", async () => {
  const originalMetadata = await readMetadata();
  const filePath = path.join(config.inboxDir, "download-test.txt");
  await fs.writeFile(filePath, "download me");
  await writeMetadata({
    items: [
      {
        id: "downloadable-item",
        kind: "document",
        source: "mac",
        title: "download-test.txt",
        createdAt: "2026-06-27T00:00:00.000Z",
        originalName: "download-test.txt",
        mimeType: "text/plain",
        size: 11,
        filePath,
        status: "inbox"
      }
    ],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/items/downloadable-item/download`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /^text\/plain/);
      assert.match(response.headers.get("content-disposition"), /download-test\.txt/);
      assert.equal(await response.text(), "download me");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(filePath, { force: true });
  }
});

test("GET /items/:id/download rejects items without a local file", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "text-only-item",
        kind: "text",
        source: "phone",
        title: "Only text",
        createdAt: "2026-06-27T00:00:00.000Z",
        text: "No file here",
        status: "inbox"
      }
    ],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/items/text-only-item/download`);
      assert.equal(response.status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});
