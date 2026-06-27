# PocketBridge Manual QA Checklist

Use this checklist for the remaining device-bound validation after automated checks pass. Android real-device testing is intentionally deferred until a physical device is available; this file defines what must be captured when that happens.

## Automated Baseline

Run these before manual QA from the repository root:

```bash
cd server
npm run build
npm test
npm run demo:smoke
npm run demo:ui-smoke
npm run demo:lan-check
```

Run Flutter checks from the mobile app directory:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter pub get
$HOME/development/flutter/bin/dart analyze
$HOME/development/flutter/bin/flutter test
$HOME/development/flutter/bin/flutter build apk --debug
```

Pass criteria:

- Server build, tests, smoke, UI smoke, and LAN preflight all exit 0.
- Flutter analyze, tests, and Android debug APK build exit 0.
- Latest GitHub Actions CI run is green for both server and Flutter Android jobs.

Evidence to save:

- Command output or CI run URL.
- Commit SHA under test.
- `pocketbridge-mobile-debug-apk` artifact URL or downloaded `app-debug.apk` filename.
- Any non-blocking warning copied into the acceptance record.

## Android Real Phone LAN And QR

Mac preflight:

```bash
cd server
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run demo:lan-check
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run dev
```

Phone and app steps:

1. Put the Mac and Android phone on the same Wi-Fi, hotspot, or routed LAN.
2. Confirm the phone can open `http://<Mac-LAN-IP>:3000/mobile.html` in its browser.
3. Open `http://<Mac-LAN-IP>:3000/` on the Mac.
4. Run the Flutter app on the phone.
5. Scan the Mac QR code from the app.
6. Confirm the app stores `serverBaseUrl`, `wsUrl`, and `pairCode`.
7. Upload one text note from phone to Mac.
8. Upload one image or document from phone to Mac.
9. Share one Mac item back to mobile.
10. Download the shared item on the phone.
11. Kill and reopen the app, then confirm the pairing restores.
12. Use the forget-pairing action and confirm the app returns to the pairing state.

Pass criteria:

- QR payload points to `http://<Mac-LAN-IP>:3000`, not `localhost`.
- Mac PocketInbox updates without manual page refresh.
- Uploaded text and file items show `origin=mobile`.
- Mobile app receives the shared Mac item.
- Shared file download opens or saves successfully on the phone.
- Pairing restore and forget-pairing paths both work.

Evidence to save:

- Android device model and OS version.
- `flutter devices` output.
- Screenshot or short clip of QR pairing.
- Screenshot or short clip of phone upload appearing in Mac PocketInbox.
- Screenshot or short clip of Mac-to-phone shared download.

## Mobile Browser Fallback

Use this path if Flutter runtime setup is blocked but the phone can reach the Mac server.

Steps:

1. Open `http://<Mac-LAN-IP>:3000/mobile.html` on the phone.
2. Upload a text note.
3. Upload a small file or image.
4. Share one Mac item to mobile.
5. Download the shared item from the phone browser.

Pass criteria:

- Browser fallback connects over `/ws`.
- Text and file uploads appear in Mac PocketInbox.
- Shared item list updates on the phone browser.
- Downloaded file contents match the source item.

Evidence to save:

- Phone browser URL bar showing the LAN IP.
- Mac PocketInbox screenshot with fallback text and file items.
- Downloaded filename and file size.

## Snapzy Integration

Preflight:

```bash
mkdir -p data/watch/snapzy
cd server
npm run dev
```

Steps:

1. Capture or annotate a screenshot in Snapzy.
2. Export or copy the result into `data/watch/snapzy`.
3. Watch Mac PocketInbox for the imported item.
4. Open the item details.
5. Save the item to the knowledge base.

Pass criteria:

- Item appears with `origin=snapzy`.
- File is stored under `data/inbox/YYYY-MM-DD/<itemId>/original`.
- Knowledge export writes Markdown under `data/obsidian/PocketBridge/`.
- Attached asset is copied under `data/obsidian/PocketBridge/attachments/`.

Evidence to save:

- Original Snapzy filename.
- PocketInbox item id.
- Generated Markdown path.

## BLEUnlock Integration

API bridge preflight:

```bash
cd server
npm run dev
```

In another shell:

```bash
BASE_URL=http://127.0.0.1:3000
PAIR_CODE=<pair-code>

curl -X POST "$BASE_URL/api/ble/status" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"status":"trusted","deviceName":"Demo Phone","rssi":-49}'

curl -X POST "$BASE_URL/api/ble/status" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"status":"away","deviceName":"Demo Phone","rssi":-82}'

curl -X POST "$BASE_URL/api/ble/status" \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"status":"locked","deviceName":"Demo Phone"}'
```

Steps:

1. Record the active pair code printed by the server.
2. Use the curl commands above to prove the API bridge accepts `trusted`, `away`, and `locked`.
3. If Ding has a BLEUnlock hook ready, configure it to make the same authenticated `POST /api/ble/status` calls.
4. Move the phone near the Mac and trigger a `trusted` event.
5. Move the phone away and trigger an `away` event.
6. Trigger or simulate a `locked` event.
7. Watch Mac Web PocketKey state and WebSocket event log.

Pass criteria:

- `trusted`, `away`, and `locked` states are accepted by `/api/ble/status`.
- Mac UI updates PocketKey state for each event.
- WebSocket clients receive `ble.status` updates.

Evidence to save:

- BLEUnlock hook configuration.
- Curl or hook command output.
- Mac UI screenshot or short clip for each state.

## Acceptance Record

| Area | Owner | Date | Result | Evidence |
| --- | --- | --- | --- | --- |
| Automated baseline |  |  |  |  |
| Android real phone LAN/QR |  |  |  |  |
| Mobile browser fallback |  |  |  |  |
| Snapzy integration |  |  |  |  |
| BLEUnlock integration |  |  |  |  |

## Release Decision

Ready to mark the MVP demo complete when:

- Automated baseline is green.
- Flutter Android or mobile browser fallback path is demonstrated on a physical phone.
- Snapzy import is demonstrated with one real exported capture.
- BLEUnlock hook or API bridge demonstrates `trusted`, `away`, and `locked`.
- Knowledge export produces an Obsidian-readable Markdown note with expected content and asset links.
