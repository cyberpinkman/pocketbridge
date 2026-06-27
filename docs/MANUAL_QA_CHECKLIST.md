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

- Automated MVP confidence: 96%.
- Remaining scope: device and app integration checks that cannot be proven from this Mac alone.
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
7. Select a Mac item and send it to phone.
8. Download the shared item on phone.

Pass criteria:

- QR payload points to `http://<Mac-LAN-IP>:3000`, not `localhost`.
- Mac PocketInbox updates without manual page refresh.
- Mobile app receives shared Mac item.
- File download opens or saves correctly on the phone.

Fallback path:

- If Flutter is blocked, open `http://<Mac-LAN-IP>:3000/mobile.html` on the phone and run the same upload/share/download path.

## Snapzy Integration

Preflight:

```bash
mkdir -p data/watch/snapzy
npm run start
```

Manual steps:

1. Capture or annotate a screenshot in Snapzy.
2. Export or copy the result into `data/watch/snapzy`.
3. Watch the Mac PocketInbox list.
4. Select the imported item.
5. Export it to the knowledge base.

Pass criteria:

- Item appears with Snapzy origin.
- File is copied into `data/inbox/YYYY-MM-DD/<itemId>/original`.
- Knowledge export writes Markdown under `data/obsidian/PocketBridge/inbox`.
- Attached asset is copied under `data/obsidian/PocketBridge/assets/pocketbridge`.

Evidence to save:

- Original Snapzy file name.
- PocketInbox item id.
- Generated Markdown path.

## BLEUnlock Integration

Script bridge:

```bash
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh trusted -49
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh away -82
PB_PAIR_CODE=<pair-code> ./integrations/bleunlock/pocketkey-status.sh locked
```

Manual steps:

1. Configure BLEUnlock event hooks to call `integrations/bleunlock/pocketkey-status.sh`.
2. Move phone near the Mac and trigger a trusted event.
3. Move phone away and trigger an away event.
4. Trigger or simulate a locked event.
5. Watch Mac Web PocketKey state and WebSocket event log.

Pass criteria:

- `trusted`, `away`, and `locked` states are accepted by `/api/ble/status`.
- Mac UI updates PocketKey state for each event.
- WebSocket clients receive BLE status updates.

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
| Snapzy integration |  |  |  |  |
| BLEUnlock integration |  |  |  |  |
| BLE Capsule text proof |  |  |  |  |

## Release Decision

Ready to mark MVP demo complete when:

- Automated baseline is green.
- Flutter or browser fallback path is demonstrated on a physical phone.
- Snapzy import is demonstrated with one real exported capture.
- BLEUnlock or the script bridge demonstrates trusted, away, and locked states.
- Knowledge export produces an Obsidian-readable Markdown note with expected content and asset links.
