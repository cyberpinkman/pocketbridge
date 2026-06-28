#!/bin/zsh
set -euo pipefail

REPO_DIR="${0:A:h}"
BUILD_APP_SCRIPT="$REPO_DIR/apps/mac_desktop/native/scripts/build-app-bundle.sh"
APP_DIR="$REPO_DIR/tmp/demo-artifacts/PocketBridge.app"
PID_FILE="/tmp/pocketbridge-mac-client.pid"
LOG_FILE="/tmp/pocketbridge-mac-client.log"

cd "$REPO_DIR"

"$BUILD_APP_SCRIPT" > "$LOG_FILE" 2>&1

pkill -x PocketBridgeMacClient 2>/dev/null || true
open -n "$APP_DIR"
sleep 1
pgrep -nx PocketBridgeMacClient > "$PID_FILE" || true

echo "PocketBridge Mac Client started."
echo "Log: $LOG_FILE"
if [[ -s "$PID_FILE" ]]; then
  echo "PID: $(cat "$PID_FILE")"
fi
sleep 2
