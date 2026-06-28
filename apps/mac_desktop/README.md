# PocketBridge Mac Desktop

PocketBridge now has a native SwiftUI Mac client at `apps/mac_desktop/native`.

Run it from the repository root:

```bash
open ./PocketBridge.command
```

or:

```bash
npm run mac:client
```

For live demo, `~/Desktop/PocketBridge.command` points to the same launcher.

Build the release binary:

```bash
npm run mac:client:build
```

Native client scope:

- show pairing QR code
- display PocketInbox in real time
- send selected item to phone
- send selected file-backed item through the BLE agent
- export selected item into knowledge base
- show BLE trusted/locked state
- start and monitor the local Node bridge
- start and monitor the real BLE agent
- show real PocketKey RSSI, state, and thresholds from the agent `/status` endpoint
- upload files and quick text captures without opening the browser
- lock the Mac through the BLE agent from the same client

The native client uses the shared upstream contract:

- `GET /api/pairing` plus `/api/pairing/qr.svg?pairCode=...` for QR pairing
- `X-PocketBridge-Pair-Code` on authenticated `/api` calls
- `POST /api/items/text` and `POST /api/items/upload` for Mac-origin captures
- `POST /api/items/:id/share-to-mobile` for phone handoff
- `POST /api/knowledge/:id` for knowledge export
- `GET/POST /api/ble/status` for trusted-state demo controls
- `/ws?pairCode=<pairCode>&client=mac` for real-time updates
- `GET /status` on the BLE agent for native PocketKey status

Web fallback:

- The local Web UI in `apps/mac_desktop/web` remains available through the Node bridge.
- Use it only as a fallback; the demo should use the native client so capabilities are not split across browser and terminal.
