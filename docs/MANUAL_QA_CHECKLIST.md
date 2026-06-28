# PocketBridge Manual QA Checklist

Automated MVP confidence: 97%.

The remaining scope is device-bound or external-app-bound and must be verified manually before treating the hackathon demo as fully ready.

## Automated Baseline

Run from the repository root:

```bash
npm test
npm run demo:live
npm run demo:lan-check
npm run env:check
```

Expected automated status:

- Node and npm are OK.
- `npm test` passes all server, contract, integration-doc, and source-contract checks.
- `demo:lan-check` prints Mac UI, mobile fallback, WebSocket, LAN candidates, and `health -> pairing-json -> pairing-qr -> mac-ui -> mobile-fallback -> websocket -> text-upload`.
- `env:check` reports whether Flutter and Dart are available on this Mac.

Record command output in the Acceptance Record section.

## Project Status Gate

- Remaining scope: device checks that cannot be proven from this Mac alone.
- Stop condition: every required row below has an owner, date, evidence, and pass/fail result.

## Flutter Workstation

- `flutter pub get` succeeds in `apps/mobile_flutter`.
- `flutter analyze` succeeds.
- `flutter test` succeeds.
- `flutter build apk --debug` succeeds, or the CI `pocketbridge-mobile-debug-apk` artifact installs on a test Android phone.
- The app can pair through QR or pasted payload.
- Text upload, file upload, shared-item refresh, and download progress work against the Mac bridge.

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
3. Scan the pairing QR from the Flutter app or browser fallback.
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
- Native Mac client is open for the primary demo view.

Manual steps:

1. Keep `Bluetooth RSSI` near `-50 dBm` on the phone page.
2. Watch the native Mac client PocketKey switch to trusted/unlocked.
3. Drag `Bluetooth RSSI` below `-78 dBm`.
4. Watch the native Mac client show the Demo Lock shield.
5. Move RSSI into the middle range to confirm away state.
6. Move RSSI back above `-62 dBm` and confirm the Demo Lock shield clears.

Pass criteria:

- `trusted`, `away`, and `locked` states are derived by `/api/ble/rssi`.
- Strong signal unlocks, weak signal locks.
- Native Mac client updates PocketKey state for each event.
- WebSocket clients receive BLE status updates.

## Real BLE Agent

Required setup:

- Mac Bluetooth is enabled and the BLE Agent has Bluetooth permission.
- Phone Bluetooth is enabled and the Flutter app is installed on a real device.
- Disable Wi-Fi transfer fallback for this pass.
- Mac-side handoff rehearsal passes:

```bash
npm run demo:ble-agent
```

- Start the bridge with:

```bash
PB_BLE_TRANSPORT=agent PB_BLE_AGENT_URL=http://127.0.0.1:41237 npm run start
```

Manual steps:

1. Start the macOS BLE Agent and confirm it advertises `PocketBridgeTransferService`.
2. Pair the phone through the normal PocketBridge QR flow.
3. Open the Flutter app `Shared` tab and tap `Start BLE Demo`.
4. Confirm the phone connects to the BLE service and subscribes to downlink notifications.
5. Save an annotated Capture Studio image on Mac.
6. Click `Send by Bluetooth`.
7. Confirm the agent receives `POST /transfers`.
8. Confirm the phone receives metadata, all chunks, and the final checksum frame.
9. Move the phone near the Mac and confirm `PocketKeyService` RSSI is trusted.
10. Move the phone away or disable Bluetooth and confirm away after 3 seconds, locked after 8 seconds.
11. Move the phone back near the Mac and confirm the native Demo Lock shield clears on `trusted`.

Pass criteria:

- Mac and phone logs show the same transfer id.
- Chunk count and total bytes match on both sides.
- SHA-256 matches for the received file.
- PocketInbox item is not marked shared if the BLE Agent is unavailable.
- Locked transition triggers the native Demo Lock shield when `PB_POCKETKEY_LOCK_ACTION=demo`.
- Returning to trusted clears the Demo Lock shield without touching the macOS login session.

## Third-party Compatibility

These are optional compatibility checks, not final-demo requirements:

- Snapzy can still export files into `data/watch/snapzy` for folder import.
- BLEUnlock can still call `integrations/bleunlock/pocketkey-status.sh`.
- Neither app needs to be opened during the final PocketBridge standalone demo.

## BLE Capsule Text Proof

- Run the BLE Capsule text script from `integrations/ble-capsule`.
- Confirm a short text payload reaches the local bridge path documented by the integration.
- If hardware is unavailable, record the blocker and show the local script bridge.

## Acceptance Record

| Area | Owner | Date | Result | Evidence |
| --- | --- | --- | --- | --- |
| Automated baseline |  |  |  |  |
| Flutter workstation |  |  |  |  |
| Physical phone LAN/QR |  |  |  |  |
| Built-in Capture Studio |  |  |  |  |
| Bluetooth send to bound phone |  |  |  |  |
| Standalone PocketKey |  |  |  |  |
| Real BLE Agent |  |  |  |  |
| Third-party compatibility |  |  |  |  |
| BLE Capsule text proof |  |  |  |  |

## Release Decision

Ship the hackathon demo when:

- Automated baseline is green.
- Flutter or browser fallback path is demonstrated on a physical phone.
- Built-in Capture Studio creates one annotated capture without opening Snapzy.
- Bluetooth send delivers that annotated capture to the bound phone.
- Standalone PocketKey demonstrates RSSI-based unlock, away, and lock without opening BLEUnlock.
- Knowledge export produces an Obsidian-readable Markdown note with expected content and asset links.
