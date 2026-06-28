# PocketBridge

PocketBridge connects a phone and a Mac over the local network for fast capture, file transfer, PocketInbox review, and local knowledge-base export.

## Current Integrated Branch

This working tree integrates the PocketBridge MVP sync PR with the mobile Flutter scaffold work. The integration branch name is `codex/integrate-pocketbridge-mvp`.

```bash
git clone https://github.com/cyberpinkman/pocketbridge.git
cd pocketbridge
npm install
```

The canonical Node bridge now runs from the repository root. The older `server/` subpackage is not the primary entrypoint.

## Start The Mac Client

Use the native Mac client for the integrated demo:

```bash
open ./PocketBridge.command
```

or:

```bash
npm run mac:client
```

Run those from the repository root. A Desktop launcher is also safe for live demo: `~/Desktop/PocketBridge.command`.

The client starts or detects the local Node bridge and the real BLE agent, shows the pairing QR code, PocketInbox, native screen capture, file upload, phone handoff, knowledge export, PocketKey RSSI, and reversible demo lock controls in one window. It also stays resident in the macOS menu bar for status and quick controls after the main window is closed.

Build it without launching:

```bash
npm run mac:client:build
```

## Start The Bridge Directly

```bash
npm install
npm run dev
```

The server prints the Mac UI URL, mobile fallback URL, pair code, Snapzy watch folder, and LAN candidates.

For a physical-phone demo, use a phone-reachable Mac address:

```bash
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run dev
```

Before a live demo, verify the advertised pairing URLs:

```bash
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run demo:lan-check
```

## Demo Surfaces

- Native Mac client: `npm run mac:client`
- Mac Web UI fallback: `http://<Mac-LAN-IP>:3000/`
- Mobile browser fallback: `http://<Mac-LAN-IP>:3000/mobile.html`
- Flutter Android app: `apps/mobile_flutter/`
- Snapzy watch folder: `data/watch/snapzy/`
- Knowledge export: `data/obsidian/PocketBridge/`

The native Mac client, Web fallback, and Flutter app share the same contract:

- `GET /api/pairing`
- `GET /api/pairing/qr.svg?pairCode=<code>`
- `POST /api/items/text`
- `POST /api/items/upload`
- `GET /api/items`
- `GET /api/inbox`
- `GET /api/search?q=<query>`
- `GET /api/items/search?q=<query>`
- `GET /api/items?sharedToMobile=true`
- `GET /api/items/:id`
- `GET /api/items/:id/download`
- `POST /api/items/:id/share-to-mobile`
- `POST /api/items/:id/archive`
- `DELETE /api/items/:id`
- `POST /api/knowledge/:id`
- `GET /api/ble/status`
- `POST /api/ble/status`
- `/ws?pairCode=<code>&client=mobile`

## Flutter Android

Install dependencies and run from the repository root:

```bash
cd apps/mobile_flutter
flutter pub get
flutter run -d <android-device-id>
```

The app supports QR/manual pairing, text and file upload, upload progress, shared-item refresh, file download with progress, and local upload history.

For teammates without local Android tooling, use the latest successful CI artifact named `pocketbridge-mobile-debug-apk`.

## Verification

Run these from the repository root:

```bash
npm install
npm test
npm run demo:lan-check
npm run env:check
```

Run Flutter checks from `apps/mobile_flutter`:

```bash
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

GitHub Actions runs root Node bridge checks plus Flutter analyze/test/debug APK build.

## Manual QA

Automated checks cover the local MVP flow. Device-bound validation remains in:

```text
docs/MANUAL_QA_CHECKLIST.md
```

The remaining manual gates are physical-phone LAN/QR, Flutter workstation or CI artifact install, real Snapzy import, BLEUnlock, and BLE Capsule text proof.

## License

MIT. See `LICENSE`.
