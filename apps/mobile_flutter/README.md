# PocketBridge Mobile

Flutter Android-first MVP for the PocketBridge local server contract.

## Run

Start the Mac server first:

```bash
cd ../../server
npm run dev
```

If the phone cannot reach the printed LAN URL, restart the server with:

```bash
PB_PUBLIC_HOST=<phone-reachable-mac-ip> npm run dev
```

Run on Android:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter run -d <android-device-id>
```

Build a debug APK:

```bash
$HOME/development/flutter/bin/flutter build apk --debug
```

The app supports QR pairing, manual server URL pairing, text upload, image/file upload with progress and local preview, recent upload history, failed upload retry when the selected payload can be replayed, WebSocket refresh, shared file listing, and shared file download/open.
