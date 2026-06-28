# PocketBridge MVP Integration Plan

Date: 2026-06-27

## Integrated Goal

Combine the local PocketBridge MVP demo with the Flutter Android mobile work into one runnable hackathon project.

## Canonical Structure

- Root `package.json` is the Node bridge entrypoint.
- Active server code lives in `server/src`.
- Mac demo UI lives in `apps/mac_desktop/web`.
- Flutter Android app lives in `apps/mobile_flutter`.
- Runtime data lives under `data/`.
- Manual device QA lives in `docs/MANUAL_QA_CHECKLIST.md`.

## Implemented Flow

1. Start the bridge from the repository root.
2. Pair mobile through QR or manual payload.
3. Upload text or files from phone to Mac.
4. Show PocketInbox updates on Mac.
5. Share file-backed items from Mac to phone.
6. Download shared files in Flutter with progress.
7. Import Snapzy captures from `data/watch/snapzy`.
8. Export selected items into `data/obsidian/PocketBridge`.
9. Demonstrate BLE states: trusted, away, locked.

## Verification

- `npm test`
- `npm run demo:live`
- `npm run demo:lan-check`
- `npm run env:check`
- `flutter analyze`
- `flutter test`
- `flutter build apk --debug`

## Remaining Manual Gates

- Physical phone LAN and QR scan.
- Real Snapzy app capture import.
- BLEUnlock integration on a Mac with the app installed.
- BLE Capsule hardware or script proof.
