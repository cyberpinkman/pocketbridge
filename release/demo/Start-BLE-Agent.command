#!/bin/zsh
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"
AGENT_DIR="$REPO_ROOT/integrations/real-ble-agent/mac-agent"

cd "$AGENT_DIR"

if ! command -v swift >/dev/null 2>&1; then
  echo "swift was not found. Install Xcode Command Line Tools before running the BLE Agent."
  exit 1
fi

echo "Starting PocketBridge BLE Agent from $AGENT_DIR"
swift run PocketBridgeBLEAgent
