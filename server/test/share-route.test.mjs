import { strict as assert } from "node:assert";
import http from "node:http";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("GET /share returns queued shares with their inbox items", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "item-for-phone",
        kind: "document",
        source: "mac",
        title: "Send this to phone",
        createdAt: "2026-06-27T00:00:00.000Z",
        originalName: "handoff.txt",
        filePath: "/Users/zerone/Documents/黑客松pklock/data/inbox/handoff.txt",
        status: "inbox"
      }
    ],
    pairingSessions: [],
    shares: [
      {
        id: "share-for-phone",
        itemId: "item-for-phone",
        target: "phone",
        status: "queued",
        createdAt: "2026-06-27T00:01:00.000Z"
      }
    ]
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/share`);
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.shares.length, 1);
      assert.equal(body.shares[0].id, "share-for-phone");
      assert.equal(body.shares[0].item.id, "item-for-phone");
      assert.equal(body.shares[0].item.title, "Send this to phone");
      assert.equal(body.shares[0].downloadPath, "/items/item-for-phone/download");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /share/:shareId/sent marks a phone share as sent", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "received-item",
        kind: "document",
        source: "mac",
        title: "Phone received this",
        createdAt: "2026-06-27T00:00:00.000Z",
        originalName: "received.txt",
        filePath: "/Users/zerone/Documents/黑客松pklock/data/inbox/received.txt",
        status: "inbox"
      }
    ],
    pairingSessions: [],
    shares: [
      {
        id: "share-to-confirm",
        itemId: "received-item",
        target: "phone",
        status: "queued",
        createdAt: "2026-06-27T00:01:00.000Z"
      }
    ]
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/share/share-to-confirm/sent`, {
        method: "POST"
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.share.id, "share-to-confirm");
      assert.equal(body.share.status, "sent");

      const metadata = await readMetadata();
      assert.equal(metadata.shares[0].status, "sent");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});
