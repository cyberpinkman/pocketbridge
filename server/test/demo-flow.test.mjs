import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { createApp } from "../../dist/server/src/app.js";
import { readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

test("PocketBridge demo smoke flow runs through pair, transfer, export, and trust", async () => {
  const originalMetadata = await readMetadata();
  const vaultDir = path.resolve("tmp", "demo-smoke-vault");
  const uploadedPaths = [];

  await fs.rm(vaultDir, { recursive: true, force: true });
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
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const publicBridgeUrl = "http://192.168.1.50:4317";

      const health = await getJson(`${baseUrl}/health`);
      assert.equal(health.ok, true);
      assert.equal(health.name, "PocketBridge");

      const pairing = await postJson(`${baseUrl}/pairing/session`, {
        bridgeUrl: publicBridgeUrl
      });
      assert.equal(pairing.pairingPayload.bridgeUrl, publicBridgeUrl);
      assert.equal(pairing.pairingPayload.token, pairing.session.token);

      const confirmed = await postJson(`${baseUrl}/pairing/confirm`, {
        token: pairing.session.token,
        deviceName: "Smoke Test Phone"
      });
      assert.equal(confirmed.session.deviceName, "Smoke Test Phone");
      assert.ok(confirmed.session.confirmedAt);

      const textUpload = await postMultipart(`${baseUrl}/upload`, (form) => {
        form.set("source", "phone");
        form.set("text", "PocketBridge smoke test text note");
      });
      assert.equal(textUpload.item.kind, "text");
      assert.equal(textUpload.item.source, "phone");

      const fileUpload = await postMultipart(`${baseUrl}/upload`, (form) => {
        form.set("source", "phone");
        form.set(
          "file",
          new Blob(["PocketBridge smoke test document"], { type: "text/plain" }),
          "smoke-phone-document.txt"
        );
      });
      assert.equal(fileUpload.item.kind, "document");
      assert.equal(fileUpload.item.source, "phone");
      assert.equal(fileUpload.item.originalName, "smoke-phone-document.txt");
      uploadedPaths.push(fileUpload.item.filePath);

      const inbox = await getJson(`${baseUrl}/items`);
      assert.equal(inbox.items.length, 2);

      const queued = await postJson(`${baseUrl}/share`, {
        itemId: fileUpload.item.id
      });
      assert.equal(queued.share.status, "queued");

      const shares = await getJson(`${baseUrl}/share`);
      const listedShare = shares.shares.find((share) => share.id === queued.share.id);
      assert.equal(listedShare.item.id, fileUpload.item.id);
      assert.equal(listedShare.downloadPath, `/items/${fileUpload.item.id}/download`);

      const sent = await postJson(`${baseUrl}/share/${queued.share.id}/sent`);
      assert.equal(sent.share.status, "sent");

      const exported = await postJson(`${baseUrl}/export/${fileUpload.item.id}`, {
        vaultDir
      });
      assert.equal(exported.item.status, "exported");
      assert.equal(path.basename(exported.outputPath).includes("-smoke-phone-document-txt-"), true);
      assert.equal(path.basename(exported.outputPath).endsWith(".md"), true);
      assert.ok(exported.assetPath.endsWith("smoke-phone-document.txt"));
      assert.match(await fs.readFile(exported.outputPath, "utf8"), /\[\[\.{2}\/assets\/pocketbridge\//);
      assert.equal(await fs.readFile(exported.assetPath, "utf8"), "PocketBridge smoke test document");

      const trusted = await postJson(`${baseUrl}/trust/simulate`, {
        trusted: true,
        reason: "Smoke test phone nearby"
      });
      assert.equal(trusted.trust.trusted, true);
      assert.equal(trusted.trust.reason, "Smoke test phone nearby");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await writeMetadata(originalMetadata);
    await fs.rm(vaultDir, { recursive: true, force: true });
    await Promise.all(uploadedPaths.filter(Boolean).map((filePath) => fs.rm(filePath, { force: true })));
  }
});

async function getJson(url) {
  const response = await fetch(url);
  await assertOk(response);
  return response.json();
}

async function postJson(url, body = undefined) {
  const response = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  await assertOk(response);
  return response.json();
}

async function postMultipart(url, buildForm) {
  const form = new FormData();
  buildForm(form);
  const response = await fetch(url, {
    method: "POST",
    body: form
  });
  await assertOk(response);
  return response.json();
}

async function assertOk(response) {
  if (!response.ok) {
    assert.fail(`${response.status} ${await response.text()}`);
  }
}
