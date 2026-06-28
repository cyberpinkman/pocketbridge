import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("real BLE agent contract documents the non-simulated transfer and PocketKey path", async () => {
  const readme = await fs.readFile("integrations/real-ble-agent/README.md", "utf8");
  const contract = JSON.parse(await fs.readFile("integrations/real-ble-agent/agent-contract.json", "utf8"));
  const checklist = await fs.readFile("docs/MANUAL_QA_CHECKLIST.md", "utf8");

  assert.match(readme, /PB_BLE_TRANSPORT=agent/);
  assert.match(readme, /PB_BLE_AGENT_URL/);
  assert.match(readme, /POST \/transfers/);
  assert.match(readme, /CoreBluetooth/);
  assert.match(readme, /PocketBridgeTransferService/);
  assert.match(readme, /PocketKeyService/);
  assert.match(readme, /SHA-256/);
  assert.match(readme, /CGSession -suspend/);

  assert.equal(contract.transportMode, "agent");
  assert.equal(contract.http.transferEndpoint, "/transfers");
  assert.equal(contract.ble.transferService.name, "PocketBridgeTransferService");
  assert.equal(contract.ble.pocketKeyService.name, "PocketKeyService");
  assert.match(contract.ble.transferService.uuid, /^[0-9a-f-]{36}$/i);
  assert.match(contract.ble.pocketKeyService.uuid, /^[0-9a-f-]{36}$/i);
  assert.equal(contract.transfer.chunkSizeBytes, 512);
  assert.equal(contract.lock.awayAfterMs, 10000);
  assert.equal(contract.lock.lockAfterMs, 20000);

  assert.match(checklist, /Real BLE Agent/);
  assert.match(checklist, /Disable Wi-Fi transfer fallback/);
  assert.match(checklist, /PB_BLE_TRANSPORT=agent/);
  assert.match(checklist, /SHA-256 matches/);
});
