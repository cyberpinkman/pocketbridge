import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("macOS real BLE agent source exposes CoreBluetooth transfer and PocketKey primitives", async () => {
  const packageFile = await fs.readFile("integrations/real-ble-agent/mac-agent/Package.swift", "utf8");
  const source = await fs.readFile("integrations/real-ble-agent/mac-agent/Sources/PocketBridgeBLEAgent/main.swift", "utf8");
  const contract = JSON.parse(await fs.readFile("integrations/real-ble-agent/agent-contract.json", "utf8"));
  const readme = await fs.readFile("integrations/real-ble-agent/README.md", "utf8");

  assert.match(packageFile, /PocketBridgeBLEAgent/);
  assert.match(packageFile, /macOS\(.v13\)/);

  assert.match(source, /import CoreBluetooth/);
  assert.match(source, /CBPeripheralManagerDelegate/);
  assert.match(source, /CBCentralManagerDelegate/);
  assert.match(source, /NWListener/);
  assert.match(source, /POST \/transfers/);
  assert.match(source, /SHA256/);
  assert.match(source, /CGSession -suspend/);
  assert.match(source, /startAdvertising/);
  assert.match(source, /scanForPeripherals/);
  assert.match(source, /maximumUpdateValueLength/);

  assert.match(source, new RegExp(contract.ble.transferService.uuid, "i"));
  assert.match(source, new RegExp(contract.ble.transferService.characteristics.downlinkNotify, "i"));
  assert.match(source, new RegExp(contract.ble.transferService.characteristics.uplinkWrite, "i"));
  assert.match(source, new RegExp(contract.ble.pocketKeyService.uuid, "i"));
  assert.match(source, new RegExp(String(contract.transfer.chunkSizeBytes)));

  assert.match(readme, /swift run PocketBridgeBLEAgent/);
});
