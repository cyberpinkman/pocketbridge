# Real BLE Agent

This folder defines the non-simulated BLE path for PocketBridge.

The Node bridge already supports two modes:

```bash
PB_BLE_TRANSPORT=demo npm run start
PB_BLE_TRANSPORT=agent PB_BLE_AGENT_URL=http://127.0.0.1:41237 npm run start
```

`demo` keeps the current browser fallback flow. `agent` requires a local macOS BLE Agent that talks to the phone over CoreBluetooth and exposes a small localhost HTTP control surface to the Node bridge.

## Runtime Contract

When the Mac user clicks `Send by Bluetooth`, PocketBridge calls:

```http
POST /transfers
content-type: application/json
```

Request shape:

```json
{
  "item": {
    "id": "capture-item",
    "kind": "image",
    "title": "Annotated capture",
    "source": "mac",
    "sourceDevice": "PocketBridge Capture",
    "mimeType": "image/png",
    "size": 2048,
    "filePath": "/absolute/local/file.png",
    "text": null,
    "createdAt": "2026-06-27T00:00:00.000Z"
  },
  "share": {
    "id": "share-id",
    "itemId": "capture-item",
    "target": "phone",
    "status": "queued",
    "createdAt": "2026-06-27T00:00:01.000Z"
  }
}
```

Response shape:

```json
{
  "id": "agent-transfer-1",
  "itemId": "capture-item",
  "channel": "ble",
  "status": "queued",
  "chunkSizeBytes": 512,
  "createdAt": "2026-06-27T00:00:01.000Z"
}
```

If the agent is down, PocketBridge returns `502 BLE_AGENT_UNAVAILABLE` instead of silently falling back to simulated transfer.

## BLE Services

`PocketBridgeTransferService` is the file-transfer service.

- Mac advertises the service.
- Phone connects after QR pairing.
- Phone subscribes to downlink notifications.
- Mac sends metadata first, then binary chunks.
- Phone ACKs each chunk over uplink.
- Final ACK includes SHA-256 so both sides can prove the same bytes moved over BLE.

`PocketKeyService` is the proximity key service.

- Phone advertises the service while paired.
- Mac scans it with CoreBluetooth and records RSSI.
- Strong RSSI keeps the Mac-side PocketKey trusted.
- Missing RSSI for 10 seconds moves to `away`.
- Missing RSSI for 20 seconds moves to `locked`.
- On locked transition, the macOS agent may call:

```bash
/System/Library/CoreServices/Menu\ Extras/User.menu/Contents/Resources/CGSession -suspend
```

This is a lock action only. PocketBridge must not silently unlock the macOS login screen; returning to `trusted` means the app trust state is restored, while macOS still follows password or Touch ID policy.

## First Native Implementation Slice

Mac agent:

- Swift command-line tool or menu-bar app.
- CoreBluetooth peripheral for `PocketBridgeTransferService`.
- CoreBluetooth central scanner for `PocketKeyService`.
- Localhost HTTP listener on `127.0.0.1:41237`.
- Chunk queue with per-transfer SHA-256.

Run the current Swift agent skeleton:

```bash
cd integrations/real-ble-agent/mac-agent
swift run PocketBridgeBLEAgent
```

Mobile app:

- Flutter plugin or native bridge for BLE.
- Scan for `PocketBridgeTransferService`.
- Subscribe to downlink.
- Write ACKs to uplink.
- Advertise `PocketKeyService` when paired.

True BLE QA should run with Wi-Fi transfer fallback disabled, `PB_BLE_TRANSPORT=agent`, and logs showing chunk count, total bytes, and SHA-256 matches on both Mac and phone.
