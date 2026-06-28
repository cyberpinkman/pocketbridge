#!/bin/zsh
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"

cd "$REPO_ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js/npm before running the PocketBridge rehearsal."
  exit 1
fi

npm run demo:ready
echo
echo "PocketBridge demo readiness check completed."
