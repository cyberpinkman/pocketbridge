#!/bin/zsh
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DEMO_DIR/../.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile_flutter"
APK_OUT="$MOBILE_DIR/build/app/outputs/flutter-apk/app-debug.apk"
RELEASE_APK="$DEMO_DIR/PocketBridge-Mobile.apk"

if command -v flutter >/dev/null 2>&1; then
  FLUTTER_BIN="$(command -v flutter)"
elif [ -x "/Users/zerone/flutter/bin/flutter" ]; then
  FLUTTER_BIN="/Users/zerone/flutter/bin/flutter"
else
  echo "Flutter was not found. Install Flutter or put it on PATH, then rerun this script."
  exit 1
fi

cd "$MOBILE_DIR"
"$FLUTTER_BIN" pub get
"$FLUTTER_BIN" build apk --debug

cp "$APK_OUT" "$RELEASE_APK"
echo "Android APK copied to $RELEASE_APK"
