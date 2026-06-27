# PocketBridge Two-Day MVP Plan

## Day 1: Local Bridge and Inbox

- Create the Node local bridge.
- Implement QR pairing token creation and confirmation.
- Implement upload from mobile or curl.
- Persist files and metadata into PocketInbox.
- Add WebSocket notifications for `item.created` and `pairing.confirmed`.
- Build a minimal Mac UI fallback if native SwiftUI is not ready.

## Day 2: Demo Integrations

- Create a Flutter screen for scanning QR and uploading text/image/file.
- Wire Snapzy output into PocketInbox by manual share or watched folder.
- Add Mac-to-phone share queue.
- Add knowledge-base export into Markdown and asset folders.
- Add BLEUnlock trusted-state adapter or fallback simulator.
- Rehearse full demo path and prepare failure fallback for each external integration.

## Demo Acceptance Checklist

- Phone can pair with Mac using a QR payload.
- Phone can upload at least one image and one text note.
- Mac inbox updates without manual refresh.
- Mac can register one item as shared to phone.
- Phone can refresh the Mac-to-phone share queue and copy a download URL for file-backed items.
- Snapzy-produced image appears in PocketInbox through `Import Snapzy folder` from `data/watch/snapzy`.
- Snapzy-produced image appears in PocketInbox automatically when saved into `data/watch/snapzy` while the server is running.
- One inbox item exports as Markdown plus asset reference.
- BLEUnlock or simulated proximity changes trusted state in the UI.
- Mac UI can explicitly demo PocketKey `trusted`, `away`, and `locked` states through the BLE status API.

## Current MVP Notes

- Mac UI fallback is served by the local bridge at `http://127.0.0.1:3000` by default; set `POCKETBRIDGE_PORT=4317` for the earlier local demo port.
- Startup logs now print the Mac UI URL, browser phone fallback URL, Snapzy watch folder, and LAN URL candidates for faster physical-phone setup.
- `PB_PUBLIC_HOST=<Mac-LAN-IP>` makes QR/API pairing payloads use the phone-reachable Mac address; bare hosts automatically include the active server port.
- `npm run env:check` reports local Node/npm/Flutter/Dart readiness before demo rehearsal.
- Mobile Flutter source exists under `apps/mobile_flutter`; Flutter analyze/test/APK build have been verified from an ASCII-only workspace copy because the current repository path can crash the Dart analysis server.
- Browser phone fallback is served at `/mobile.html` and uses the same `/api` plus `/ws` contract for upload, shared-item refresh, and download while real-phone Flutter QA remains pending.
- The phone-side app can scan the upstream Mac QR payload through `mobile_scanner`, paste the JSON payload, or fetch `/api/pairing` from a bridge URL as fallback pairing paths.
- The phone-side app persists the last successful pairing through `shared_preferences` and includes a forget-pairing action for demo resets.
- The phone-side app now uses bottom navigation for the PRD screen model: Pairing, Capture, and Shared.
- The phone-side item lists show each item's title, type, origin, source device, and created time, matching the Shared From Mac acceptance criteria.
- The Mac Web UI creates upstream pairing payloads through `GET /api/pairing`, displays `/api/pairing/qr.svg?pairCode=...`, and uses the same pair code for its own `/api` calls.
- The phone-side app includes file/image picking through `file_picker` and uploads selected files to `POST /api/items/upload` with `X-PocketBridge-Pair-Code`.
- The phone-side app listens to `/ws?pairCode=<pairCode>&client=mobile` and refreshes item lists on upstream item events.
- The bridge exposes `GET /api/items?sharedToMobile=true` so the phone can poll Mac-to-phone items.
- The browser phone fallback also exposes this Mac-to-phone path through `http://<Mac-LAN-IP>:3000/mobile.html`.
- The Mac Web UI shows a Phone Outbox panel from `GET /api/items?sharedToMobile=true`.
- File-backed shared items include `downloadUrl`, which points to `GET /api/items/:itemId/download`.
- `POST /api/knowledge/:id` writes Markdown into the target vault, copies file-backed assets into `assets/pocketbridge`, and returns `saved_to_knowledge`.
- `npm run demo:smoke` rehearses the bridge-side demo path in one command: pairing, upload, share, receipt acknowledgement, export, and trusted-state simulation.
- `npm run demo:contract` rehearses the shared upstream path in one command: QR SVG, pair-code auth, `/api/items/*`, `/ws` envelope delivery, share-to-mobile, knowledge export, and BLE status.
- `npm run demo:live` rehearses the full live-demo path in one command: upstream pairing, WebSocket events, phone upload, Mac-to-phone share and download, knowledge export, Snapzy auto-import, and PocketKey `trusted -> away -> locked`.
- `docs/upstream-sync.md` records the current `cyberpinkman/pocketbridge` contract and branch differences; the server now keeps the runnable demo routes while exposing the upstream-compatible `/api` and `/ws` surfaces.
- The server watches the upstream Snapzy folder and automatically imports new files into PocketInbox while preserving the manual `Import Snapzy folder` fallback.
