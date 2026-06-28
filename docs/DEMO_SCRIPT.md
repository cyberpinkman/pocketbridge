# PocketBridge Demo Script

This is the local runbook for the hackathon demo. It assumes the current repository shape, the shared upstream contract in `docs/SHARED_CONTRACT.md`, and the teammate brief in `/Users/zerone/Documents/pocketbridge-teammate-brief.md`.

## Teammate Brief Alignment

Current demo positioning:

```text
Phone = inspiration collector and pocket key.
Mac = local-first data base and personal knowledge brain.
```

Implemented and verified locally:

- Mac local service, Desktop page, phone browser fallback, QR/pair-code pairing, WebSocket sync.
- Phone/Mac text and file upload into PocketInbox.
- Local JSON storage under `data/metadata.json` and files under `data/inbox/`.
- Searchable PocketInbox in the Mac UI.
- Read-only demo API views: `GET /api/inbox` and `GET /api/search?q=...`.
- Knowledge export into `data/obsidian/PocketBridge/`.
- Built-in Capture Studio using browser `getDisplayMedia`, canvas annotation, and direct PocketInbox upload.
- Bluetooth demo transfer through `Send by Bluetooth`, backed by `/api/ble/send/:itemId`.
- Mac-side real BLE Agent handoff rehearsal through `npm run demo:ble-agent`.
- Flutter Android real BLE demo controls: `Start BLE Demo` and `Stop BLE`.
- Standalone PocketKey states through Bluetooth RSSI and `/api/ble/rssi`: `trusted`, `away`, `locked`.
- Optional BLE Capsule text bridge: `integrations/ble-capsule/capsule-text.sh`.
- Mobile browser fallback at `/mobile.html` for the current machine when Flutter/Dart are unavailable.
- Third-party Snapzy and BLEUnlock bridges remain compatibility paths only; they are not required for the final demo.

Still future-facing:

- Large-file BLE resume, background transfer hardening, and iOS native BLE parity.
- Pro Relay cloud transfer, resumable large files, payments, and AI parsing.

## 0. Pre-demo Rehearsal

Run the full rehearsal before showing the product:

```bash
npm run demo:ready
```

This runs the browser/HTTP live rehearsal, the Mac BLE Agent handoff rehearsal, and the environment check.

If you need to run the checks individually:

```bash
npm run env:check
npm run demo:live
npm run demo:ble-agent
```

This checks the core path in one command:

- pairing payload and WebSocket connection
- phone text upload
- phone file upload
- Mac-to-phone share and download
- Markdown knowledge export
- built-in Capture Studio screenshot and annotation flow
- Bluetooth send from Mac to bound phone
- Mac BLE Agent queue through `PB_BLE_TRANSPORT=agent`
- PocketKey status flow: `trusted -> away -> locked`

If this fails, use the failure output as the pre-demo fix list.

`npm run env:check` should be treated as the source of truth for whether this machine can run the Flutter app. If it reports Flutter or Dart as blocked, use the browser fallback path below.

## 1. Start PocketBridge

```bash
npm run build
npm run start
```

The startup log prints:

- Mac UI URL
- mobile browser fallback URL
- built-in Capture Studio in the Mac UI
- LAN URL candidates

For a physical phone, pick the LAN URL that is reachable from the phone. If the printed LAN candidate is wrong, restart with:

```bash
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run start
```

`PB_PUBLIC_HOST` may be a bare IP/host or a full URL. Bare hosts use the active server port.

## 2. Pair Phone

Open the Mac UI:

```text
http://<Mac-LAN-IP>:3000/
```

Show the QR code and pair code in the left sidebar.

Flutter path:

- Scan the QR payload from the Flutter app.
- The app should store `serverBaseUrl`, `wsUrl`, and `pairCode`.

Fallback path while Flutter / dart are unavailable on this machine:

```text
http://<Mac-LAN-IP>:3000/mobile.html
```

The browser fallback uses the same `/api` and `/ws` contract as Flutter.

## 3. Phone To Mac

From the phone or fallback page:

1. Upload a text note.
2. Upload a file or image.
3. Show PocketInbox updating in the Mac UI.

Expected signs:

- New rows appear in PocketInbox.
- Event Log shows received or updated item events.
- Item details include origin, device, status, and download path for file-backed items.

## 4. Knowledge Export

Select a phone-created text item or file item in PocketInbox.

Click `Export to knowledge base`.

Show the generated Markdown under:

```text
data/obsidian/PocketBridge/
```

Expected signs:

- Item status becomes `saved_to_knowledge` in the upstream API shape.
- The item detail shows a knowledge path.
- The Markdown contains `## Summary`, `## Content`, source frontmatter, and any attached asset link.

## 5. Built-in Capture Studio

In the Mac UI:

1. Click `Capture screen`.
2. Choose a screen or window in the browser permission sheet.
3. Draw on the captured image in Capture Studio.
4. Click `Save capture`.

Expected signs:

- PocketInbox shows a new image item from `PocketBridge Capture`.
- The file is stored under `data/inbox/YYYY-MM-DD/<itemId>/original`.
- The item can be sent to the phone and exported to the knowledge base.

This replaces the Snapzy dependency for the final demo. The Snapzy watch-folder bridge can still be used as a compatibility adapter after the standalone demo is green.

## 6. Bluetooth Send To Bound Phone

Select the annotated capture item in PocketInbox.

Click `Send by Bluetooth`.

On the phone fallback or Flutter app:

1. Refresh shared items.
2. Confirm the annotated capture appears in the shared list.
3. Download the shared file.

Expected signs:

- Phone Outbox count increases on Mac.
- Event Log shows a Bluetooth queued transfer.
- The phone sees the item through `GET /api/items?sharedToMobile=true`.
- The API path used is `POST /api/ble/send/<itemId>`.
- File download uses `GET /api/items/:id/download`.

Real BLE Agent rehearsal:

```bash
npm run demo:ble-agent
```

This verifies `PB_BLE_TRANSPORT=agent`, starts `PocketBridgeBLEAgent`, and proves the Mac `Send by Bluetooth` route can queue through the local BLE Agent.

Real Android BLE path:

1. Start the Mac bridge with `PB_BLE_TRANSPORT=agent`.
2. Start the Swift BLE Agent.
3. In the Flutter app, open `Shared`.
4. Tap `Start BLE Demo`.
5. Send an annotated capture from Mac.
6. Confirm Android logs show GATT connection, downlink notify, and uplink ACK writes.

## 7. PocketKey

Use the paired phone page first:

1. Open `http://<Mac-LAN-IP>:3000/mobile.html` on the phone.
2. Pair it with the Mac.
3. Keep `Bluetooth RSSI` near `-50 dBm`.
4. Watch the Mac PocketKey panel switch to trusted/unlocked.
5. Drag `Bluetooth RSSI` below `-85 dBm`.
6. Watch the Mac PocketKey panel switch to locked.

The Mac UI also has manual PocketKey buttons for rehearsal, but the primary demo signal comes from PocketBridge Mobile RSSI.

Expected status flow:

```text
trusted -> away -> locked
```

This demonstrates PocketBridge's standalone phone-key loop without requiring BLEUnlock during the demo.

RSSI thresholds:

- `rssi >= -65`: trusted / unlocked
- `-85 < rssi < -65`: away
- `rssi <= -85`: locked

Optional BLEUnlock compatibility hook:

```bash
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh trusted -49
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh away -82
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh locked
```

The script posts to `/api/ble/status`, so it uses the same WebSocket update path as the standalone PocketKey controls.

## 8. MCP / API Showcase

Use these endpoints to show that AI tools can read PocketInbox through a stable local API:

```bash
curl http://127.0.0.1:3000/api/inbox \
  -H "X-PocketBridge-Pair-Code: <pair-code>"

curl "http://127.0.0.1:3000/api/search?q=idea" \
  -H "X-PocketBridge-Pair-Code: <pair-code>"
```

The same pair code shown in the Mac UI works for this demo. `GET /api/items` remains the upstream contract endpoint for mobile clients.

Optional BLE Capsule text proof:

```bash
PB_PAIR_CODE=<pair-code> ./integrations/ble-capsule/capsule-text.sh "short offline note from BLE"
```

This lands in PocketInbox through `POST /api/items/text` with the `ble-capsule` tag.

## 9. Fallbacks

If Flutter is blocked:

- Use `http://<Mac-LAN-IP>:3000/mobile.html`.
- State clearly that local `flutter` and `dart` commands are unavailable on this machine, but the API contract and browser fallback are verified.

If browser screen capture is blocked:

- Use the built-in file upload control to upload a screenshot image.
- Keep the demo wording as PocketBridge Capture, not Snapzy.

If the phone cannot reach the Mac:

- Confirm both devices are on the same network.
- Use one of the printed LAN candidates.
- Restart with `PB_PUBLIC_HOST=<Mac-LAN-IP> npm run start`.
