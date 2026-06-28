import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";
import { config } from "../../dist/server/src/config.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("POST /api/items/text requires a valid pair code", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/text`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Unauthorized idea",
          text: "This should not be accepted.",
          origin: "mobile",
          sourceDevice: "Demo Phone",
          tags: ["demo"]
        })
      });

      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.error.code, "UNAUTHORIZED");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /api/items/upload creates an upstream-shaped file item downloadable through /api/items/:id/download", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  let uploadedPath;
  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const form = new FormData();
      form.set("origin", "mobile");
      form.set("sourceDevice", "Demo Phone");
      form.set("title", "Phone upload document");
      form.set("tags", JSON.stringify(["file", "demo"]));
      form.set("file", new Blob(["upstream file content"], { type: "text/plain" }), "phone-upload.txt");

      const uploadResponse = await fetch(`http://127.0.0.1:${address.port}/api/items/upload`, {
        method: "POST",
        headers: { "x-pocketbridge-pair-code": "123456" },
        body: form
      });
      assert.equal(uploadResponse.status, 201);

      const uploaded = await uploadResponse.json();
      assert.equal(uploaded.item.kind, "file");
      assert.equal(uploaded.item.title, "Phone upload document");
      assert.equal(uploaded.item.origin, "mobile");
      assert.equal(uploaded.item.sourceDevice, "Demo Phone");
      assert.equal(uploaded.item.originalFilename, "phone-upload.txt");
      assert.equal(uploaded.item.mimeType, "text/plain");
      assert.equal(uploaded.item.sizeBytes, "upstream file content".length);
      assert.deepEqual(uploaded.item.tags, ["file", "demo"]);
      assert.match(
        uploaded.item.storageRelPath,
        /^inbox\/\d{4}-\d{2}-\d{2}\/itm_\d+_[a-z0-9_-]{8}\/original$/
      );
      assert.equal(uploaded.item.storageRelPath, `inbox/${uploaded.item.createdAt.slice(0, 10)}/${uploaded.item.id}/original`);
      assert.equal(uploaded.item.storageRelPath.includes(process.cwd()), false);
      assert.equal(uploaded.item.sharedToMobile, false);
      assert.equal(uploaded.item.status, "inbox");
      assert.equal(uploaded.item.downloadUrl, `/api/items/${uploaded.item.id}/download`);

      const metadata = await readMetadata();
      assert.equal(metadata.items.length, 1);
      uploadedPath = metadata.items[0].filePath;
      assert.equal(
        uploadedPath,
        `${process.cwd()}/data/inbox/${uploaded.item.createdAt.slice(0, 10)}/${uploaded.item.id}/original`
      );
      assert.equal(metadata.items[0].source, "phone");
      assert.equal(metadata.items[0].originalName, "phone-upload.txt");

      const downloadResponse = await fetch(`http://127.0.0.1:${address.port}${uploaded.item.downloadUrl}`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(downloadResponse.status, 200);
      assert.equal(await downloadResponse.text(), "upstream file content");
      assert.match(
        downloadResponse.headers.get("content-disposition") ?? "",
        /phone-upload\.txt/
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    if (uploadedPath) {
      await fs.rm(uploadedPath, { force: true });
    }
  }
});

test("POST /api/items/upload stages multipart files outside PocketInbox and cleans staging files", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  let uploadedPath;
  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const form = new FormData();
      form.set("origin", "mobile");
      form.set("sourceDevice", "Demo Phone");
      form.set("file", new Blob(["staged file"], { type: "text/plain" }), "staged.txt");

      const uploadResponse = await fetch(`http://127.0.0.1:${address.port}/api/items/upload`, {
        method: "POST",
        headers: { "x-pocketbridge-pair-code": "123456" },
        body: form
      });
      assert.equal(uploadResponse.status, 201);

      const uploaded = await uploadResponse.json();
      const metadata = await readMetadata();
      uploadedPath = metadata.items[0].filePath;

      assert.equal(await fs.readFile(uploadedPath, "utf8"), "staged file");
      assert.equal(uploaded.item.storageRelPath, `inbox/${uploaded.item.createdAt.slice(0, 10)}/${uploaded.item.id}/original`);
      assert.deepEqual(await fs.readdir(`${process.cwd()}/data/tmp/uploads`), []);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    if (uploadedPath) {
      await fs.rm(uploadedPath, { force: true });
    }
  }
});

test("GET /api/items/:id/download hides file paths outside PocketInbox", async () => {
  const originalMetadata = await readMetadata();
  const outsideInboxPath = `${process.cwd()}/data/not-inbox-secret.txt`;
  await fs.writeFile(outsideInboxPath, "secret");
  await writeMetadata({
    items: [
      {
        id: "outside-inbox-item",
        kind: "document",
        source: "mac",
        title: "Outside inbox file",
        createdAt: "2026-06-27T00:00:00.000Z",
        originalName: "not-inbox-secret.txt",
        mimeType: "text/plain",
        size: 6,
        filePath: outsideInboxPath,
        status: "inbox"
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/outside-inbox-item/download`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(response.status, 404);

      const body = await response.json();
      assert.equal(body.error.code, "NOT_FOUND");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(outsideInboxPath, { force: true });
  }
});

test("POST /api/items/upload requires origin and sourceDevice", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const form = new FormData();
      form.set("file", new Blob(["missing fields"], { type: "text/plain" }), "missing-fields.txt");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/upload`, {
        method: "POST",
        headers: { "x-pocketbridge-pair-code": "123456" },
        body: form
      });
      assert.equal(response.status, 400);

      const body = await response.json();
      assert.equal(body.error.code, "BAD_REQUEST");
      assert.match(body.error.message, /origin/i);
      assert.match(body.error.message, /sourceDevice/i);

      const metadata = await readMetadata();
      assert.equal(metadata.items.length, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /api/items/text requires origin and sourceDevice", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/text`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          title: "Missing fields idea",
          text: "This should not be accepted."
        })
      });
      assert.equal(response.status, 400);

      const body = await response.json();
      assert.equal(body.error.code, "BAD_REQUEST");
      assert.match(body.error.message, /origin/i);
      assert.match(body.error.message, /sourceDevice/i);

      const metadata = await readMetadata();
      assert.equal(metadata.items.length, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /api/items/text creates an upstream-shaped text item listed by GET /api/items", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const createResponse = await fetch(`http://127.0.0.1:${address.port}/api/items/text`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          title: "Idea from upstream Flutter",
          text: "Turn screenshots into a personal knowledge stream.",
          origin: "mobile",
          sourceDevice: "Demo Phone",
          tags: ["idea", "demo"]
        })
      });
      assert.equal(createResponse.status, 201);

      const created = await createResponse.json();
      assert.equal(created.item.kind, "text");
      assert.equal(created.item.title, "Idea from upstream Flutter");
      assert.equal(created.item.origin, "mobile");
      assert.equal(created.item.sourceDevice, "Demo Phone");
      assert.deepEqual(created.item.tags, ["idea", "demo"]);
      assert.equal(created.item.sharedToMobile, false);
      assert.equal(created.item.status, "inbox");
      assert.equal(created.item.text, "Turn screenshots into a personal knowledge stream.");
      assert.ok(created.item.createdAt);
      assert.ok(created.item.updatedAt);

      const listResponse = await fetch(`http://127.0.0.1:${address.port}/api/items`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(listResponse.status, 200);
      const listed = await listResponse.json();
      assert.equal(listed.items.length, 1);
      assert.equal(listed.items[0].id, created.item.id);
      assert.equal(listed.items[0].origin, "mobile");
      assert.equal(listed.items[0].sourceDevice, "Demo Phone");

      const metadata = await readMetadata();
      assert.equal(metadata.items.length, 1);
      assert.equal(metadata.items[0].source, "phone");
      assert.equal(metadata.items[0].title, "Idea from upstream Flutter");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("GET /api/items/:id returns one upstream-shaped item", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "api-single-item",
        kind: "text",
        source: "phone",
        title: "Single item",
        createdAt: "2026-06-27T00:00:00.000Z",
        updatedAt: "2026-06-27T00:00:01.000Z",
        text: "One item lookup",
        status: "inbox",
        sourceDevice: "Demo Phone",
        tags: ["lookup"],
        sharedToMobile: false
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/api-single-item`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.item.id, "api-single-item");
      assert.equal(body.item.kind, "text");
      assert.equal(body.item.origin, "mobile");
      assert.equal(body.item.text, "One item lookup");
      assert.deepEqual(body.item.tags, ["lookup"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("GET /api/items applies the upstream limit query parameter", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "limit-item-3",
        kind: "text",
        source: "phone",
        title: "Limit item 3",
        createdAt: "2026-06-27T00:00:03.000Z",
        text: "third",
        status: "inbox"
      },
      {
        id: "limit-item-2",
        kind: "text",
        source: "phone",
        title: "Limit item 2",
        createdAt: "2026-06-27T00:00:02.000Z",
        text: "second",
        status: "inbox"
      },
      {
        id: "limit-item-1",
        kind: "text",
        source: "phone",
        title: "Limit item 1",
        createdAt: "2026-06-27T00:00:01.000Z",
        text: "first",
        status: "inbox"
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items?limit=2`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.deepEqual(
        body.items.map((item) => item.id),
        ["limit-item-3", "limit-item-2"]
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("GET /api/inbox and /api/search expose teammate demo API views", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "brief-audio-card",
        kind: "document",
        source: "phone",
        title: "Voice memo import",
        createdAt: "2026-06-27T00:00:02.000Z",
        text: "Audio note about a hackathon insight",
        status: "inbox",
        sourceDevice: "Demo Phone",
        tags: ["recording", "inspiration"]
      },
      {
        id: "brief-snapzy-card",
        kind: "image",
        source: "snapzy",
        title: "Snapzy screenshot",
        createdAt: "2026-06-27T00:00:01.000Z",
        status: "inbox",
        sourceDevice: "Snapzy",
        tags: ["screenshot"],
        sharedToMobile: true
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const headers = { "x-pocketbridge-pair-code": "123456" };
      const inboxResponse = await fetch(`http://127.0.0.1:${address.port}/api/inbox`, { headers });
      assert.equal(inboxResponse.status, 200);
      const inbox = await inboxResponse.json();
      assert.equal(inbox.total, 2);
      assert.deepEqual(
        inbox.items.map((item) => item.id),
        ["brief-audio-card", "brief-snapzy-card"]
      );

      const searchResponse = await fetch(`http://127.0.0.1:${address.port}/api/search?q=recording`, {
        headers
      });
      assert.equal(searchResponse.status, 200);
      const search = await searchResponse.json();
      assert.equal(search.query, "recording");
      assert.equal(search.total, 1);
      assert.equal(search.items[0].id, "brief-audio-card");
      assert.equal(search.items[0].origin, "mobile");

      const contractSearchResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/items/search?q=screenshot&origin=snapzy&sharedToMobile=true`,
        { headers }
      );
      assert.equal(contractSearchResponse.status, 200);
      const contractSearch = await contractSearchResponse.json();
      assert.equal(contractSearch.query, "screenshot");
      assert.equal(contractSearch.total, 1);
      assert.equal(contractSearch.items[0].id, "brief-snapzy-card");
      assert.equal(contractSearch.items[0].origin, "snapzy");
      assert.equal(contractSearch.items[0].sharedToMobile, true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /api/items/:id/share-to-mobile marks an item for mobile download", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "api-share-item",
        kind: "document",
        source: "mac",
        title: "Mac document",
        createdAt: "2026-06-27T00:00:00.000Z",
        status: "inbox",
        sharedToMobile: false
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/api-share-item/share-to-mobile`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({ sharedToMobile: true })
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.item.id, "api-share-item");
      assert.equal(body.item.sharedToMobile, true);
      assert.equal(body.item.updatedAt.length > 0, true);

      const metadata = await readMetadata();
      assert.equal(metadata.items[0].sharedToMobile, true);
      assert.equal(metadata.shares.length, 1);
      assert.equal(metadata.shares[0].itemId, "api-share-item");
      assert.equal(metadata.shares[0].status, "queued");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /api/items/:id/archive hides and restores items through the upstream contract", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "archive-target",
        kind: "text",
        source: "phone",
        title: "Archive target",
        createdAt: "2026-06-27T00:00:00.000Z",
        text: "Archived text",
        status: "inbox",
        sourceDevice: "Demo Phone"
      },
      {
        id: "active-target",
        kind: "text",
        source: "phone",
        title: "Active target",
        createdAt: "2026-06-27T00:00:00.000Z",
        text: "Active text",
        status: "inbox",
        sourceDevice: "Demo Phone"
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");
      const headers = {
        "content-type": "application/json",
        "x-pocketbridge-pair-code": "123456"
      };

      const archiveResponse = await fetch(`http://127.0.0.1:${address.port}/api/items/archive-target/archive`, {
        method: "POST",
        headers,
        body: JSON.stringify({ archived: true })
      });
      assert.equal(archiveResponse.status, 200);
      const archived = await archiveResponse.json();
      assert.equal(archived.item.id, "archive-target");
      assert.equal(archived.item.status, "inbox");
      assert.match(archived.item.archivedAt, /^20/);

      const defaultList = await fetch(`http://127.0.0.1:${address.port}/api/items`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      }).then((response) => response.json());
      assert.deepEqual(defaultList.items.map((item) => item.id), ["active-target"]);

      const archivedList = await fetch(`http://127.0.0.1:${address.port}/api/items?includeArchived=true`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      }).then((response) => response.json());
      assert.equal(archivedList.items.some((item) => item.id === "archive-target" && item.archivedAt), true);

      const restoreResponse = await fetch(`http://127.0.0.1:${address.port}/api/items/archive-target/archive`, {
        method: "POST",
        headers,
        body: JSON.stringify({ archived: false })
      });
      assert.equal(restoreResponse.status, 200);
      const restored = await restoreResponse.json();
      assert.equal(restored.item.id, "archive-target");
      assert.equal(restored.item.archivedAt, undefined);

      const restoredList = await fetch(`http://127.0.0.1:${address.port}/api/search?q=Archive`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      }).then((response) => response.json());
      assert.deepEqual(restoredList.items.map((item) => item.id), ["archive-target"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("DELETE /api/items/:id removes metadata, queued shares, and local inbox files", async () => {
  const originalMetadata = await readMetadata();
  const itemDir = path.join(config.inboxDir, "2026-06-27", "delete-target");
  const filePath = path.join(itemDir, "original");
  await fs.mkdir(itemDir, { recursive: true });
  await fs.writeFile(filePath, "delete me");
  await writeMetadata({
    items: [
      {
        id: "delete-target",
        kind: "document",
        source: "phone",
        title: "Delete target",
        createdAt: "2026-06-27T00:00:00.000Z",
        originalName: "delete.txt",
        mimeType: "text/plain",
        size: 9,
        filePath,
        status: "inbox",
        sourceDevice: "Demo Phone"
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: [
      {
        id: "share-for-delete",
        itemId: "delete-target",
        target: "phone",
        status: "queued",
        createdAt: "2026-06-27T00:00:00.000Z"
      }
    ]
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/delete-target`, {
        method: "DELETE",
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { item: { id: "delete-target" } });

      const metadata = await readMetadata();
      assert.equal(metadata.items.length, 0);
      assert.equal(metadata.shares.length, 0);
      await assert.rejects(fs.access(filePath));
      await assert.rejects(fs.access(itemDir));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(itemDir, { recursive: true, force: true });
  }
});

test("POST /api/knowledge/:id exports an item with upstream status and knowledge path", async () => {
  const originalMetadata = await readMetadata();
  const vaultDir = "tmp/api-knowledge-vault";
  await fs.rm(vaultDir, { recursive: true, force: true });
  await writeMetadata({
    items: [
      {
        id: "api-knowledge-item",
        kind: "text",
        source: "phone",
        title: "Knowledge idea",
        createdAt: "2026-06-27T00:00:00.000Z",
        text: "Save this to knowledge.",
        status: "inbox",
        sourceDevice: "Demo Phone",
        tags: ["idea"]
      }
    ],
    pairingSessions: [
      {
        id: "pairing-session",
        token: "123456",
        createdAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2999-01-01T00:00:00.000Z"
      }
    ],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/knowledge/api-knowledge-item`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          vaultDir,
          tags: ["pocketbridge", "demo"],
          note: "Imported during live demo."
        })
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.item.id, "api-knowledge-item");
      assert.equal(body.item.status, "saved_to_knowledge");
      assert.match(body.item.knowledgePath, /tmp\/api-knowledge-vault\/inbox\/2026-06-27-knowledge-idea-api-knowledge-item\.md$/);

      const markdown = await fs.readFile(body.item.knowledgePath, "utf8");
      assert.match(markdown, /title: "Knowledge idea"/);
      assert.match(markdown, /origin: "mobile"/);
      assert.match(markdown, /sourceDevice: "Demo Phone"/);
      assert.match(markdown, /tags:\n  - "pocketbridge"\n  - "demo"/);
      assert.match(markdown, /# Knowledge idea/);
      assert.match(markdown, /## Summary/);
      assert.match(markdown, /Save this to knowledge\./);
      assert.match(markdown, /Save this to knowledge\./);
      assert.match(markdown, /Imported during live demo\./);
      assert.match(markdown, /Source: mobile \/ Demo Phone/);

      const metadata = await readMetadata();
      assert.equal(metadata.items[0].status, "exported");
      assert.deepEqual(metadata.items[0].tags, ["pocketbridge", "demo"]);
      assert.equal(metadata.items[0].knowledgeTarget, body.item.knowledgePath);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(vaultDir, { recursive: true, force: true });
  }
});
