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

test("POST /api/ble/rssi derives PocketKey lock state from signal strength", async () => {
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

      const trustedResponse = await fetch(`http://127.0.0.1:${address.port}/api/ble/rssi`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          deviceName: "Bound Phone",
          rssi: -52
        })
      });
      assert.equal(trustedResponse.status, 200);
      const trusted = await trustedResponse.json();
      assert.equal(trusted.status, "trusted");
      assert.equal(trusted.lockState, "unlocked");
      assert.equal(trusted.rssi, -52);

      const lockedResponse = await fetch(`http://127.0.0.1:${address.port}/api/ble/rssi`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          deviceName: "Bound Phone",
          rssi: -91
        })
      });
      assert.equal(lockedResponse.status, 200);
      const locked = await lockedResponse.json();
      assert.equal(locked.status, "locked");
      assert.equal(locked.lockState, "locked");
      assert.equal(locked.rssi, -91);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /api/ble/status locked requests macOS lock from the BLE agent", async () => {
  const originalMetadata = await readMetadata();
  const originalTransport = process.env.PB_BLE_TRANSPORT;
  const originalAgentUrl = process.env.PB_BLE_AGENT_URL;
  const lockRequests = [];

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

  const agent = http.createServer((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/lock");
    lockRequests.push(request.url);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "locked" }));
  });

  try {
    await new Promise((resolve) => agent.listen(0, "127.0.0.1", resolve));
    const agentAddress = agent.address();
    assert.equal(typeof agentAddress, "object");
    process.env.PB_BLE_TRANSPORT = "agent";
    process.env.PB_BLE_AGENT_URL = `http://127.0.0.1:${agentAddress.port}`;

    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/ble/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          status: "locked",
          deviceName: "Demo Phone",
          rssi: -91
        })
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.status, "locked");
      assert.equal(body.macLock.status, "requested");
      assert.deepEqual(lockRequests, ["/lock"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await new Promise((resolve) => agent.close(resolve));
    await writeMetadata(originalMetadata);
    restoreEnv("PB_BLE_TRANSPORT", originalTransport);
    restoreEnv("PB_BLE_AGENT_URL", originalAgentUrl);
  }
});

test("GET /api/ble/status derives away and locked states when phone heartbeat stops", async () => {
  const originalMetadata = await readMetadata();
  const originalAwayMs = process.env.PB_BLE_AWAY_MS;
  const originalLockMs = process.env.PB_BLE_LOCK_MS;
  process.env.PB_BLE_AWAY_MS = "25";
  process.env.PB_BLE_LOCK_MS = "50";

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

      const heartbeatResponse = await fetch(`http://127.0.0.1:${address.port}/api/ble/rssi`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pocketbridge-pair-code": "123456"
        },
        body: JSON.stringify({
          deviceName: "Bound Phone",
          rssi: -51
        })
      });
      assert.equal(heartbeatResponse.status, 200);

      await new Promise((resolve) => setTimeout(resolve, 35));
      const awayResponse = await fetch(`http://127.0.0.1:${address.port}/api/ble/status`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(awayResponse.status, 200);
      const away = await awayResponse.json();
      assert.equal(away.status, "away");
      assert.equal(away.lockState, "away");
      assert.equal(away.rssi, -51);
      assert.ok(away.lastSignalAt);

      await new Promise((resolve) => setTimeout(resolve, 25));
      const lockedResponse = await fetch(`http://127.0.0.1:${address.port}/api/ble/status`, {
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(lockedResponse.status, 200);
      const locked = await lockedResponse.json();
      assert.equal(locked.status, "locked");
      assert.equal(locked.lockState, "locked");
      assert.equal(locked.rssi, -51);
      assert.equal(locked.lastSignalAt, away.lastSignalAt);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    if (originalAwayMs === undefined) {
      delete process.env.PB_BLE_AWAY_MS;
    } else {
      process.env.PB_BLE_AWAY_MS = originalAwayMs;
    }
    if (originalLockMs === undefined) {
      delete process.env.PB_BLE_LOCK_MS;
    } else {
      process.env.PB_BLE_LOCK_MS = originalLockMs;
    }
  }
});

test("POST /api/ble/send/:id queues an inbox item for the bound phone over BLE", async () => {
  const originalMetadata = await readMetadata();
  await writeMetadata({
    items: [
      {
        id: "capture-item",
        kind: "image",
        source: "mac",
        title: "Annotated capture",
        createdAt: "2026-06-27T00:00:00.000Z",
        status: "inbox",
        sourceDevice: "PocketBridge Capture",
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

      const response = await fetch(`http://127.0.0.1:${address.port}/api/ble/send/capture-item`, {
        method: "POST",
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.transfer.channel, "ble");
      assert.equal(body.transfer.status, "queued");
      assert.equal(body.transfer.itemId, "capture-item");
      assert.equal(body.item.sharedToMobile, true);

      const metadata = await readMetadata();
      assert.equal(metadata.items[0].sharedToMobile, true);
      assert.equal(metadata.shares[0].itemId, "capture-item");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("POST /api/ble/send/:id forwards transfers to a real BLE agent when enabled", async () => {
  const originalMetadata = await readMetadata();
  const originalTransport = process.env.PB_BLE_TRANSPORT;
  const originalAgentUrl = process.env.PB_BLE_AGENT_URL;
  const capturedRequests = [];

  await writeMetadata({
    items: [
      {
        id: "capture-item",
        kind: "image",
        source: "mac",
        title: "Annotated capture",
        createdAt: "2026-06-27T00:00:00.000Z",
        status: "inbox",
        sourceDevice: "PocketBridge Capture",
        filePath: "/tmp/pocketbridge-capture.png",
        mimeType: "image/png",
        size: 2048,
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

  const agent = http.createServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/transfers");
    let body = "";
    for await (const chunk of request) {
      body += chunk;
    }
    capturedRequests.push(JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "agent-transfer-1",
        itemId: "capture-item",
        channel: "ble",
        status: "queued",
        chunkSizeBytes: 128,
        createdAt: "2026-06-27T00:00:01.000Z"
      })
    );
  });

  try {
    await new Promise((resolve) => agent.listen(0, "127.0.0.1", resolve));
    const agentAddress = agent.address();
    assert.equal(typeof agentAddress, "object");
    process.env.PB_BLE_TRANSPORT = "agent";
    process.env.PB_BLE_AGENT_URL = `http://127.0.0.1:${agentAddress.port}`;

    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/ble/send/capture-item`, {
        method: "POST",
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.transfer.id, "agent-transfer-1");
      assert.equal(body.transfer.status, "queued");
      assert.equal(body.transfer.chunkSizeBytes, 128);
      assert.equal(capturedRequests.length, 1);
      assert.equal(capturedRequests[0].item.id, "capture-item");
      assert.equal(capturedRequests[0].item.title, "Annotated capture");
      assert.equal(capturedRequests[0].item.filePath, "/tmp/pocketbridge-capture.png");
      assert.equal(capturedRequests[0].share.itemId, "capture-item");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await new Promise((resolve) => agent.close(resolve));
    await writeMetadata(originalMetadata);
    restoreEnv("PB_BLE_TRANSPORT", originalTransport);
    restoreEnv("PB_BLE_AGENT_URL", originalAgentUrl);
  }
});

test("POST /api/ble/send/:id fails clearly when the real BLE agent is unavailable", async () => {
  const originalMetadata = await readMetadata();
  const originalTransport = process.env.PB_BLE_TRANSPORT;
  const originalAgentUrl = process.env.PB_BLE_AGENT_URL;
  process.env.PB_BLE_TRANSPORT = "agent";
  process.env.PB_BLE_AGENT_URL = "http://127.0.0.1:9";

  await writeMetadata({
    items: [
      {
        id: "capture-item",
        kind: "image",
        source: "mac",
        title: "Annotated capture",
        createdAt: "2026-06-27T00:00:00.000Z",
        status: "inbox",
        sourceDevice: "PocketBridge Capture",
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

      const response = await fetch(`http://127.0.0.1:${address.port}/api/ble/send/capture-item`, {
        method: "POST",
        headers: { "x-pocketbridge-pair-code": "123456" }
      });
      assert.equal(response.status, 502);

      const body = await response.json();
      assert.equal(body.error.code, "BLE_AGENT_UNAVAILABLE");
      assert.match(body.error.message, /BLE agent/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    restoreEnv("PB_BLE_TRANSPORT", originalTransport);
    restoreEnv("PB_BLE_AGENT_URL", originalAgentUrl);
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
