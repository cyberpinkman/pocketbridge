import { strict as assert } from "node:assert";
import http from "node:http";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("POST and GET /api/ble/status expose the upstream BLE status shape", async () => {
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

      const updateResponse = await fetch(`http://127.0.0.1:${address.port}/api/ble/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          status: "away",
          deviceName: "Demo Phone",
          rssi: -82
        })
      });
      assert.equal(updateResponse.status, 200);

      const updated = await updateResponse.json();
      assert.equal(updated.status, "away");
      assert.equal(updated.deviceName, "Demo Phone");
      assert.equal(updated.rssi, -82);
      assert.ok(updated.updatedAt);

      const readResponse = await fetch(`http://127.0.0.1:${address.port}/api/ble/status`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(readResponse.status, 200);

      const read = await readResponse.json();
      assert.equal(read.status, "away");
      assert.equal(read.deviceName, "Demo Phone");
      assert.equal(read.rssi, -82);
      assert.equal(read.updatedAt, updated.updatedAt);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});
