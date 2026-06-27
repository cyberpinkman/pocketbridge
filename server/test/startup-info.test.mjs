import { strict as assert } from "node:assert";
import http from "node:http";
import test from "node:test";
import { formatStartupInfo, lanUrlCandidates } from "../../dist/server/src/startupInfo.js";

test("lanUrlCandidates returns phone-reachable HTTP URLs for external IPv4 interfaces", () => {
  const urls = lanUrlCandidates(
    {
      lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
      en0: [{ family: "IPv4", address: "192.168.1.50", internal: false }],
      utun0: [{ family: "IPv6", address: "fe80::1", internal: false }]
    },
    3000
  );

  assert.deepEqual(urls, ["http://192.168.1.50:3000"]);
});

test("formatStartupInfo prints Mac UI, mobile fallback, Snapzy folder, and LAN candidates", () => {
  const lines = formatStartupInfo(
    {
      host: "0.0.0.0",
      port: 3000,
      publicHost: "192.168.1.50",
      snapzyWatchDir: "/tmp/pocketbridge/snapzy"
    },
    ["http://192.168.1.50:3000", "http://10.0.0.8:3000"]
  );

  assert.deepEqual(lines, [
    "PocketBridge local bridge listening on http://0.0.0.0:3000",
    "Mac UI: http://192.168.1.50:3000/",
    "Mobile browser fallback: http://192.168.1.50:3000/mobile.html",
    "Snapzy watch folder: /tmp/pocketbridge/snapzy",
    "LAN candidates: http://192.168.1.50:3000, http://10.0.0.8:3000"
  ]);
});

test("publicBaseUrl appends the server port when PB_PUBLIC_HOST is an IP address", () => {
  const lines = formatStartupInfo(
    {
      host: "0.0.0.0",
      port: 3000,
      publicHost: "192.168.1.50",
      snapzyWatchDir: "/tmp/pocketbridge/snapzy"
    },
    []
  );

  assert.equal(lines[1], "Mac UI: http://192.168.1.50:3000/");
  assert.equal(lines[2], "Mobile browser fallback: http://192.168.1.50:3000/mobile.html");
});

test("GET /api/pairing appends the server port when PB_PUBLIC_HOST is an IP address", async () => {
  const originalEnv = { ...process.env };
  process.env.PB_PUBLIC_HOST = "192.168.1.50";
  process.env.PORT = "3000";
  process.env.PB_DATA_DIR = "data";

  const moduleSuffix = `${Date.now()}-${Math.random()}`;
  const { createApp } = await import(`../../dist/server/src/app.js?publicHostCase=${moduleSuffix}`);
  const { readMetadata, writeMetadata } = await import(
    `../../dist/server/src/storage/metadataStore.js?publicHostCase=${moduleSuffix}`
  );
  const originalMetadata = await readMetadata();
  await writeMetadata({ items: [], pairingSessions: [], shares: [] });

  try {
    const server = http.createServer(createApp());
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert.equal(typeof address, "object");

      const response = await fetch(`http://127.0.0.1:${address.port}/api/pairing`, {
        headers: { host: "127.0.0.1:9999" }
      });
      assert.equal(response.status, 200);

      const body = await response.json();
      assert.equal(body.serverBaseUrl, "http://192.168.1.50:3000");
      assert.equal(body.wsUrl, "ws://192.168.1.50:3000/ws");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    process.env = originalEnv;
  }
});
