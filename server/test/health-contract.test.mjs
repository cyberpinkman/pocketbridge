import { strict as assert } from "node:assert";
import http from "node:http";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";

test("GET /health includes upstream service metadata and local trust state", async () => {
  const server = http.createServer(createApp());

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, "pocketbridge");
    assert.equal(body.version, 1);
    assert.equal(body.name, "PocketBridge");
    assert.equal(typeof body.trust, "object");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
