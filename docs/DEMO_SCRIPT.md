# PocketBridge Demo Script

This script is the live hackathon path for the integrated MVP.

## Preflight

From the repository root:

```bash
npm install
npm test
npm run demo:live
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run demo:lan-check
```

If Flutter or Dart is unavailable locally, use the browser fallback for the live phone role. The fallback URL is:

```text
http://<Mac-LAN-IP>:3000/mobile.html
```

## Start

```bash
PB_PUBLIC_HOST=<Mac-LAN-IP> npm run dev
```

Open the Mac UI at:

```text
http://<Mac-LAN-IP>:3000/
```

The page should show the pairing QR code, pair payload, PocketInbox, Snapzy import action, BLE controls, and event log.

## Pair Phone

Use one of these paths:

1. Flutter app: scan the QR code or paste the pairing payload.
2. Browser fallback: open `http://<Mac-LAN-IP>:3000/mobile.html`.

Confirm the phone connects over `/ws?pairCode=<code>&client=mobile`.

## Phone To Mac

1. Send a text note from Flutter or browser fallback.
2. Upload an image or document from Flutter or browser fallback.
3. Confirm both appear in the Mac PocketInbox in real time.
4. For Flutter, show upload progress and local upload history.

## Mac To Phone

1. In the Mac UI, select an item.
2. Click the action that shares the item to mobile.
3. Refresh the phone shared list.
4. Download the file-backed item on Flutter and show download progress.

## Snapzy

Copy or export a screenshot into:

```text
data/watch/snapzy
```

Use the Mac UI import action or wait for the watch-folder import. Confirm the item appears as a Snapzy-origin capture.

## Knowledge Export

1. Select an inbox item on Mac.
2. Export it to the knowledge base.
3. Confirm the item shows a path under `data/obsidian/PocketBridge`.

## BLE Demo

Use the Mac UI BLE controls in this order:

```text
trusted -> away -> locked
```

Confirm the status changes appear in the UI and event stream.

## Fallback Decision

If physical-phone LAN is unstable, keep the Mac UI and browser fallback as the demo path. If local Flutter tooling is unavailable, use the CI APK artifact or browser fallback.
