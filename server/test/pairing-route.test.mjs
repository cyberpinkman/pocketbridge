import { strict as assert } from "node:assert";
import http from "node:http";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("POST /pairing/session includes the requested bridgeUrl in the QR payload", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/pairing/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bridgeUrl: "http://192.168.1.50:4317" })
      });
      assert.equal(response.status, 201);

      const body = await response.json();
      assert.equal(body.pairingPayload.protocol, "pocketbridge");
      assert.equal(body.pairingPayload.bridgeUrl, "http://192.168.1.50:4317");
      assert.equal(body.pairingPayload.token, body.session.token);

      const metadata = await readMetadata();
      assert.equal(metadata.pairingSessions.length, 1);
      assert.equal(metadata.pairingSessions[0].token, body.session.token);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("GET /api/pairing returns an upstream-compatible pairing payload", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/pairing`, {
        headers: { "x-forwarded-host": "192.168.1.50:3000" }
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.protocol, "pocketbridge");
      assert.equal(body.version, 1);
      assert.equal(body.serverBaseUrl, "http://192.168.1.50:3000");
      assert.equal(body.wsUrl, "ws://192.168.1.50:3000/ws");
      assert.match(body.pairCode, /^\d{6}$/);
      assert.equal(body.deviceName, "PocketBridge Mac");
      assert.deepEqual(body.capabilities, ["upload", "download", "websocket", "knowledge", "ble-status"]);

      const metadata = await readMetadata();
      assert.equal(metadata.pairingSessions.length, 1);
      assert.equal(metadata.pairingSessions[0].token, body.pairCode);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("GET /api/pairing reuses PB_PAIR_CODE when configured", async () => {
  const originalMetadata = await readMetadata();
  const originalPairCode = process.env.PB_PAIR_CODE;
  process.env.PB_PAIR_CODE = "654321";
  await writeMetadata({
    items: [],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      for (let index = 0; index < 2; index += 1) {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/pairing`, {
          headers: { "x-forwarded-host": "192.168.1.50:3000" }
        });
        assert.equal(response.status, 200);

        const body = await response.json();
        assert.equal(body.pairCode, "654321");
        assert.equal(body.serverBaseUrl, "http://192.168.1.50:3000");
      }

      const metadata = await readMetadata();
      assert.equal(metadata.pairingSessions.length, 1);
      assert.equal(metadata.pairingSessions[0].token, "654321");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    if (originalPairCode === undefined) {
      delete process.env.PB_PAIR_CODE;
    } else {
      process.env.PB_PAIR_CODE = originalPairCode;
    }
    await writeMetadata(originalMetadata);
  }
});

test("GET /api/pairing/qr.svg returns an SVG QR code and stores a pair code session", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [],
    shares: []
  });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/pairing/qr.svg`, {
        headers: { "x-forwarded-host": "192.168.1.50:3000" }
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);

      const svg = await response.text();
      assert.match(svg, /<svg/);
      assert.match(svg, /<\/svg>/);

      const metadata = await readMetadata();
      assert.equal(metadata.pairingSessions.length, 1);
      assert.match(metadata.pairingSessions[0].token, /^\d{6}$/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("GET /api/pairing/qr.svg can render an existing pair code without creating another session", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [],
    pairingSessions: [
      {
        id: "existing-pairing-session",
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

      const response = await fetch(`http://127.0.0.1:${address.port}/api/pairing/qr.svg?pairCode=123456`, {
        headers: { "x-forwarded-host": "192.168.1.50:3000" }
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);

      const metadata = await readMetadata();
      assert.equal(metadata.pairingSessions.length, 1);
      assert.equal(metadata.pairingSessions[0].token, "123456");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});
