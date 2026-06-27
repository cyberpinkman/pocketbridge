# PocketBridge Demo Script

## Start

Run from the repository root:

```bash
git checkout codex/mobile-flutter-scaffold
```

Then start the server:

```bash
cd server
npm install
npm run dev
```

Keep the printed pair code available for curl smoke commands:

```bash
export PAIR_CODE=<printed-pair-code>
export BASE_URL=http://127.0.0.1:3000
```

Open Mac UI:

```text
http://<mac-lan-ip>:3000/
```

If the LAN IP changes, use the address printed by the server.

If the phone cannot open the printed URL, restart with:

```bash
PB_PUBLIC_HOST=<phone-reachable-mac-ip> npm run dev
```

Paths under `data/` below are relative to the repository root when using this start command.

## Demo Flow

1. Show the Mac PocketBridge UI and pairing QR code.
2. On the phone, open the Flutter app and scan the QR code.

Android run command in a second terminal from the repository root:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter pub get
$HOME/development/flutter/bin/flutter run -d <android-device-id>
```

If no Android device is available yet, use the browser fallback:

```text
http://<mac-lan-ip>:3000/mobile.html
```

3. Upload a text idea from the phone.
4. Upload a photo or file from the phone.
5. Show PocketInbox updating on the Mac.
6. Click `Save` on one item and show the generated Markdown under:

```text
data/obsidian/PocketBridge/
```

7. Save a Snapzy screenshot into:

```text
data/watch/snapzy/
```

8. Show the screenshot appearing in PocketInbox.
9. Click `Share` on the screenshot.
10. Use `Search` or `Show archived` in PocketInbox if the list is crowded.
11. Refresh the phone page and download the shared screenshot.
12. Click `Trusted`, then `Away`, then `Locked` in the Mac UI to demonstrate PocketKey state.

## Useful Smoke Commands

Run the automated local demo smoke first:

```bash
cd server
npm run demo:smoke
npm run demo:ui-smoke
npm run demo:record-fallback
```

It uses a temporary data directory and verifies pairing JSON, pairing QR SVG, upload, inbox listing, knowledge export, Snapzy import, share-back download, search/archive/delete, WebSocket events, BLE API state, BLE WebSocket state events, server restart persistence, and API-level phone upload after restart.

The UI smoke opens the Mac and mobile fallback pages in headless Chromium. It verifies mobile fallback text upload into Mac PocketInbox, a Snapzy watch screenshot in PocketInbox, shared-file listing and download from the mobile fallback, and BLE state reflected in the Mac UI.
The first UI smoke run may download Chromium through Playwright.

The fallback recording command opens a side-by-side Mac UI and mobile fallback run, executes the fallback upload, Snapzy import, share-back download, and BLE state change, then writes:

```text
docs/demo-recordings/fallback-demo.webm
```

Create a phone text item:

```bash
curl -X POST "$BASE_URL/api/items/text" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"title":"Demo idea","text":"Phone to Mac to knowledge.","origin":"mobile","sourceDevice":"Demo Phone","tags":["demo"]}'
```

Upload a demo file as a phone item:

```bash
printf 'demo file' > /tmp/pocketbridge-demo.txt
curl -X POST "$BASE_URL/api/items/upload" \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -F origin=mobile \
  -F sourceDevice="Demo Phone" \
  -F 'tags=["demo"]' \
  -F file=@/tmp/pocketbridge-demo.txt
```

List inbox items:

```bash
curl "$BASE_URL/api/items" \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE"
```

Search inbox items:

```bash
curl "$BASE_URL/api/items/search?q=demo" \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE"
```

Save an item to knowledge:

```bash
export ITEM_ID=<id-from-list-items>
curl -X POST "$BASE_URL/api/knowledge/$ITEM_ID" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"tags":["pocketbridge","demo"],"note":"Saved during demo."}'
```

Share an item back to the phone:

```bash
curl -X POST "$BASE_URL/api/items/$ITEM_ID/share-to-mobile" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"sharedToMobile":true}'
```

Archive or restore an item:

```bash
curl -X POST "$BASE_URL/api/items/$ITEM_ID/archive" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"archived":true}'

curl -X POST "$BASE_URL/api/items/$ITEM_ID/archive" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"archived":false}'
```

Delete a disposable item:

```bash
curl -X DELETE "$BASE_URL/api/items/$ITEM_ID" \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE"
```

Trigger Snapzy folder import:

```bash
# Run this from the repository root.
mkdir -p data/watch/snapzy
printf 'snapzy demo' > data/watch/snapzy/demo-snapzy.txt
```

Set BLE state:

```bash
curl -X POST "$BASE_URL/api/ble/status" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"status":"trusted","deviceName":"Demo Phone","rssi":-48}'
```
