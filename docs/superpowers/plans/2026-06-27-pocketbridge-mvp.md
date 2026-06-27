# PocketBridge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hackathon MVP loop: QR pairing, phone-to-Mac upload, Mac-to-phone sharing, live PocketInbox updates, Snapzy folder import, BLE status display, and Markdown knowledge export.

**Architecture:** A Node/Express server on the Mac is the single coordination point. Flutter and the Mac UI both talk to the same REST API and WebSocket event stream defined in `docs/SHARED_CONTRACT.md`.

**Tech Stack:** Node.js, Express, WebSocket, multipart upload, filesystem storage, Flutter, QR code scanning, local Markdown output.

---

## File Structure

Create this structure:

```text
server/
  package.json
  tsconfig.json
  src/
    index.ts
    config.ts
    types.ts
    auth.ts
    http/
      pairing.ts
      items.ts
      knowledge.ts
      ble.ts
    storage/
      item-store.ts
      file-store.ts
      knowledge-writer.ts
    websocket/
      hub.ts
    watchers/
      snapzy-watch.ts
  tests/
    item-store.test.ts
    knowledge-writer.test.ts

apps/
  mobile_flutter/
  mac_web/

data/
  inbox/
  obsidian/
  watch/
    snapzy/
```

## Task 1: Server Bootstrap

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/config.ts`
- Create: `server/src/index.ts`

- [ ] Create `server/package.json` with scripts `dev`, `build`, `test`, and dependencies `express`, `cors`, `multer`, `ws`, `chokidar`, `qrcode`, `nanoid`.
- [ ] Create TypeScript config targeting modern Node.
- [ ] Implement `config.ts` with defaults matching `docs/SHARED_CONTRACT.md`, including generated pair code when `PB_PAIR_CODE` is unset.
- [ ] Implement `/health`.
- [ ] Run `npm install` inside `server/`.
- [ ] Run `npm run dev`.
- [ ] Verify `curl http://localhost:3000/health` returns `{"ok":true,"service":"pocketbridge","version":1}`.

## Task 2: Item Storage

**Files:**
- Create: `server/src/types.ts`
- Create: `server/src/storage/item-store.ts`
- Create: `server/src/storage/file-store.ts`
- Create: `server/tests/item-store.test.ts`

- [ ] Define `PocketItem` exactly as in `docs/SHARED_CONTRACT.md`.
- [ ] Implement JSON metadata persistence at `data/metadata.json`.
- [ ] Implement item ID format `itm_<unixMs>_<8-char-lowercase-random>`.
- [ ] Implement `createTextItem`, `createFileItem`, `listItems`, `getItem`, and `updateItem`.
- [ ] Test that text items persist and reload from disk.
- [ ] Test that file items get date-based storage paths.
- [ ] Run `npm test`.

## Task 3: REST API

**Files:**
- Create: `server/src/auth.ts`
- Create: `server/src/http/pairing.ts`
- Create: `server/src/http/items.ts`
- Modify: `server/src/index.ts`

- [ ] Implement `X-PocketBridge-Pair-Code` middleware for `/api/*`.
- [ ] Implement `GET /api/pairing`.
- [ ] Implement `POST /api/items/text`.
- [ ] Implement `POST /api/items/upload`.
- [ ] Implement `GET /api/items`.
- [ ] Implement `GET /api/items/:id`.
- [ ] Implement `GET /api/items/:id/download`.
- [ ] Implement `POST /api/items/:id/share-to-mobile`.
- [ ] Verify every response shape against `docs/SHARED_CONTRACT.md`.

## Task 4: WebSocket Hub

**Files:**
- Create: `server/src/websocket/hub.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/http/items.ts`

- [ ] Accept connections at `/ws?pairCode=<code>&client=<mobile|mac>`.
- [ ] Reject invalid pair codes.
- [ ] Broadcast `pairing.connected` after connection.
- [ ] Broadcast `item.created` after text/file upload.
- [ ] Broadcast `item.shared` after share-to-mobile.
- [ ] Make Flutter and Mac UI refresh item lists on item events.

## Task 5: Knowledge Markdown Export

**Files:**
- Create: `server/src/storage/knowledge-writer.ts`
- Create: `server/src/http/knowledge.ts`
- Create: `server/tests/knowledge-writer.test.ts`
- Modify: `server/src/index.ts`

- [ ] Implement Markdown writer under `data/obsidian/PocketBridge/`.
- [ ] Include YAML frontmatter fields `id`, `title`, `origin`, `sourceDevice`, `createdAt`, and `tags`.
- [ ] Implement `POST /api/knowledge/:id`.
- [ ] Update item status to `saved_to_knowledge`.
- [ ] Broadcast `knowledge.saved`.
- [ ] Test Markdown output for a text item.

## Task 6: Snapzy Watch Folder

**Files:**
- Create: `server/src/watchers/snapzy-watch.ts`
- Modify: `server/src/index.ts`

- [ ] Watch `data/watch/snapzy/` with `chokidar`.
- [ ] When a new `.png`, `.jpg`, `.jpeg`, `.pdf`, or `.txt` appears, import it as an item.
- [ ] Use `origin: "snapzy"` and `sourceDevice: PB_DEVICE_NAME`.
- [ ] Broadcast `item.created`.
- [ ] Verify by copying an image into `data/watch/snapzy/`.

## Task 7: BLE Status API

**Files:**
- Create: `server/src/http/ble.ts`
- Modify: `server/src/index.ts`

- [ ] Implement in-memory BLE status with default `unknown`.
- [ ] Implement `GET /api/ble/status`.
- [ ] Implement `POST /api/ble/status`.
- [ ] Broadcast `ble.status` after updates.
- [ ] Verify Ding can update status using `curl`.

## Task 8: Mac Web UI

**Files:**
- Create under: `apps/mac_web/`

- [ ] Display the QR payload from `GET /api/pairing`.
- [ ] Connect to WebSocket as `client=mac`.
- [ ] Display PocketInbox items from `GET /api/items`.
- [ ] Add upload controls for Mac-to-phone sharing through `POST /api/items/upload` with `origin=mac` and `sharedToMobile=true`.
- [ ] Add a button that calls `POST /api/items/:id/share-to-mobile`.
- [ ] Add a button that calls `POST /api/knowledge/:id`.
- [ ] Display BLE status from `GET /api/ble/status` and WebSocket `ble.status`.

## Task 9: Flutter Mobile MVP

**Files:**
- Create under: `apps/mobile_flutter/`

- [ ] Scan the QR JSON payload.
- [ ] Persist `serverBaseUrl`, `wsUrl`, and `pairCode`.
- [ ] Upload text through `POST /api/items/text`.
- [ ] Upload image/file through `POST /api/items/upload`.
- [ ] Connect to WebSocket as `client=mobile`.
- [ ] List shared Mac items through `GET /api/items?sharedToMobile=true`.
- [ ] Download selected shared file through `GET /api/items/:id/download`.

## Task 10: Demo Verification

**Files:**
- Create: `docs/DEMO_SCRIPT.md`

- [ ] Write exact demo script with commands and click path.
- [ ] Record one fallback video after the first full successful run.
- [ ] Verify Mac hotspot/LAN IP flow.
- [ ] Verify phone upload works after restarting the server.
- [ ] Verify a Snapzy-exported screenshot appears in PocketInbox.
- [ ] Verify one item is saved to Markdown.
- [ ] Verify BLE status changes from `trusted` to `away`.

## Self-Review

- Spec coverage: the plan covers pairing, phone upload, Mac inbox, Mac-to-phone download, Snapzy folder import, BLE status, and Markdown knowledge output.
- Placeholder scan: no task depends on unspecified future API names; the shared API contract is fixed in `docs/SHARED_CONTRACT.md`.
- Type consistency: every task uses the same `PocketItem` fields, endpoint paths, event names, and pair-code auth scheme.
