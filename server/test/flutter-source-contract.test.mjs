import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("Flutter mobile source targets the upstream PocketBridge API contract", async () => {
  const api = await fs.readFile("apps/mobile_flutter/lib/pocket_api.dart", "utf8");
  const models = await fs.readFile("apps/mobile_flutter/lib/pocket_models.dart", "utf8");
  const main = await fs.readFile("apps/mobile_flutter/lib/main.dart", "utf8");
  const pubspec = await fs.readFile("apps/mobile_flutter/pubspec.yaml", "utf8");

  assert.match(api, /X-PocketBridge-Pair-Code/);
  assert.match(api, /\/api\/items\/text/);
  assert.match(api, /\/api\/items\/upload/);
  assert.match(api, /\/api\/items\?sharedToMobile=true/);
  assert.match(api, /Uri websocketUri\(\)/);

  assert.match(models, /class PairingInfo/);
  assert.match(models, /serverBaseUrl/);
  assert.match(models, /pairCode/);
  assert.match(models, /class PocketItem/);
  assert.match(models, /sharedToMobile/);

  assert.match(main, /import 'pocket_api\.dart';/);
  assert.match(main, /IOWebSocketChannel\.connect/);
  assert.match(main, /NavigationBar/);
  assert.match(main, /NavigationDestination/);
  assert.match(main, /label: 'Pairing'/);
  assert.match(main, /label: 'Capture'/);
  assert.match(main, /label: 'Shared'/);
  assert.match(main, /_formatTimestamp\(item\.createdAt\)/);
  assert.match(main, /String _formatTimestamp\(DateTime value\)/);
  assert.match(main, /shared_preferences/);
  assert.match(main, /SharedPreferences\.getInstance\(\)/);
  assert.match(main, /pocketbridge\.pairing/);
  assert.match(main, /prefs\.setString\(_pairingPrefsKey, pairing\.encode\(\)\)/);
  assert.match(main, /prefs\.remove\(_pairingPrefsKey\)/);
  assert.doesNotMatch(main, /['"]\/upload['"]/);
  assert.doesNotMatch(main, /['"]\/share['"]/);
  assert.doesNotMatch(main, /pairing\/confirm/);

  assert.match(pubspec, /http:/);
  assert.match(pubspec, /web_socket_channel:/);
  assert.match(pubspec, /shared_preferences:/);
  assert.match(pubspec, /mime:/);
  assert.match(pubspec, /http_parser:/);
  assert.match(pubspec, /sdk: ">=3\.11\.0 <4\.0\.0"/);
});
