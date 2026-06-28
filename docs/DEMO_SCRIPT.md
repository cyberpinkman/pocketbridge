# PocketBridge Demo Script

This script is the live hackathon path for the integrated MVP.

## Positioning

```text
Phone = inspiration collector and pocket key.
Mac = local-first data base and personal knowledge brain.
```

Implemented locally:

- Native Mac client, Mac local service, phone browser fallback, QR/pair-code pairing, WebSocket sync.
- Phone/Mac text and file upload into PocketInbox.
- Local JSON storage under `data/metadata.json` and files under `data/inbox/`.
- Knowledge export into `data/obsidian/PocketBridge/`.
- Native Mac screen capture and direct PocketInbox upload.
- Bluetooth demo transfer through `Send by Bluetooth`, backed by `POST /api/ble/send/:itemId`.
- Mac-side real BLE Agent status through the native client and `/status`.
- Demo Lock shield: PocketKey `locked` covers the Mac client and `trusted` removes the shield without touching the macOS login session.
- Flutter Android real BLE demo controls: `Start BLE Demo` and `Stop BLE`.
- Standalone PocketKey states through Bluetooth RSSI: `trusted`, `away`, `locked`.
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
open ./PocketBridge.command
```

Click `Start` in the native Mac client. It starts or detects the Node bridge and BLE agent, then shows the pairing QR code, pair payload, PocketInbox, native capture, PocketKey RSSI, lock threshold, and activity log in one window. The visible `PB` menu bar item remains available for quick status, Demo Lock, refresh, and reopening the dashboard.

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

In the native Mac client:

1. Click `Capture Screen`.
2. Choose a region, screen, or window in the macOS capture UI.
3. Confirm the captured image appears in PocketInbox.

Expected signs:

- PocketInbox shows a new image item from `PocketBridge Mac Client`.
- The file is stored under `data/inbox/YYYY-MM-DD/<itemId>/original`.
- The item can be sent to the phone and exported to the knowledge base.

This replaces the browser Capture Studio and Snapzy dependency for the final demo. The Snapzy watch-folder bridge remains a compatibility adapter.

## Mac To Phone

1. In the native Mac client, select an item.
2. Click `Send to Phone`.
3. Refresh the phone shared list.
4. Download the file-backed item on Flutter and show download progress.

## Bluetooth Send To Bound Phone

Select the captured item in PocketInbox, then click `Send by Bluetooth`.

Expected signs:

- Phone Outbox count increases on Mac.
- Activity log shows the BLE queued transfer and chunk size.
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
2. Click `Save Knowledge`.
3. Confirm the item shows a path under `data/obsidian/PocketBridge`.
4. Confirm the Markdown contains `## Summary`, `## Content`, source frontmatter, and any attached asset link.

## PocketKey

Use the Android app BLE demo first:

1. Pair the phone with the QR code shown in the native Mac client.
2. Tap `Start BLE Demo` on Android.
3. Keep the phone close and watch native Mac client show `trusted`.
4. Move the phone away or shield it until RSSI drops to `-78 dBm` or lower.
5. Watch the native Mac client show `locked` and cover the screen with the Demo Lock shield.
6. Move the phone back near the Mac and watch the shield disappear when PocketKey returns to `trusted`.

Expected status flow:

```text
trusted -> away -> locked
```

RSSI thresholds:

- `rssi >= -62`: trusted / unlocked
- `-78 < rssi < -62`: away
- `rssi <= -78`: locked

The native Mac client also has `Demo Lock` and `Unlock` for manual rehearsal, but the primary demo signal comes from real Android BLE RSSI.

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

- Use `Upload File` in the native Mac client to upload a screenshot image.
- Keep the demo wording as PocketBridge Capture, not Snapzy.

If the phone cannot reach the Mac:

- Confirm both devices are on the same network.
- Use one of the printed LAN candidates.
- Restart with `PB_PUBLIC_HOST=<Mac-LAN-IP> npm run dev`.
