#!/usr/bin/env sh
set -eu

STATUS="${1:-}"
PB_BASE_URL="${PB_BASE_URL:-http://127.0.0.1:3000}"
PB_DEVICE_NAME="${PB_DEVICE_NAME:-BLEUnlock Phone}"
PB_RSSI="${PB_RSSI:-}"

case "$STATUS" in
  trusted|away|locked|unknown)
    ;;
  *)
    echo "Usage: PB_PAIR_CODE=<pair-code> $0 trusted|away|locked|unknown [rssi]" >&2
    exit 64
    ;;
esac

if [ -z "${PB_PAIR_CODE:-}" ]; then
  echo "PB_PAIR_CODE is required" >&2
  exit 64
fi

if [ "$#" -ge 2 ]; then
  PB_RSSI="$2"
fi

if [ -n "$PB_RSSI" ]; then
  BODY=$(printf '{"status":"%s","deviceName":"%s","rssi":%s}' "$STATUS" "$PB_DEVICE_NAME" "$PB_RSSI")
else
  BODY=$(printf '{"status":"%s","deviceName":"%s"}' "$STATUS" "$PB_DEVICE_NAME")
fi

curl -fsS \
  -X POST "$PB_BASE_URL/api/ble/status" \
  -H "content-type: application/json" \
  -H "X-PocketBridge-Pair-Code: $PB_PAIR_CODE" \
  -d "$BODY"
