# PocketBridge Demo Script

## Start

Run from the repository root:

```bash
cd server
npm run dev
```

Keep the printed pair code available for curl smoke commands:

```bash
export PAIR_CODE=<printed-pair-code>
```

Open Mac UI:

```text
http://<mac-lan-ip>:3000/
```

If the LAN IP changes, use the address printed by the server.

If the phone cannot open the printed URL, restart with:

```bash
PB_PUBLIC_HOST=<phone-reachable-mac-ip> npm run dev
```

## Demo Flow

1. Show the Mac PocketBridge UI and pairing QR code.
2. On the phone, open the Flutter app after it exists. Until then, use:

```text
http://<mac-lan-ip>:3000/mobile.html
```

3. Upload a text idea from the phone.
4. Upload a photo or file from the phone.
5. Show PocketInbox updating on the Mac.
6. Click `Save` on one item and show the generated Markdown under:

```text
data/obsidian/PocketBridge/
```

7. Save a Snapzy screenshot into:

```text
data/watch/snapzy/
```

8. Show the screenshot appearing in PocketInbox.
9. Click `Share` on the screenshot.
10. Refresh the phone page and download the shared screenshot.
11. Click `Trusted`, then `Away`, then `Locked` in the Mac UI to demonstrate PocketKey state.

## Useful Smoke Commands

Create a phone text item:

```bash
curl -X POST http://127.0.0.1:3000/api/items/text \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"title":"Demo idea","text":"Phone to Mac to knowledge.","origin":"mobile","sourceDevice":"Demo Phone","tags":["demo"]}'
```

List inbox items:

```bash
curl http://127.0.0.1:3000/api/items \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE"
```

Set BLE state:

```bash
curl -X POST http://127.0.0.1:3000/api/ble/status \
  -H 'Content-Type: application/json' \
  -H "X-PocketBridge-Pair-Code: $PAIR_CODE" \
  -d '{"status":"trusted","deviceName":"Demo Phone","rssi":-48}'
```
