# PocketBridge Shared Contract

This document is the source of truth between Pinkman and Ding during the hackathon.

## Non-Negotiable Decisions

- Server runs on the Mac at `http://<mac-lan-ip>:3000`.
- WebSocket endpoint is `ws://<mac-lan-ip>:3000/ws`.
- All API paths are prefixed with `/api`.
- Pairing uses a QR code containing JSON, not a custom binary format.
- Authentication for MVP is an ephemeral 6-digit `pairCode` passed in `X-PocketBridge-Pair-Code`.
- `GET /health`, `GET /api/pairing`, and `GET /api/pairing/qr.svg` do not require auth.
- All transferred files are stored locally under `data/inbox/`.
- Knowledge output is Markdown under `data/obsidian/PocketBridge/`.
- Snapzy integration is folder-based for MVP: screenshots saved into `data/watch/snapzy/` are imported into the inbox.
- BLEUnlock integration is state-based for MVP: Ding can update trusted/locked status through an API endpoint.

## Local Environment

Default values:

```env
PORT=3000
PB_DATA_DIR=./data
PB_PUBLIC_HOST=<optional phone-reachable Mac IP>
PB_PAIR_CODE=<optional; generated on server start if unset>
PB_DEVICE_NAME=Pinkmans-Mac
PB_OBSIDIAN_DIR=./data/obsidian/PocketBridge
PB_SNAPZY_WATCH_DIR=./data/watch/snapzy
PB_MAX_UPLOAD_MB=100
```

Invalid or non-positive `PB_MAX_UPLOAD_MB` values fall back to `100`.

Runtime directories:

```text
data/
  inbox/
    2026-06-27/
      itm_<timestamp>_<random>/
        original
        metadata.json
  metadata.json
  obsidian/
    PocketBridge/
  tmp/
    uploads/
  watch/
    snapzy/
```

## QR Pairing Payload

The Mac UI displays this JSON as a QR code. Values below are illustrative; use the values printed by the running server.

```json
{
  "protocol": "pocketbridge",
  "version": 1,
  "serverBaseUrl": "http://192.168.1.23:3000",
  "wsUrl": "ws://192.168.1.23:3000/ws",
  "pairCode": "123456",
  "deviceName": "Pinkmans-Mac",
  "expiresAt": "2026-06-27T12:30:00.000Z",
  "capabilities": ["upload", "download", "websocket", "knowledge", "ble-status"]
}
```

Flutter must store `serverBaseUrl`, `wsUrl`, and `pairCode` after scanning.

## Required Headers

All API requests except `/health`, `/api/pairing`, and `/api/pairing/qr.svg` must include:

```http
X-PocketBridge-Pair-Code: <pairCode from QR payload>
```

JSON requests must include:

```http
Content-Type: application/json
```

File upload requests use `multipart/form-data`.

## Canonical Item Model

```ts
type PocketItemKind = "text" | "image" | "file" | "screenshot";
type PocketItemOrigin = "mobile" | "mac" | "snapzy";
type PocketItemStatus = "inbox" | "saved_to_knowledge";

type PocketItem = {
  id: string;
  kind: PocketItemKind;
  title: string;
  origin: PocketItemOrigin;
  sourceDevice: string;
  mimeType?: string;
  sizeBytes?: number;
  originalFilename?: string;
  storageRelPath?: string;
  text?: string;
  tags: string[];
  sharedToMobile: boolean;
  status: PocketItemStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  downloadUrl?: string;
  knowledgePath?: string;
};
```

ID format:

```text
itm_<unixMs>_<8-char-lowercase-random>
```

Example:

```text
itm_1782547200000_a9f4c21b
```

## HTTP API

### `GET /health`

No auth required.

Response:

```json
{
  "ok": true,
  "service": "pocketbridge",
  "version": 1
}
```

### `GET /api/pairing`

Returns the same payload encoded in the Mac QR code.

Response:

```json
{
  "protocol": "pocketbridge",
  "version": 1,
  "serverBaseUrl": "http://192.168.1.23:3000",
  "wsUrl": "ws://192.168.1.23:3000/ws",
  "pairCode": "123456",
  "deviceName": "Pinkmans-Mac",
  "expiresAt": "2026-06-27T12:30:00.000Z",
  "capabilities": ["upload", "download", "websocket", "knowledge", "ble-status"]
}
```

### `GET /api/pairing/qr.svg`

Returns an SVG QR code for the pairing payload.

### `POST /api/items/text`

Creates a text item from Flutter or Mac UI.

Request:

```json
{
  "title": "Idea from phone",
  "text": "Turn screenshots into a personal knowledge stream.",
  "origin": "mobile",
  "sourceDevice": "Pinkmans-iPhone",
  "tags": ["idea"]
}
```

Required fields:

- `text`: required non-empty string.
- `origin`: required, one of `mobile`, `mac`, `snapzy`.
- `sourceDevice`: required non-empty string.

Response:

```json
{
  "item": {
    "id": "itm_1782547200000_a9f4c21b",
    "kind": "text",
    "title": "Idea from phone",
    "origin": "mobile",
    "sourceDevice": "Pinkmans-iPhone",
    "text": "Turn screenshots into a personal knowledge stream.",
    "tags": ["idea"],
    "sharedToMobile": false,
    "status": "inbox",
    "createdAt": "2026-06-27T12:00:00.000Z",
    "updatedAt": "2026-06-27T12:00:00.000Z"
  }
}
```

### `POST /api/items/upload`

Creates a file/image item from Flutter or Mac UI.

Multipart fields:

- `file`: required file payload.
- `origin`: required, one of `mobile`, `mac`, `snapzy`.
- `sourceDevice`: required string.
- `title`: optional string.
- `tags`: optional JSON string array, for example `["screenshot","receipt"]`.
- `sharedToMobile`: optional boolean string, `true` or `false`.

Response:

```json
{
  "item": {
    "id": "itm_1782547200000_a9f4c21b",
    "kind": "image",
    "title": "Screenshot 2026-06-27 20.00.00.png",
    "origin": "mobile",
    "sourceDevice": "Pinkmans-iPhone",
    "mimeType": "image/png",
    "sizeBytes": 481223,
    "originalFilename": "Screenshot 2026-06-27 20.00.00.png",
    "storageRelPath": "inbox/2026-06-27/itm_1782547200000_a9f4c21b/original",
    "tags": [],
    "sharedToMobile": false,
    "status": "inbox",
    "createdAt": "2026-06-27T12:00:00.000Z",
    "updatedAt": "2026-06-27T12:00:00.000Z",
    "downloadUrl": "/api/items/itm_1782547200000_a9f4c21b/download"
  }
}
```

### `GET /api/items`

Query parameters:

- `origin`: optional `mobile`, `mac`, or `snapzy`.
- `sharedToMobile`: optional `true` or `false`.
- `includeArchived`: optional `true` or `false`, default `false`.
- `limit`: optional integer, default `100`.

Response:

```json
{
  "items": []
}
```

### `GET /api/items/search`

Searches title, text, tags, origin, kind, source device, MIME type, filename, storage path, and id.

Query parameters:

- `q`: required search string. Multiple terms are AND-matched.
- `origin`: optional `mobile`, `mac`, or `snapzy`.
- `sharedToMobile`: optional `true` or `false`.
- `includeArchived`: optional `true` or `false`, default `false`.
- `limit`: optional integer, default `100`.

Response:

```json
{
  "items": []
}
```

### `GET /api/items/:id`

Response:

```json
{
  "item": {
    "id": "itm_1782547200000_a9f4c21b",
    "kind": "text",
    "title": "Idea from phone",
    "origin": "mobile",
    "sourceDevice": "Pinkmans-iPhone",
    "text": "Turn screenshots into a personal knowledge stream.",
    "tags": ["idea"],
    "sharedToMobile": false,
    "status": "inbox",
    "createdAt": "2026-06-27T12:00:00.000Z",
    "updatedAt": "2026-06-27T12:00:00.000Z"
  }
}
```

### `GET /api/items/:id/download`

Returns the original file bytes.

Rules:

- Text items return `404` because they have no file.
- File, image, and screenshot items return `Content-Disposition: attachment`.

### `POST /api/items/:id/share-to-mobile`

Marks an item as visible to the paired mobile app.

Request:

```json
{
  "sharedToMobile": true
}
```

Response:

```json
{
  "item": {
    "id": "itm_1782547200000_a9f4c21b",
    "sharedToMobile": true
  }
}
```

Flutter downloads Mac-to-phone files by calling:

```http
GET /api/items?sharedToMobile=true
GET /api/items/:id/download
```

### `POST /api/items/:id/archive`

Archives or restores an item. Archived items are hidden from normal list and search responses unless `includeArchived=true`.

Request:

```json
{
  "archived": true
}
```

Response:

```json
{
  "item": {
    "id": "itm_1782547200000_a9f4c21b",
    "archivedAt": "2026-06-27T12:00:00.000Z"
  }
}
```

### `DELETE /api/items/:id`

Permanently removes an item from metadata. File/image/screenshot items also remove their local inbox item directory.

Response:

```json
{
  "item": {
    "id": "itm_1782547200000_a9f4c21b"
  }
}
```

### `POST /api/knowledge/:id`

Writes an item into the Markdown knowledge base.

Request:

```json
{
  "tags": ["pocketbridge", "demo"],
  "note": "Imported during live demo."
}
```

Response:

```json
{
  "item": {
    "id": "itm_1782547200000_a9f4c21b",
    "status": "saved_to_knowledge",
    "knowledgePath": "data/obsidian/PocketBridge/inbox/2026-06-27-idea-from-phone-itm_1782547200000_a9f4c21b.md"
  }
}
```

Markdown output format for a text item:

```markdown
---
id: "itm_1782547200000_a9f4c21b"
title: "Idea from phone"
origin: "mobile"
sourceDevice: "Pinkmans-iPhone"
source: "phone"
kind: "text"
createdAt: "2026-06-27T12:00:00.000Z"
tags:
  - "pocketbridge"
  - "demo"
---

# Idea from phone

## Summary

Turn screenshots into a personal knowledge stream.

## Content

Turn screenshots into a personal knowledge stream.

Imported during live demo.

Source: mobile / Pinkmans-iPhone
```

Markdown output for file/image/screenshot items also copies the original asset into `assets/pocketbridge/` and includes an Obsidian attachment link:

```markdown
Asset: [[../assets/pocketbridge/itm_1782547200000_a9f4c21b-screenshot-2026-06-27-20-00-00.png]]
```

### `GET /api/ble/status`

Response:

```json
{
  "status": "trusted",
  "deviceName": "Pinkmans-iPhone",
  "rssi": -49,
  "updatedAt": "2026-06-27T12:00:00.000Z"
}
```

Allowed `status` values:

- `trusted`
- `away`
- `locked`
- `unknown`

### `POST /api/ble/status`

Ding's BLEUnlock bridge or demo control panel calls this.

Request:

```json
{
  "status": "away",
  "deviceName": "Pinkmans-iPhone",
  "rssi": -82
}
```

Response:

```json
{
  "status": "away",
  "deviceName": "Pinkmans-iPhone",
  "rssi": -82,
  "updatedAt": "2026-06-27T12:00:00.000Z"
}
```

## WebSocket Contract

Connect to:

```text
ws://<mac-lan-ip>:3000/ws?pairCode=<pairCode>&client=mobile
```

Event envelope:

```ts
type PocketEvent = {
  type:
    | "pairing.connected"
    | "item.created"
    | "item.updated"
    | "item.shared"
    | "item.deleted"
    | "knowledge.saved"
    | "ble.status";
  version: 1;
  eventId: string;
  sentAt: string;
  data: unknown;
};
```

Example:

```json
{
  "type": "item.created",
  "version": 1,
  "eventId": "evt_1782547200000_5d2c91ab",
  "sentAt": "2026-06-27T12:00:00.000Z",
  "data": {
    "item": {
      "id": "itm_1782547200000_a9f4c21b",
      "kind": "image",
      "title": "Screenshot.png",
      "origin": "mobile",
      "sourceDevice": "Pinkmans-iPhone",
      "tags": [],
      "sharedToMobile": false,
      "status": "inbox",
      "createdAt": "2026-06-27T12:00:00.000Z",
      "updatedAt": "2026-06-27T12:00:00.000Z"
    }
  }
}
```

Flutter rule: on `item.created`, `item.updated`, `item.shared`, `item.deleted`, or `knowledge.saved`, refresh `GET /api/items`.

Mac UI rule: on every item event, update PocketInbox immediately.

## Error Format

Every API error returns:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid pair code"
  }
}
```

Required error codes:

- `UNAUTHORIZED`
- `NOT_FOUND`
- `BAD_REQUEST`
- `UPLOAD_TOO_LARGE`
- `INTERNAL_ERROR`

## Ownership Boundaries

Pinkman owns:

- Node server.
- REST API.
- WebSocket events.
- Flutter QR pairing.
- Flutter upload/download.
- Knowledge Markdown writer.

Ding owns:

- Mac PocketInbox UI.
- QR display UI.
- Snapzy export workflow into `data/watch/snapzy/`.
- BLEUnlock status bridge or demo panel.
- Demo script and pitch.

Shared:

- This API contract.
- Item model.
- Visual naming: PocketBridge, PocketInbox, PocketKey.
- Demo order.

## Demo Order

1. Start Mac server.
2. Show QR code.
3. Scan from Flutter app.
4. Upload text from phone.
5. Upload image/file from phone.
6. PocketInbox updates live.
7. Save one item to knowledge base.
8. Snapzy exports screenshot into watch folder; item appears in PocketInbox.
9. Mark screenshot as shared to mobile.
10. Flutter downloads shared screenshot.
11. BLE status changes from `trusted` to `away` and UI reflects it.
