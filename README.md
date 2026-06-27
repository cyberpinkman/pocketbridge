# PocketBridge

PocketBridge connects a phone and a Mac so the phone can act as an inspiration collector and portable key, while the Mac remains the user's personal knowledge base.

## MVP Demo Flow

1. Open PocketBridge Desktop on Mac.
2. Pair the Flutter mobile app by scanning a QR code.
3. Capture or annotate content on Mac through Snapzy, then place it in PocketInbox.
4. Send screenshots or documents from Mac to phone.
5. Upload images, documents, or text ideas from phone to Mac.
6. Receive and persist incoming items in PocketInbox in real time.
7. Write accepted content into `data/obsidian/PocketBridge` and an Obsidian-friendly vault pipeline.
8. Demonstrate BLEUnlock proximity state as a trusted or locked Mac signal.

## Repository Layout

```text
pocketbridge/
  apps/
    mobile_flutter/
    mac_desktop/
  server/
    src/
      routes/
      websocket/
      integrations/
      storage/
  integrations/
    snapzy/
    ble-capsule/
    bleunlock/
    knowledge-base/
  data/
    inbox/
    metadata.json
  docs/
```

## First Milestone

The first runnable slice is the local Node service:

- pair a phone session through QR token metadata
- upload files or text into `data/inbox`
- list inbox items
- send WebSocket notifications to connected clients
- expose integration placeholders for Snapzy, BLEUnlock, and the knowledge-base pipeline

## Useful Commands

```bash
npm install
npm run dev
npm run build
npm run env:check
npm run demo:smoke
npm run demo:contract
npm run demo:live
npm test
```

The server defaults to `http://localhost:3000`. Set `POCKETBRIDGE_PORT=4317` if you need the earlier local demo port.

`npm run demo:smoke` runs the core demo path against an in-process bridge: pairing, phone text/file upload, Mac-to-phone share, phone receipt acknowledgement, knowledge export, and trusted-state simulation.

`npm run demo:contract` rehearses the shared upstream contract path: `/api/pairing`, QR SVG, pair-code auth, `/api/items/*`, `/ws` envelopes, share-to-mobile, knowledge export, and BLE status.

`npm run demo:live` is the pre-demo rehearsal command. It runs the shared `/api` flow plus WebSocket pairing, phone text/file upload, Mac-to-phone share and download, knowledge export, Snapzy watch-folder auto-import, and PocketKey `trusted -> away -> locked` status changes.

`npm run env:check` reports local Node/npm/Flutter/Dart readiness. If Flutter or Dart are blocked, use the browser fallback for the live demo.

Upstream repository sync notes are tracked in `docs/upstream-sync.md`. The current server keeps the local demo routes and also exposes the upstream `/api` contract, pair-code auth, QR SVG, and `/ws` event envelopes.

The shared API source of truth from `cyberpinkman/pocketbridge` is mirrored in `docs/SHARED_CONTRACT.md`.

The local demo runbook is in `docs/DEMO_SCRIPT.md`.

In the current MVP, the Mac Web UI is served from the same bridge:

```bash
npm run build
npm run start
```

Then open `http://127.0.0.1:3000`.

On startup, the server prints the Mac UI URL, mobile fallback URL, Snapzy watch folder, and detected LAN candidates. For physical-phone demos, set `PB_PUBLIC_HOST` to the Mac IP if auto-detection picks the wrong interface:

```bash
PB_PUBLIC_HOST=192.168.1.50 npm run start
```

`PB_PUBLIC_HOST` may be a bare IP/host or a full URL. Bare hosts use the active server port.

Flutter fallback for hackathon demo:

```text
http://127.0.0.1:3000/mobile.html
```

On a physical phone, open `http://<Mac-LAN-IP>:3000/mobile.html`. This browser fallback uses the same `/api` and `/ws` shared contract as the Flutter app: upload text/files, refresh Mac-to-phone shared items, and download file-backed items.

Snapzy fallback:

```bash
mkdir -p data/watch/snapzy
# Export or copy Snapzy files into data/watch/snapzy
curl -X POST http://127.0.0.1:3000/snapzy/import
```

The Mac Web UI also has an `Import Snapzy folder` button. The bridge defaults to the upstream watch folder `data/watch/snapzy`, still imports the older local fallback `integrations/snapzy/inbox`, and accepts `PB_SNAPZY_WATCH_DIR=/path/to/folder` or the older `SNAPZY_EXPORT_DIR=/path/to/folder` as explicit overrides.

When the server is running, new files that appear in `data/watch/snapzy` are also imported automatically into PocketInbox.

Knowledge-base export:

```bash
curl -X POST http://127.0.0.1:3000/export/ITEM_ID \
  -H 'content-type: application/json' \
  -d '{"vaultDir":"./data/obsidian/PocketBridge"}'
```

File-backed items are copied into `data/obsidian/PocketBridge/assets/pocketbridge`, the Markdown note is written under `data/obsidian/PocketBridge/inbox`, and the item status is updated to `exported`.

Phone runtime URLs:

- iOS simulator: `http://127.0.0.1:3000`
- Android emulator: `http://10.0.2.2:3000`
- Physical phone: `http://<Mac-LAN-IP>:3000`

For physical-phone QR pairing, open the Mac Web UI through the Mac LAN address, for example `http://<Mac-LAN-IP>:3000`. The QR payload uses the current Web UI origin so the phone connects back to the Mac instead of scanning a `localhost` URL.

If the phone cannot scan the QR code, use `Copy payload` in the Mac Web UI and paste the JSON payload into the mobile app.
