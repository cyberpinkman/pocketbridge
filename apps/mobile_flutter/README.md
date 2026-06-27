# PocketBridge Mobile

Flutter Android-first MVP for the PocketBridge local server contract.

## Run

Run commands from the repository root unless a step says otherwise. If your Flutter SDK is already on `PATH`, `flutter` can replace `$HOME/development/flutter/bin/flutter`.

Start the Mac server first:

```bash
cd server
npm install
npm run dev
```

If the phone cannot reach the printed LAN URL, restart the server with:

```bash
PB_PUBLIC_HOST=<phone-reachable-mac-ip> npm run dev
```

Run on Android:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter pub get
$HOME/development/flutter/bin/flutter devices
$HOME/development/flutter/bin/flutter run -d <android-device-id>
```

Build a debug APK:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter build apk --debug
```

Or download the latest successful GitHub Actions artifact named `pocketbridge-mobile-debug-apk`; it contains `app-debug.apk`.

Verify without a physical phone:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter test
$HOME/development/flutter/bin/flutter build apk --debug
```

If `flutter analyze` crashes on this machine from the repository path, run `dart analyze` here or copy `apps/mobile_flutter/` to an ASCII-only temporary path and run `flutter analyze` there. This is a local tool/path issue, not an app contract issue.

The app supports QR pairing, manual server URL pairing, text upload, image/file upload with progress and local preview, recent upload history, failed upload retry when the selected payload can be replayed, WebSocket refresh, shared file listing, and shared file download/open.

Android package ID: `app.pocketbridge.mobile`.

The Android manifest grants camera and internet permissions and explicitly allows cleartext HTTP so the app can connect to the local Mac server at `http://<mac-lan-ip>:3000` during the MVP demo.
