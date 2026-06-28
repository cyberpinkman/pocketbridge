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
  assert.match(source, /osascript control-command-q/);
  assert.match(source, /pmset displaysleepnow/);
  assert.match(source, /No macOS lock command succeeded/);
  assert.match(source, /startAdvertising/);
  assert.match(source, /scanForPeripherals/);
  assert.match(source, /withServices: nil/);
  assert.match(source, /advertisesPocketKey/);
  assert.match(source, /CBAdvertisementDataOverflowServiceUUIDsKey/);
  assert.match(source, /maximumUpdateValueLength/);
  assert.match(source, /agentLog/);
  assert.match(source, /lastPocketKeySignalAt/);
  assert.match(source, /PB_POCKETKEY_LOCKED_RSSI/);
  assert.match(source, /PB_POCKETKEY_TRUSTED_RSSI/);
  assert.match(source, /PB_POCKETKEY_AWAY_SECONDS/);
  assert.match(source, /PB_POCKETKEY_LOCK_SECONDS/);
  assert.match(source, /PocketKey thresholds/);
  assert.match(source, /GET \/status/);
  assert.match(source, /lastPocketKeyRssi/);
  assert.match(source, /lastSeenAgeSeconds/);
  assert.match(source, /no PocketKey signal/);
  assert.match(source, /Ignoring invalid PocketKey RSSI 127/);
  assert.match(source, /POST \/lock/);
  assert.match(source, /Executed macOS lock command/);

  assert.match(source, new RegExp(contract.ble.transferService.uuid, "i"));
  assert.match(source, new RegExp(contract.ble.transferService.characteristics.downlinkNotify, "i"));
  assert.match(source, new RegExp(contract.ble.transferService.characteristics.uplinkWrite, "i"));
  assert.match(source, new RegExp(contract.ble.pocketKeyService.uuid, "i"));
  assert.match(source, new RegExp(String(contract.transfer.chunkSizeBytes)));

  assert.match(readme, /swift run PocketBridgeBLEAgent/);
});
