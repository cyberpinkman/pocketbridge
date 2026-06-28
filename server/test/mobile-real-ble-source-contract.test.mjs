import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("mobile app exposes a real BLE demo client for transfer and PocketKey", async () => {
  const dart = await fs.readFile("apps/mobile_flutter/lib/real_ble_client.dart", "utf8");
  const main = await fs.readFile("apps/mobile_flutter/lib/main.dart", "utf8");
  const android = await fs.readFile(
    "apps/mobile_flutter/android/app/src/main/kotlin/app/pocketbridge/mobile/MainActivity.kt",
    "utf8"
  );
  const manifest = await fs.readFile("apps/mobile_flutter/android/app/src/main/AndroidManifest.xml", "utf8");
  const contract = JSON.parse(await fs.readFile("integrations/real-ble-agent/agent-contract.json", "utf8"));

  assert.match(dart, /MethodChannel\('pocketbridge\/ble'\)/);
  assert.match(dart, /startDemo/);
  assert.match(dart, /stopDemo/);
  assert.match(dart, new RegExp(contract.ble.transferService.uuid, "i"));
  assert.match(dart, new RegExp(contract.ble.pocketKeyService.uuid, "i"));

  assert.match(main, /real_ble_client\.dart/);
  assert.match(main, /Start BLE Demo/);
  assert.match(main, /Stop BLE/);
  assert.match(main, /RealBleClient/);

  assert.match(android, /BluetoothGattCallback/);
  assert.match(android, /BluetoothLeScanner/);
  assert.match(android, /BluetoothLeAdvertiser/);
  assert.match(android, /MethodChannel/);
  assert.match(android, /pocketbridge\/ble/);
  assert.match(android, /writeCharacteristic/);
  assert.match(android, /startAdvertising/);
  assert.match(android, new RegExp(contract.ble.transferService.uuid, "i"));
  assert.match(android, new RegExp(contract.ble.pocketKeyService.uuid, "i"));

  assert.match(manifest, /android.permission.BLUETOOTH_SCAN/);
  assert.match(manifest, /android.permission.BLUETOOTH_CONNECT/);
  assert.match(manifest, /android.permission.BLUETOOTH_ADVERTISE/);
  assert.match(manifest, /android.permission.ACCESS_FINE_LOCATION/);
});
