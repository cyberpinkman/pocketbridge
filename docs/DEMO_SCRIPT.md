# PocketBridge Demo Script

This script is the live hackathon path for the integrated MVP.

## Positioning

```text
Phone = inspiration collector and pocket key.
Mac = local-first data base and personal knowledge brain.
```

Implemented locally:

- Mac local service, Desktop page, phone browser fallback, QR/pair-code pairing, WebSocket sync.
- Phone/Mac text and file upload into PocketInbox.
- Local JSON storage under `data/metadata.json` and files under `data/inbox/`.
- Knowledge export into `data/obsidian/PocketBridge/`.
- Built-in Capture Studio using browser `getDisplayMedia`, canvas annotation, and direct PocketInbox upload.
- Bluetooth demo transfer through `Send by Bluetooth`, backed by `POST /api/ble/send/:itemId`.
- Mac-side real BLE Agent handoff rehearsal through `npm run demo:ble-agent`.
- Flutter Android real BLE demo controls: `Start BLE Demo` and `Stop BLE`.
- Standalone PocketKey states through Bluetooth RSSI and `/api/ble/rssi`: `trusted`, `away`, `locked`.
- Third-party Snapzy and BLEUnlock bridges remain compatibility paths only; they are not required for the final demo.

Future-facing:

- Large-file BLE resume, background transfer hardening, and iOS native BLE parity.
- Pro Relay cloud transfer, resumable large files, payments, and AI parsing.

## Preflight

From the repository root:

```bash
npm install
npm test
npm run demo:live
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run demo:lan-check
npm run env:check
```

For the full rehearsal:

```bash
npm run demo:ready
```

This runs the browser/HTTP live rehearsal, the Mac BLE Agent handoff rehearsal, and the environment check. `npm run env:check` is the source of truth for whether this machine can run Flutter and dart locally. If it reports Flutter or Dart as blocked, use the browser fallback for the phone role:

```text
http://<Mac-LAN-IP>:3000/mobile.html
```

## Start

```bash
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run dev
```

Open the Mac UI at:

```text
http://<Mac-LAN-IP>:3000/
```

The page should show the pairing QR code, pair payload, PocketInbox, Capture Studio, PocketKey controls, and event log.

## Pair Phone

Use one of these paths:

1. Flutter app: scan the QR code or paste the pairing payload.
2. Browser fallback: open `http://<Mac-LAN-IP>:3000/mobile.html`.

Confirm the phone connects over `/ws?pairCode=<code>&client=mobile`.

## Phone To Mac

1. Send a text note from Flutter or browser fallback.
2. Upload an image or document from Flutter or browser fallback.
3. Confirm both appear in the Mac PocketInbox in real time.
4. For Flutter, show upload progress and local upload history.

## Capture Studio

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

## Mac To Phone

1. In the Mac UI, select an item.
2. Click the action that shares the item to mobile.
3. Refresh the phone shared list.
4. Download the file-backed item on Flutter and show download progress.

## Bluetooth Send To Bound Phone

Select the annotated capture item in PocketInbox, then click `Send by Bluetooth`.

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

## Knowledge Export

1. Select an inbox item on Mac.
2. Export it to the knowledge base.
3. Confirm the item shows a path under `data/obsidian/PocketBridge`.
4. Confirm the Markdown contains `## Summary`, `## Content`, source frontmatter, and any attached asset link.

## PocketKey

Use the paired phone page first:

1. Open `http://<Mac-LAN-IP>:3000/mobile.html` on the phone.
2. Pair it with the Mac.
3. Keep `Bluetooth RSSI` near `-50 dBm`.
4. Watch the Mac PocketKey panel switch to trusted/unlocked.
5. Drag `Bluetooth RSSI` below `-85 dBm`.
6. Watch the Mac PocketKey panel switch to locked.

Expected status flow:

```text
trusted -> away -> locked
```

RSSI thresholds:

- `rssi >= -65`: trusted / unlocked
- `-85 < rssi < -65`: away
- `rssi <= -85`: locked

The Mac UI also has manual PocketKey buttons for rehearsal, but the primary demo signal comes from PocketBridge Mobile RSSI.

Optional BLEUnlock compatibility hook:

```bash
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh trusted -49
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh away -82
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh locked
```

The script posts to `/api/ble/status`, so it uses the same WebSocket update path as the standalone PocketKey controls.

## MCP / API Showcase

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

## Fallbacks

If Flutter is blocked:

- Use `http://<Mac-LAN-IP>:3000/mobile.html`.
- State that `env:check` reported the Flutter/dart blocker, while the API contract and browser fallback are verified.

If browser screen capture is blocked:

- Use the built-in file upload control to upload a screenshot image.
- Keep the demo wording as PocketBridge Capture, not Snapzy.

If the phone cannot reach the Mac:

- Confirm both devices are on the same network.
- Use one of the printed LAN candidates.
- Restart with `PB_PUBLIC_HOST=<Mac-LAN-IP> npm run dev`.
