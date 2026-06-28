# Upstream Sync Notes

Synced from `https://github.com/cyberpinkman/pocketbridge` on 2026-06-27 using the GitHub connector because local `git ls-remote` failed with `LibreSSL SSL_connect: SSL_ERROR_SYSCALL` through the local SOCKS proxy.

## Remote Refs

- Repository: `cyberpinkman/pocketbridge`
- Default branch: `main`
- Additional branch: `codex/mobile-flutter-scaffold`
- `main` base commit seen through compare API: `34a706579b69dc55bff75de870d3bd6473c615c3`
- `codex/mobile-flutter-scaffold` is currently at `3c44016ed2c1a7615b8605119d782a60f7581726`
- Latest synced branch change seen on 2026-06-27: `Add fallback recording and serialize item updates`

## Remote Files Read

- `README.md` on `main`, sha `60453d30d4678a11af227d627ac8413f1bab3225`
- `docs/SHARED_CONTRACT.md` on `main`, sha `d449636909c5602d4a1eff58c34eaba1765b2815`
- `docs/PINKMAN_PRD.md` on `main`, sha `f0b16fe1714434c3d94c403f1f89046d5d5eef56`
- `docs/DEMO_SCRIPT.md` on `main`, sha `cbe5a5d0b11da909f3a1a821ff8a18774ce85163`
- `docs/ENVIRONMENT_SETUP.md` on `main`, sha `8abb7418d8363a68fc0ca9636a664287105bed02`
- `apps/mobile_flutter/pubspec.yaml` on `codex/mobile-flutter-scaffold`, sha `a676122de8e1570ec990aa8f39aefceea8a5b9c5`
- `apps/mobile_flutter/lib/pocket_api.dart` on `codex/mobile-flutter-scaffold`, sha `a8467fe1ca17eda789cc06e83c7637f4aed68107`
- `apps/mobile_flutter/lib/pocket_models.dart` on `codex/mobile-flutter-scaffold`, sha `0859cc17e94b248d90ec0c3010ba0964c014281c`

## Upstream Contract Highlights

Remote `docs/SHARED_CONTRACT.md` is currently the upstream source of truth between Pinkman and Ding.

Non-negotiable upstream decisions:

- Server runs on the Mac at `http://<mac-lan-ip>:3000`.
- WebSocket endpoint is `ws://<mac-lan-ip>:3000/ws`.
- All API paths are prefixed with `/api`.
- Pairing QR contains JSON.
- MVP auth uses ephemeral 6-digit `pairCode` in `X-PocketBridge-Pair-Code`.
- `GET /health`, `GET /api/pairing`, and `GET /api/pairing/qr.svg` do not require auth.
- Files are stored under `data/inbox/`.
- Knowledge output is Markdown under `data/obsidian/PocketBridge/`.
- Snapzy MVP imports files from `data/watch/snapzy/`.
- BLEUnlock MVP is a state API.

Canonical upstream endpoints:

- `GET /health`
- `GET /api/pairing`
- `GET /api/pairing/qr.svg`
- `POST /api/items/text`
- `POST /api/items/upload`
- `GET /api/items`
- `GET /api/items/:id`
- `GET /api/items/:id/download`
- `POST /api/items/:id/share-to-mobile`
- `POST /api/knowledge/:id`
- `GET /api/ble/status`
- `POST /api/ble/status`
- `ws://<mac-lan-ip>:3000/ws?pairCode=<pairCode>&client=mobile`

Canonical upstream item fields:

- `id`
- `kind`: `text`, `image`, `file`, or `screenshot`
- `title`
- `origin`: `mobile`, `mac`, or `snapzy`
- `sourceDevice`
- `mimeType`
- `sizeBytes`
- `originalFilename`
- `storageRelPath`
- `text`
- `tags`
- `sharedToMobile`
- `status`: `inbox` or `saved_to_knowledge`
- `createdAt`
- `updatedAt`
- `downloadUrl`
- `knowledgePath`

## Local Divergence To Reconcile

Current local MVP remains runnable, but it differs from upstream:

- Local server now defaults to upstream port `3000`; `POCKETBRIDGE_PORT=4317` remains supported for earlier local demos.
- Local pairing uses `POST /pairing/session` and `POST /pairing/confirm`; upstream uses `GET /api/pairing` plus pair-code auth.
- Local uploads use `POST /upload`; upstream splits text and file into `/api/items/text` and `/api/items/upload`.
- Local item fields use `source`, `filePath`, `size`, `originalName`, and `knowledgeTarget`; upstream uses `origin`, `storageRelPath`, `sizeBytes`, `originalFilename`, and `knowledgePath`.
- Local Mac-to-phone share queue uses `/share`; upstream uses `sharedToMobile` on items and `POST /api/items/:id/share-to-mobile`.
- Local legacy knowledge export route `/export/:itemId` remains available, while the upstream `/api/knowledge/:id` route and default `data/obsidian/PocketBridge/` vault are supported.
- Local BLE simulation uses `/trust/simulate`; upstream uses `/api/ble/status`.
- Local WebSocket is `/events` with direct event payloads; upstream is `/ws` with an event envelope containing `type`, `version`, `eventId`, `sentAt`, and `data`.

## Compatibility Approach

Keep the compatibility layer alongside the current demo endpoints:

1. Keep current `/pairing`, `/upload`, `/share`, `/export`, `/trust`, and `/events` routes so the current demo remains green.
2. Expose upstream-compatible `/api/*` aliases backed by the same metadata store.
3. Validate pair codes on upstream routes while allowing no-auth local legacy routes during the hackathon.
4. Emit upstream event envelopes on `/ws` while keeping `/events`.
5. Verify Flutter compile/run on a configured Flutter workstation because this machine currently lacks `flutter` and `dart`.

## Local Compatibility Progress

- Done: `GET /health` returns the upstream `ok`, `service`, and `version` fields while preserving the local trust-state payload for the Mac UI.
- Done: `GET /api/pairing` returns the upstream pairing payload shape and persists its 6-digit `pairCode` as a local pairing session token.
- Done: `POST /api/items/text` validates `X-PocketBridge-Pair-Code`, creates a local text item, and returns the upstream item shape.
- Done: `GET /api/items` validates `X-PocketBridge-Pair-Code` and returns upstream-shaped items with optional `origin` and `sharedToMobile` filters.
- Done: `POST /api/items/upload` validates `X-PocketBridge-Pair-Code`, stores a multipart file in `data/inbox`, and returns the upstream item shape.
- Done: `GET /api/items/:id` validates `X-PocketBridge-Pair-Code` and returns one upstream-shaped item.
- Done: `GET /api/items/:id/download` validates `X-PocketBridge-Pair-Code` and streams file-backed inbox items from the existing safe download boundary.
- Done: `POST /api/items/:id/share-to-mobile` validates `X-PocketBridge-Pair-Code`, marks an item visible to mobile, and queues a legacy phone share.
- Done: `POST /api/knowledge/:id` validates `X-PocketBridge-Pair-Code`, exports through the local Markdown pipeline, and returns `saved_to_knowledge` plus `knowledgePath`.
- Done: `GET /api/ble/status` and `POST /api/ble/status` validate `X-PocketBridge-Pair-Code` and expose the upstream BLE status shape while keeping the local trust-state bridge.
- Done: `GET /api/pairing/qr.svg` returns a no-auth SVG QR code for the upstream pairing payload and stores its generated pair code as a local pairing session.
- Done: `/ws?pairCode=<pairCode>&client=mobile` accepts paired clients and emits upstream event envelopes while legacy `/events` still emits direct local events.
- Done: local Flutter source now includes `pocket_api.dart` and `pocket_models.dart`, posts text/files through `/api/items/*`, lists shared items through `GET /api/items?sharedToMobile=true`, and connects to `/ws` with the pair code.
- Done: local Mac Web UI now creates upstream pairings, uses the pair code header for `/api` calls, renders QR SVGs with the same pair code as the copied payload, lists shared mobile items through `/api/items?sharedToMobile=true`, and listens on `/ws`.
- Done: `npm run demo:contract` runs an in-process shared-contract rehearsal covering QR SVG, pair-code auth, `/api/items/*`, `/ws` envelopes, share-to-mobile, knowledge export, and BLE status.
- Done: `POST /snapzy/import` now defaults to the upstream `data/watch/snapzy` folder while preserving the earlier `integrations/snapzy/inbox` fallback.
- Done: config now accepts upstream `PORT`, `PB_DATA_DIR`, `PB_SNAPZY_WATCH_DIR`, `PB_OBSIDIAN_DIR`, and `PB_MAX_UPLOAD_MB` defaults while preserving the older `POCKETBRIDGE_PORT` and `SNAPZY_EXPORT_DIR` overrides.
- Done: `GET /api/pairing` and `/api/pairing/qr.svg` reuse a valid `PB_PAIR_CODE` as the shared 6-digit pairing code instead of creating duplicate sessions.
- Done: oversized `/api/items/upload` requests now return the upstream structured `UPLOAD_TOO_LARGE` error with HTTP 413.
- Done: `POST /api/knowledge/:id` now writes upstream Markdown frontmatter fields (`title`, `origin`, `sourceDevice`, `tags`) and includes the optional request `note`.
- Done: `POST /api/items/upload` now stores files in the upstream `data/inbox/YYYY-MM-DD/<itemId>/original` layout and returns matching `storageRelPath`.
- Done: `POST /snapzy/import` now creates upstream-style `itm_*` Snapzy items and stores imported files in the same `data/inbox/YYYY-MM-DD/<itemId>/original` layout.
- Done: `GET /api/items` now applies the upstream `limit` query parameter with a default of `100`.
- Done: `POST /api/items/upload` now requires upstream `origin` and `sourceDevice` fields and returns structured `BAD_REQUEST` errors when they are missing or invalid.
- Done: `POST /api/items/text` now also requires upstream `origin` and `sourceDevice` fields and returns structured `BAD_REQUEST` errors when they are missing or invalid.
- Done: synced missing files from `origin/codex/mobile-flutter-scaffold`, including Flutter Android platform files, Flutter tests, lockfile, `LICENSE`, `docs/PINKMAN_PRD.md`, and `docs/ENVIRONMENT_SETUP.md`, while keeping the local richer Node/Mac demo implementation.
- Done: `docs/SHARED_CONTRACT.md` now mirrors the upstream shared contract locally.
- Done: the running server now watches `data/watch/snapzy` and automatically imports new Snapzy files into PocketInbox, while the manual `/snapzy/import` fallback remains available.
- Done: local Mac Web now serves `/mobile.html` as a browser phone fallback that uses the upstream `/api` and `/ws` contract for text/file upload, shared-item refresh, and downloads.
- Done: startup logs now print Mac UI, mobile fallback, Snapzy watch folder, and LAN URL candidates; `PB_PUBLIC_HOST` is centralized in config and bare IP/host values include the active server port in pairing payloads.
- Done: Mac Web PocketKey controls now cover the upstream BLE demo states `trusted`, `away`, and `locked`.
- Done: `npm run demo:live` now rehearses the live demo path across upstream pairing, WebSocket events, phone upload, Mac-to-phone share/download, knowledge export, Snapzy auto-import, and PocketKey `trusted -> away -> locked`.
- Done: `docs/DEMO_SCRIPT.md` now documents the local live-demo runbook, including rehearsal command, mobile browser fallback, Snapzy fallback, PocketKey states, and Flutter CLI caveat.
- Done: `npm run env:check` now reports Node/npm/Flutter/Dart readiness and explicitly points blocked Flutter demos to the browser fallback.
- Done: Flutter source now persists the last successful pairing with `shared_preferences`, restores it on app launch, and exposes a forget-pairing action for demo resets.
- Done: Flutter source now maps the PRD mobile UX into bottom navigation screens for Pairing, Capture, and Shared From Mac.
- Done: Flutter item tiles now surface title, type, origin, source device, and created time for PocketInbox and Shared From Mac lists.
- Done: alternate upstream server scaffold files are preserved under `server/upstream_reference/` instead of active `server/src/`, preventing the local richer route-based server and upstream scaffold from being compiled together.
- Done: BLEUnlock can now call `integrations/bleunlock/pocketkey-status.sh` from event hooks to push `trusted`, `away`, `locked`, or `unknown` into `/api/ble/status`.
- Done: BLE Capsule text proof can now call `integrations/ble-capsule/capsule-text.sh` to land a short text/link payload in PocketInbox through `POST /api/items/text`.
- Done: knowledge export Markdown now includes deterministic `## Summary` and `## Content` sections as a local placeholder before any future AI summary pipeline.
- Done: refreshed local refs from `cyberpinkman/pocketbridge` on 2026-06-27; `origin/main` remains `34a706579b69dc55bff75de870d3bd6473c615c3`, and `origin/codex/mobile-flutter-scaffold` is available locally.
- Done: aligned the repo against `/Users/zerone/Documents/pocketbridge-teammate-brief.md` by documenting the current demo promise in `docs/DEMO_SCRIPT.md`.
- Done: added the teammate-brief MCP/API showcase endpoints `GET /api/inbox` and `GET /api/search?q=...` as pair-code-protected read views over the existing PocketInbox metadata.
- Done: refreshed `origin/codex/mobile-flutter-scaffold` to `3c44016ed2c1a7615b8605119d782a60f7581726` and mapped its serialized item-update fix into the active `metadataStore` implementation.
- Done: metadata mutations are now queued so concurrent PocketInbox writes cannot overwrite each other or collide on temporary metadata files.
- Remaining: Flutter compile/run and physical-phone QA still need a configured Flutter workstation; local `flutter` and `dart` commands are unavailable on this machine.
- Remaining: full BLE GATT transport and chunking protocol are still future-facing beyond the current BLE Capsule text bridge.
