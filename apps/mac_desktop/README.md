# PocketBridge Mac Desktop

Mac desktop scope:

- show pairing QR code
- display PocketInbox in real time
- send selected item to phone
- export selected item into knowledge base
- show BLE trusted/locked state

The fallback Web UI uses the shared upstream contract:

- `GET /api/pairing` plus `/api/pairing/qr.svg?pairCode=...` for QR pairing
- `X-PocketBridge-Pair-Code` on authenticated `/api` calls
- `POST /api/items/text` and `POST /api/items/upload` for Mac-origin captures
- `POST /api/items/:id/share-to-mobile` for phone handoff
- `POST /api/knowledge/:id` for knowledge export
- `GET/POST /api/ble/status` for trusted-state demo controls
- `/ws?pairCode=<pairCode>&client=mac` for real-time updates

MVP fallback:

- Use a local Web UI served by the Node bridge if SwiftUI setup would slow the hackathon demo.
