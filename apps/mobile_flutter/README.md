# PocketBridge Mobile Flutter

This folder contains the MVP Flutter source for the phone side of PocketBridge.

## Current Scope

- Pair with a Mac bridge by scanning the upstream JSON QR payload or fetching `/api/pairing` from a bridge URL.
- Persist the last successful pairing locally and allow forgetting it from the app bar.
- Upload inspiration text to Mac PocketInbox through `POST /api/items/text`.
- Pick an image or document and upload it through `POST /api/items/upload`.
- Refresh PocketInbox items from `GET /api/items`.
- Listen for upstream event envelopes on `/ws?pairCode=<pairCode>&client=mobile`.
- Review Mac-to-phone items from `GET /api/items?sharedToMobile=true`.
- Copy or download file-backed shared items through their `downloadUrl`.

The first MVP uses `mobile_scanner` for QR pairing and keeps pasted QR payloads or direct bridge URL pairing as fallbacks. File and image picking uses `file_picker` so the phone can demonstrate the required document/image upload path.

The mobile UI is organized with bottom navigation for the PRD screens:

- `Pairing`: QR scan, manual bridge URL, device name, connection status.
- `Capture`: text capture, file/image picking, recent PocketInbox items with type, origin, device, and created time.
- `Shared`: Mac-to-phone shared items with type, origin, device, created time, and copy/download actions.

## Run

Install Flutter, then run:

```bash
cd apps/mobile_flutter
flutter pub get
flutter run
```

## Bridge URL Notes

Use the right URL for your runtime:

- iOS simulator on the same Mac: `http://127.0.0.1:3000`
- Android emulator: `http://10.0.2.2:3000`
- Physical phone: `http://<Mac-LAN-IP>:3000`

The Mac bridge is started from the repo root:

```bash
npm run build
npm run start
```

If testing a physical phone, keep Mac and phone on the same network and make sure the bridge is listening on `0.0.0.0`. Open the Mac Web UI through `http://<Mac-LAN-IP>:3000` before creating the QR code so the QR payload contains a phone-reachable bridge URL.

## Pairing

Click `Create QR pairing` in the Mac Web UI, tap `Scan QR` in the mobile app, scan the QR code, then tap `Pair`.

If camera access is unavailable, click `Copy payload` in the Mac Web UI, paste the full JSON payload into the mobile app, then tap `Pair`. You can also enter a bridge URL and tap `Pair`; the app will fetch `/api/pairing`.

## Upload Demo

After pairing:

1. Type a note in `Capture Idea`, then tap `Upload text`.
2. Tap `Choose`, select an image or document, then tap `Upload file`.
3. Refresh the Mac Web UI and confirm both items appear in PocketInbox.
4. Mark a Mac item shared to mobile, then use the mobile `Shared to Phone` panel to copy or download it.
