# BLE Capsule Integration

MVP goal:

- Prove that a short offline/near-field text or link payload can land in PocketInbox.

`capsule-text.sh` is a thin bridge for a future BLE GATT receiver. The receiver can pass decoded text as command arguments or stdin, and the script reuses the existing pair-code-protected `POST /api/items/text` route.

Required env:

- `PB_PAIR_CODE`: copied from the current Mac pairing payload.

Optional env:

- `PB_BASE_URL`: defaults to `http://127.0.0.1:3000`.
- `PB_SOURCE_DEVICE`: defaults to `BLE Capsule`.
- `PB_TITLE`: defaults to `BLE Capsule Text`.

Examples:

```bash
PB_PAIR_CODE=123456 ./integrations/ble-capsule/capsule-text.sh "offline link from BLE"
printf "short markdown note" | PB_PAIR_CODE=123456 ./integrations/ble-capsule/capsule-text.sh
```

Current scope:

- This is not a full BLE transport implementation.
- It gives a GATT prototype or manual demo a stable local ingestion target while the full BLE chunking protocol remains future work.
