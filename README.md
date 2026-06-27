# PocketBridge

PocketBridge connects a phone and a Mac over the local network for fast capture, file transfer, PocketInbox review, and local knowledge-base export.

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

If the phone cannot open the printed URL, restart with the Mac IP that the phone can reach:

```bash
PB_PUBLIC_HOST=<phone-reachable-mac-ip> npm run dev
```

## Mobile App

The Android-first Flutter MVP lives in:

```text
apps/mobile_flutter/
```

Run it after the Mac server is up:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter run -d <android-device-id>
```

If no Android device is available, use the browser fallback printed by the server:

```text
http://<mac-lan-ip>:3000/mobile.html
```

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

## Runtime Data

Generated data is ignored by git:

```text
data/inbox/
data/metadata.json
data/obsidian/PocketBridge/
data/watch/snapzy/
```

When following the start command above, `data/` is created under `server/` because the server process is started from that directory. Override with `PB_DATA_DIR=<absolute-or-relative-path>` if needed.

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

## License

MIT. See `LICENSE`.
