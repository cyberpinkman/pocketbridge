#!/bin/zsh
set -euo pipefail

REPO_DIR="${0:A:h}"
CLIENT_BIN="$REPO_DIR/apps/mac_desktop/native/.build/release/PocketBridgeMacClient"
PID_FILE="/tmp/pocketbridge-mac-client.pid"
LOG_FILE="/tmp/pocketbridge-mac-client.log"

cd "$REPO_DIR"

if [[ ! -x "$CLIENT_BIN" ]]; then
  npm run mac:client:build
fi

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && ps -p "$existing_pid" >/dev/null 2>&1; then
    echo "PocketBridge Mac Client is already running with PID $existing_pid."
    exit 0
  fi
fi

nohup "$CLIENT_BIN" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "PocketBridge Mac Client started."
echo "Log: $LOG_FILE"
sleep 1
