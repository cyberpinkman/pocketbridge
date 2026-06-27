import { strict as assert } from "node:assert";
import http from "node:http";
import test from "node:test";

test("POST /api/items/upload returns UPLOAD_TOO_LARGE when file exceeds PB_MAX_UPLOAD_MB", async () => {
  const originalMaxUploadMb = process.env.PB_MAX_UPLOAD_MB;
  process.env.PB_MAX_UPLOAD_MB = "0";

  try {
    const cacheKey = `case=${Date.now()}-${Math.random()}`;
    const { createApp } = await import(`../../dist/server/src/app.js?${cacheKey}`);
    const { config } = await import("../../dist/server/src/config.js");
    const { readMetadata, writeMetadata } = await import(
      `../../dist/server/src/storage/metadataStore.js?${cacheKey}`
    );
    assert.equal(config.maxUploadBytes, 0);
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

    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const form = new FormData();
      form.set("origin", "mobile");
      form.set("sourceDevice", "Demo Phone");
      form.set("file", new Blob(["too large"], { type: "text/plain" }), "too-large.txt");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/items/upload`, {
        method: "POST",
        headers: { "x-pocketbridge-pair-code": "123456" },
        body: form
      });
      assert.equal(response.status, 413);

      const body = await response.json();
      assert.equal(body.error.code, "UPLOAD_TOO_LARGE");
      assert.match(body.error.message, /upload/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await writeMetadata(originalMetadata);
    }
  } finally {
    if (originalMaxUploadMb === undefined) {
      delete process.env.PB_MAX_UPLOAD_MB;
    } else {
      process.env.PB_MAX_UPLOAD_MB = originalMaxUploadMb;
    }
  }
});
