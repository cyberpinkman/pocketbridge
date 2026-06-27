# PocketBridge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-day demo where a Flutter phone app pairs with a Mac, exchanges captured content through a local bridge, stores items in PocketInbox, exports one item into a knowledge base, and shows BLE trusted-state behavior.

**Architecture:** The local Node bridge is the first stable integration point. Flutter, Mac UI, Snapzy, BLEUnlock, and the knowledge-base pipeline communicate through thin HTTP/WebSocket adapters so each demo leg can be tested independently.

**Tech Stack:** Flutter, Swift/SwiftUI or local Web UI fallback, Node.js, Express, WebSocket, HTTP multipart upload, QR pairing, local JSON metadata, Obsidian-compatible Markdown export.

---

## File Structure

- `server/src/index.ts`: Express app bootstrap, health endpoint, route registration, WebSocket setup.
- `server/src/routes/pairing.ts`: QR pairing session creation and confirmation.
- `server/src/routes/upload.ts`: multipart/text upload into PocketInbox.
- `server/src/routes/items.ts`: inbox list endpoint.
- `server/src/routes/share.ts`: Mac-to-phone share queue endpoint.
- `server/src/websocket/hub.ts`: WebSocket client registry and broadcast helper.
- `server/src/storage/metadataStore.ts`: local JSON metadata persistence.
- `server/src/integrations/knowledgeBase.ts`: Markdown export adapter.
- `server/src/integrations/trustState.ts`: BLEUnlock state adapter with simulator fallback.
- `apps/mobile_flutter/`: Flutter app workspace.
- `apps/mac_desktop/`: SwiftUI app or local Web UI workspace.
- `integrations/snapzy/`: Snapzy adapter notes and scripts.
- `integrations/bleunlock/`: BLEUnlock adapter notes and scripts.
- `integrations/knowledge-base/`: knowledge export notes and scripts.

### Task 1: Local Bridge Bootstrap

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `server/src/index.ts`
- Create: `server/src/config.ts`
- Create: `server/src/storage/metadataStore.ts`
- Create: `data/inbox/.gitkeep`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install
```

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 2: Run server in dev mode**

Run:

```bash
npm run dev
```

Expected: console prints `PocketBridge local bridge listening`.

- [ ] **Step 3: Check health endpoint**

Run in another terminal:

```bash
curl http://localhost:4317/health
```

Expected:

```json
{"ok":true,"name":"PocketBridge"}
```

The response may also include current trust state.

### Task 2: Pairing QR Flow

**Files:**
- Modify: `server/src/routes/pairing.ts`
- Modify: `server/src/types.ts`
- Modify: `server/src/websocket/hub.ts`

- [ ] **Step 1: Create a pairing session**

Run:

```bash
curl -X POST http://localhost:4317/pairing/session
```

Expected: JSON includes `session.token`, `pairingPayload`, and `qrDataUrl`.

- [ ] **Step 2: Confirm the pairing session**

Copy the returned token and run:

```bash
curl -X POST http://localhost:4317/pairing/confirm \
  -H 'content-type: application/json' \
  -d '{"token":"PASTE_TOKEN_HERE","deviceName":"Demo Phone"}'
```

Expected: JSON includes `confirmedAt` and `deviceName`.

- [ ] **Step 3: Verify metadata persistence**

Open `data/metadata.json`.

Expected: `pairingSessions[0]` contains the confirmed session.

### Task 3: PocketInbox Upload

**Files:**
- Modify: `server/src/routes/upload.ts`
- Modify: `server/src/routes/items.ts`
- Modify: `server/src/storage/metadataStore.ts`
- Modify: `server/src/types.ts`

- [ ] **Step 1: Upload a text idea**

Run:

```bash
curl -X POST http://localhost:4317/upload \
  -F 'source=phone' \
  -F 'text=PocketBridge can turn screenshots into reusable knowledge.'
```

Expected: HTTP 201 and an item with `kind: "text"` and `source: "phone"`.

- [ ] **Step 2: Upload an image or document**

Run:

```bash
printf 'demo file' > /tmp/pocketbridge-demo.txt
curl -X POST http://localhost:4317/upload \
  -F 'source=mac' \
  -F 'file=@/tmp/pocketbridge-demo.txt'
```

Expected: HTTP 201 and a file appears under `data/inbox`.

- [ ] **Step 3: List inbox items**

Run:

```bash
curl http://localhost:4317/items
```

Expected: JSON contains both uploaded items.

### Task 4: Real-Time Events

**Files:**
- Modify: `server/src/websocket/hub.ts`
- Modify: `server/src/routes/upload.ts`
- Modify: `server/src/routes/share.ts`
- Modify: `server/src/routes/pairing.ts`

- [ ] **Step 1: Connect a WebSocket client**

Run:

```bash
npx wscat -c ws://localhost:4317/events
```

Expected: client receives `bridge.connected`.

- [ ] **Step 2: Trigger an upload**

Run:

```bash
curl -X POST http://localhost:4317/upload -F 'text=Realtime test'
```

Expected: WebSocket client receives `item.created`.

### Task 5: Mac-to-Phone Share Queue

**Files:**
- Modify: `server/src/routes/share.ts`
- Modify: `server/src/types.ts`
- Modify: `server/src/storage/metadataStore.ts`

- [ ] **Step 1: Queue an item for phone**

Copy an item id from `curl http://localhost:4317/items`, then run:

```bash
curl -X POST http://localhost:4317/share \
  -H 'content-type: application/json' \
  -d '{"itemId":"PASTE_ITEM_ID_HERE"}'
```

Expected: HTTP 201 and `share.status` is `queued`.

- [ ] **Step 2: Confirm WebSocket notification**

Expected: connected clients receive `share.queued`.

### Task 6: Knowledge Export

**Files:**
- Modify: `server/src/integrations/knowledgeBase.ts`
- Add route later: `server/src/routes/export.ts`

- [ ] **Step 1: Add an export endpoint**

Create `server/src/routes/export.ts`:

```ts
import { Router } from "express";
import { exportItemToMarkdown } from "../integrations/knowledgeBase.js";
import { readMetadata } from "../storage/metadataStore.js";

export const exportRouter = Router();

exportRouter.post("/:itemId", async (request, response, next) => {
  try {
    const metadata = await readMetadata();
    const item = metadata.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item) {
      response.status(404).json({ error: "item not found" });
      return;
    }

    const vaultDir = String(request.body.vaultDir ?? "./my-knowledge-base");
    const outputPath = await exportItemToMarkdown(item, { vaultDir });
    response.json({ outputPath });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 2: Register the route**

Add this to `server/src/index.ts`:

```ts
import { exportRouter } from "./routes/export.js";

app.use("/export", exportRouter);
```

- [ ] **Step 3: Export one item**

Run:

```bash
curl -X POST http://localhost:4317/export/PASTE_ITEM_ID_HERE \
  -H 'content-type: application/json' \
  -d '{"vaultDir":"./my-knowledge-base"}'
```

Expected: Markdown appears under `my-knowledge-base/inbox`.

### Task 7: Flutter Demo App

**Files:**
- Create inside: `apps/mobile_flutter/`

- [ ] **Step 1: Generate Flutter project**

Run:

```bash
cd apps/mobile_flutter
flutter create .
```

Expected: Flutter project files are created.

- [ ] **Step 2: Add screens**

Implement:

- Pairing screen with QR scan result input fallback.
- Upload screen for text and file/image.
- Share screen that listens to WebSocket events or polls `/items`.

- [ ] **Step 3: Manual demo acceptance**

Expected:

- The phone confirms pairing with Mac.
- The phone uploads one text item.
- The phone uploads one image or document.

### Task 8: Mac UI or Web UI Fallback

**Files:**
- Create inside: `apps/mac_desktop/`

- [ ] **Step 1: Pick UI path**

Use SwiftUI if setup is fast. Use local Web UI if hackathon timing is tight.

- [ ] **Step 2: Implement required surfaces**

Required surfaces:

- Pairing QR
- PocketInbox list
- Send to phone button
- Export to knowledge base button
- Trusted/locked indicator

- [ ] **Step 3: Verify demo loop**

Expected:

- UI updates when `/upload` creates an item.
- UI can queue share for phone.
- UI can show trust simulator changes.

### Task 9: Snapzy and BLEUnlock Demo Adapters

**Files:**
- Modify: `integrations/snapzy/README.md`
- Modify: `integrations/bleunlock/README.md`
- Optional create: `server/src/routes/snapzy.ts`

- [ ] **Step 1: Snapzy fallback**

Export a Snapzy screenshot manually, then upload it:

```bash
curl -X POST http://localhost:4317/upload \
  -F 'source=snapzy' \
  -F 'file=@/path/to/snapzy-export.png'
```

Expected: item appears with `source: "snapzy"`.

- [ ] **Step 2: BLEUnlock fallback**

Run:

```bash
curl -X POST http://localhost:4317/trust/simulate \
  -H 'content-type: application/json' \
  -d '{"trusted":true,"reason":"Demo phone nearby"}'
```

Expected: health endpoint and UI show trusted state.

## Self-Review

- Spec coverage: The plan covers pairing, phone-to-Mac upload, Mac-to-phone share queue, PocketInbox persistence, Snapzy input, BLEUnlock state, and knowledge-base export.
- Placeholder scan: External integrations intentionally include fallback paths because Snapzy and BLEUnlock automation surfaces may vary by machine.
- Type consistency: Item, pairing, share, trust, and event types are defined in `server/src/types.ts` and reused by routes.
