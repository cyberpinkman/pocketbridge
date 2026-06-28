#!/bin/zsh
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"
PORT="${PORT:-3000}"

cd "$REPO_ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js/npm before running the PocketBridge demo."
  exit 1
fi

echo "Starting PocketBridge Mac demo client from $REPO_ROOT"
npm run build
open "http://127.0.0.1:$PORT/" >/dev/null 2>&1 || true
echo "Mac demo client: http://127.0.0.1:$PORT/"
echo "Mobile fallback:   http://127.0.0.1:$PORT/mobile.html"
echo
npm run start
