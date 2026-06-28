# PocketBridge Manual QA Checklist

Use this checklist for the remaining device-bound validation after the automated MVP checks pass.

Automated baseline before manual QA:

```bash
npm test
npm run demo:smoke
npm run demo:contract
npm run demo:live
npm run demo:lan-check
npm run env:check
```

Expected automated status:

- Node and npm are OK.
- `npm test` passes all server, contract, integration-doc, and source-contract checks.
- `demo:lan-check` prints Mac UI, mobile fallback, WebSocket, LAN candidates, and `health -> pairing-json -> pairing-qr -> mac-ui -> mobile-fallback -> websocket -> text-upload`.
- Flutter and Dart may still be reported as unavailable on this Mac; that is handled in the Flutter workstation section.

## Project Status Gate

- Automated MVP confidence: 97%.
- Remaining scope: device checks that cannot be proven from this Mac alone.
- Stop condition: every required row below has an owner, date, evidence, and pass/fail result.

## Flutter Workstation

Required machine:

- Flutter SDK installed.
- Android SDK or iOS simulator configured.
- Repository checked out with this PR branch or merged `main`.

Commands:

```bash
cd apps/mobile_flutter
flutter doctor
flutter pub get
flutter test
flutter run
```

Pass criteria:

- `flutter doctor` has no blocker for the selected target.
- `flutter test` passes.
- App launches as `PocketBridge`.
- Android package identity is `app.pocketbridge.mobile`.
- App can store, restore, and forget pairing data.

Evidence to save:

- `flutter doctor` summary.
- `flutter test` output.
- Screenshot or short clip of the app home screen.

## Physical Phone LAN And QR

Preflight on Mac:

```bash
npm run build
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run demo:lan-check
npm run start
```

Phone steps:

1. Put Mac and phone on the same network.
2. Open `http://<Mac-LAN-IP>:3000/` on the Mac.
3. Scan the pairing QR from the Flutter app.
4. Confirm the app stores `serverBaseUrl`, `wsUrl`, and `pairCode`.
5. Upload a text note from phone to Mac.
6. Upload one image or document from phone to Mac.
7. Select a Mac item and send it to phone over Bluetooth.
8. Download the shared item on phone.

Pass criteria:

- QR payload points to `http://<Mac-LAN-IP>:3000`, not `localhost`.
- Mac PocketInbox updates without manual page refresh.
- Mobile app receives shared Mac item.
- File download opens or saves correctly on the phone.

Fallback path:

- If Flutter is blocked, open `http://<Mac-LAN-IP>:3000/mobile.html` on the phone and run the same upload/share/download path.

## Built-in Capture Studio

Preflight:

```bash
npm run start
```

Manual steps:

1. Open the Mac UI at `http://<Mac-LAN-IP>:3000/`.
2. Click `Capture screen`.
3. Choose a screen or window from the browser permission sheet.
4. Draw one visible annotation on the capture canvas.
5. Click `Save capture`.
6. Select the saved capture and export it to the knowledge base.

Pass criteria:

- Item appears with `PocketBridge Capture` as the source device.
- File is copied into `data/inbox/YYYY-MM-DD/<itemId>/original`.
- Knowledge export writes Markdown under `data/obsidian/PocketBridge/inbox`.
- Attached asset is copied under `data/obsidian/PocketBridge/assets/pocketbridge`.

Evidence to save:

- Screenshot permission sheet or Capture Studio clip.
- PocketInbox item id.
- Generated Markdown path.

## Bluetooth Send To Bound Phone

Required setup:

- Mac and phone are paired through the PocketBridge QR flow.
- An annotated capture exists in PocketInbox.

Manual steps:

1. Select the annotated capture.
2. Click `Send by Bluetooth`.
3. Open or refresh `http://<Mac-LAN-IP>:3000/mobile.html` on the phone.
4. Confirm the capture appears in the shared list.
5. Download the capture on the phone.

Pass criteria:

- Mac calls `POST /api/ble/send/<itemId>`.
- Response includes `channel: "ble"` and `status: "queued"`.
- Item becomes `sharedToMobile=true`.
- Phone can download the same annotated capture.

## Standalone PocketKey

Required setup:

- Mac and phone are on the same network.
- Phone opens `http://<Mac-LAN-IP>:3000/mobile.html`.
- Phone is paired with the Mac.

Manual steps:

1. Keep `Bluetooth RSSI` near `-50 dBm` on the phone page.
2. Watch Mac Web PocketKey switch to trusted/unlocked.
3. Drag `Bluetooth RSSI` below `-85 dBm`.
4. Watch Mac Web PocketKey switch to locked.
5. Move RSSI into the middle range to confirm away state.

Pass criteria:

- `trusted`, `away`, and `locked` states are derived by `/api/ble/rssi`.
- Strong signal unlocks, weak signal locks.
- Mac UI updates PocketKey state for each event.
- WebSocket clients receive BLE status updates.

## Real BLE Agent

Required setup:

- Mac Bluetooth is enabled and the BLE Agent has Bluetooth permission.
- Phone Bluetooth is enabled and the Flutter app is installed on a real device.
- Disable Wi-Fi transfer fallback for this pass.
- Start the bridge with:

```bash
PB_BLE_TRANSPORT=agent PB_BLE_AGENT_URL=http://127.0.0.1:41237 npm run start
```

Manual steps:

1. Start the macOS BLE Agent and confirm it advertises `PocketBridgeTransferService`.
2. Pair the phone through the normal PocketBridge QR flow.
3. Confirm the phone connects to the BLE service and subscribes to downlink notifications.
4. Save an annotated Capture Studio image on Mac.
5. Click `Send by Bluetooth`.
6. Confirm the agent receives `POST /transfers`.
7. Confirm the phone receives metadata, all chunks, and the final checksum frame.
8. Move the phone near the Mac and confirm `PocketKeyService` RSSI is trusted.
9. Move the phone away or disable Bluetooth and confirm away after 10 seconds, locked after 20 seconds.

Pass criteria:

- Mac and phone logs show the same transfer id.
- Chunk count and total bytes match on both sides.
- SHA-256 matches for the received file.
- PocketInbox item is not marked shared if the BLE Agent is unavailable.
- Locked transition triggers the configured macOS lock command.
- Returning to trusted restores PocketBridge app trust state without bypassing macOS password or Touch ID policy.

## Third-party Compatibility

These are optional compatibility checks, not final-demo requirements:

- Snapzy can still export files into `data/watch/snapzy` for folder import.
- BLEUnlock can still call `integrations/bleunlock/pocketkey-status.sh`.
- Neither app needs to be opened during the final PocketBridge standalone demo.

## BLE Capsule Text Proof

Script bridge:

```bash
PB_PAIR_CODE=<pair-code> ./integrations/ble-capsule/capsule-text.sh "short offline note from BLE"
```

Pass criteria:

- New PocketInbox text item is created.
- Item origin is `mobile`.
- Source device is `BLE Capsule`.
- Tags include `ble-capsule`.

## Acceptance Record

| Area | Owner | Date | Result | Evidence |
| --- | --- | --- | --- | --- |
| Automated baseline |  |  |  |  |
| Flutter workstation |  |  |  |  |
| Physical phone LAN/QR |  |  |  |  |
| Built-in Capture Studio |  |  |  |  |
| Bluetooth send to bound phone |  |  |  |  |
| Standalone PocketKey |  |  |  |  |
| Third-party compatibility |  |  |  |  |
| BLE Capsule text proof |  |  |  |  |

## Release Decision

Ready to mark MVP demo complete when:

- Automated baseline is green.
- Flutter or browser fallback path is demonstrated on a physical phone.
- Built-in Capture Studio creates one annotated capture without opening Snapzy.
- Bluetooth send delivers that annotated capture to the bound phone.
- Standalone PocketKey demonstrates RSSI-based unlock, away, and lock without opening BLEUnlock.
- Knowledge export produces an Obsidian-readable Markdown note with expected content and asset links.
