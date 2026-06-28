# PocketBridge Engineering Brief

## 1. Project Name

PocketBridge

## 2. One-Line Positioning

The phone is an inspiration collector and portable key; the Mac is the personal knowledge base. PocketBridge safely connects the two, moves material between them, and turns captured content into durable knowledge.

## 3. User Pain

User material is scattered across phone, Mac, screenshots, documents, recordings, and notes. Cross-device transfer is clumsy, and captured content rarely settles into a personal knowledge system. Existing tools solve file transfer, but not the full flow: capture -> organize -> knowledge conversion -> AI usability.

## 4. Demo Core Flow

1. Open PocketBridge Desktop on Mac.
2. Pair the Flutter app with the Mac by scanning a QR code.
3. Use Snapzy on Mac to screenshot or annotate, then send the result to PocketInbox.
4. Send screenshots or documents from Mac to phone with one click.
5. Upload images, documents, or inspiration text from phone to Mac.
6. Receive and save content in Mac PocketInbox in real time.
7. Write content into the local knowledge base and Obsidian pipeline.
8. Demonstrate BLEUnlock proximity state for trusted or locked Mac behavior.

## 5. Tech Stack

- Mobile: Flutter for iOS and Android
- Mac Desktop: native macOS Swift/SwiftUI, with local Web UI allowed as MVP fallback
- Local service: Node.js, Express, WebSocket
- File transfer: HTTP multipart upload plus WebSocket notifications
- Pairing: QR code token
- Screenshot annotation: Snapzy integration
- Bluetooth key: BLEUnlock integration
- Knowledge base: `my-knowledge-base` plus Obsidian pipeline
- MCP: optional minimal API or MCP server after core demo works

## 6. Current State

The project is in product confirmation and bootstrap stage. Confirmed decisions:

- Product positioning
- Demo feature boundary
- Flutter mobile app
- Snapzy for screenshots and annotation
- BLEUnlock for Mac lock/unlock demonstration
- `my-knowledge-base` as knowledge backend
- Two-day MVP scope

## 7. Engineering Principle

Build the smallest end-to-end bridge first: pair -> upload -> inbox -> notify -> export. Snapzy, BLEUnlock, and Obsidian should be wired as thin adapters so the demo can survive partial integration failure.
