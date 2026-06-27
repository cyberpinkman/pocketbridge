#!/usr/bin/env sh
set -eu

PB_BASE_URL="${PB_BASE_URL:-http://127.0.0.1:3000}"
PB_SOURCE_DEVICE="${PB_SOURCE_DEVICE:-BLE Capsule}"
PB_TITLE="${PB_TITLE:-BLE Capsule Text}"

if [ -z "${PB_PAIR_CODE:-}" ]; then
  echo "PB_PAIR_CODE is required" >&2
  exit 64
fi

if [ "$#" -gt 0 ]; then
  TEXT="$*"
else
  TEXT=$(cat)
fi

if [ -z "$TEXT" ]; then
  echo "Text payload is required as arguments or stdin" >&2
  exit 64
fi

export PB_TITLE PB_SOURCE_DEVICE TEXT
BODY=$(node -e '
const payload = {
  title: process.env.PB_TITLE,
  text: process.env.TEXT,
  origin: "mobile",
  sourceDevice: process.env.PB_SOURCE_DEVICE,
  tags: ["ble-capsule"]
};
process.stdout.write(JSON.stringify(payload));
')

curl -fsS \
  -X POST "$PB_BASE_URL/api/items/text" \
  -H "content-type: application/json" \
  -H "X-PocketBridge-Pair-Code: $PB_PAIR_CODE" \
  -d "$BODY"
