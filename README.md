# PocketBridge

PocketBridge connects a phone and a Mac over the local network for fast capture, file transfer, PocketInbox review, and local knowledge-base export.

## Current MVP Branch

Until the MVP branch is merged back to `main`, clone and check out the working branch explicitly:

```bash
git clone https://github.com/cyberpinkman/pocketbridge.git
cd pocketbridge
git checkout codex/mobile-flutter-scaffold
```

If you already cloned the repository:

```bash
git fetch origin
git checkout codex/mobile-flutter-scaffold
git pull --ff-only
```

## Start Server

```bash
cd server
npm install
npm run dev
```

The server prints the LAN URL, pair code, Mac UI URL, and Snapzy watch folder.

Runtime output looks like:

```text
Pair code: <generated on start>
Mac UI: http://<mac-lan-ip>:3000/
Mobile browser fallback: http://<mac-lan-ip>:3000/mobile.html
LAN candidates: <detected IPv4 addresses>
```

If the phone cannot open the printed URL, restart with the Mac IP or URL that the phone can reach:

```bash
PB_PUBLIC_HOST=<phone-reachable-mac-ip-or-url> npm run dev
```

Before a live run, verify the pairing URLs that will be embedded in the QR payload:

```bash
PB_PUBLIC_HOST=<phone-reachable-mac-ip> npm run demo:lan-check
```

This preflight starts a temporary local server, checks pairing JSON/QR, Mac UI, mobile fallback, WebSocket, and a text upload while advertising the phone-reachable host.

## Mobile App

The Android-first Flutter MVP lives in:

```text
apps/mobile_flutter/
```

Commands below use this machine's Flutter SDK path. If your Flutter SDK is already on `PATH`, `flutter` can replace `$HOME/development/flutter/bin/flutter`.

Run it from the repository root after the Mac server is up. On a fresh clone, install Flutter packages first:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter pub get
$HOME/development/flutter/bin/flutter run -d <android-device-id>
```

If a teammate only needs an installable debug APK, use the latest successful GitHub Actions run for this branch and download the `pocketbridge-mobile-debug-apk` artifact. It contains:

```text
app-debug.apk
```

Install the downloaded APK with Android platform tools:

```bash
adb devices
adb install -r app-debug.apk
```

If no Android device is available, use the browser fallback printed by the server:

```text
http://<mac-lan-ip>:3000/mobile.html
```

For an Android phone run, make sure:

- The phone and Mac are on the same network.
- Android Developer Options and USB debugging are enabled.
- `$HOME/development/flutter/bin/flutter devices` lists the phone.
- If the phone cannot reach the QR URL, restart the server with `PB_PUBLIC_HOST=<phone-reachable-mac-ip> npm run dev`.

## Shared Contract

Pinkman and Ding should treat this file as the API source of truth:

```text
docs/SHARED_CONTRACT.md
```

Pinkman's implementation PRD:

```text
docs/PINKMAN_PRD.md
```

Local Flutter/Android environment status:

```text
docs/ENVIRONMENT_SETUP.md
```

Key defaults:

- REST API prefix: `/api`
- WebSocket: `/ws?pairCode=<pairCode>&client=mobile`
- Pairing: `GET /api/pairing`
- Upload text: `POST /api/items/text`
- Upload file: `POST /api/items/upload`
- List items: `GET /api/items`
- Search items: `GET /api/items/search?q=<query>`
- Share to phone: `POST /api/items/:id/share-to-mobile`
- Archive or restore: `POST /api/items/:id/archive`
- Delete item: `DELETE /api/items/:id`
- Knowledge export: `POST /api/knowledge/:id`
- BLE status: `GET /api/ble/status`, `POST /api/ble/status`

Runtime environment variables:

- `PORT`: HTTP port, default `3000`
- `PB_PUBLIC_HOST`: Mac IP, hostname, `host:port`, or full `http(s)://` URL embedded in QR payload for phone access
- `PB_LAN_CHECK_PORT`: optional temporary port for `npm run demo:lan-check`; default `0` lets the OS pick a free port
- `PB_SERVER_BASE_URL`: full override for the QR/API base URL
- `PB_WS_URL`: full override for the WebSocket URL
- `PB_DATA_DIR`: runtime data directory, default `data/` at the repository root
- `PB_OBSIDIAN_DIR`: Markdown export directory, default `data/obsidian/PocketBridge/`
- `PB_SNAPZY_WATCH_DIR`: Snapzy import watch directory, default `data/watch/snapzy/`
- `PB_PAIR_CODE`: fixed pair code override; otherwise generated on server start
- `PB_DEVICE_NAME`: displayed Mac/source device name
- `PB_MAX_UPLOAD_MB`: upload size limit in MB, default `100`; invalid or non-positive values fall back to `100`

## Runtime Data

Generated data is ignored by git:

```text
data/inbox/
data/metadata.json
data/obsidian/PocketBridge/
data/tmp/uploads/
data/watch/snapzy/
```

When following the start command above, `data/` is created at the repository root. Override with `PB_DATA_DIR=<absolute-or-relative-path>` if needed.

For the Snapzy MVP, export or copy screenshots into:

```text
data/watch/snapzy/
```

The server imports supported files automatically.

## Demo

Use:

```text
docs/DEMO_SCRIPT.md
```

Before a live run, verify the local demo chain with `cd server && npm run demo:smoke`.

Manual device-bound QA is tracked in:

```text
docs/MANUAL_QA_CHECKLIST.md
```

## Verification

Run these from the repository root.

Core server checks:

```bash
cd server
npm install
npm run build
npm test
npm run demo:smoke
npm run demo:ui-smoke
npm run demo:lan-check
```

Core Flutter checks:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter pub get
$HOME/development/flutter/bin/dart analyze
$HOME/development/flutter/bin/flutter test
$HOME/development/flutter/bin/flutter build apk --debug
```

GitHub Actions runs the same core gates in `.github/workflows/ci.yml`: server build/tests/smoke/UI smoke/LAN preflight plus Flutter analyze/test/debug APK. Successful branch runs upload the Android debug APK as the `pocketbridge-mobile-debug-apk` artifact. If local `flutter analyze` crashes from a non-ASCII workspace path, use `dart analyze` locally or run Flutter checks from an ASCII-only path.

Android real-device testing is intentionally deferred until a physical device is available.

## License

MIT. See `LICENSE`.
