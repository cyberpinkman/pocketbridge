# PocketBridge Local Environment

**Date:** 2026-06-27  
**Machine:** macOS 26.5.1 arm64  

## Installed

### Flutter

```text
FLUTTER_HOME=$HOME/development/flutter
Flutter 3.44.4 stable
Dart 3.12.2
```

Verify:

```bash
flutter --version
dart --version
```

### JDK

```text
JAVA_HOME=$HOME/development/jdk-17/Contents/Home
OpenJDK 17.0.19 Temurin
```

Verify:

```bash
java -version
```

### Android SDK

```text
ANDROID_HOME=$HOME/Library/Android/sdk
```

Installed packages:

```text
platform-tools 37.0.0
platforms;android-37.0
build-tools;37.0.0
```

Verify:

```bash
adb version
sdkmanager --list_installed
```

### Xcode

```text
Xcode 26.5
Build 17F42
Path: /Applications/Xcode.app/Contents/Developer
```

Verify:

```bash
xcodebuild -version
xcode-select -p
```

## Shell Configuration

The following block was added to both `~/.zshrc` and `~/.zprofile`:

```bash
export FLUTTER_HOME="$HOME/development/flutter"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="$HOME/development/jdk-17/Contents/Home"
export PATH="$FLUTTER_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$HOME/.gem/ruby/2.6.0/bin:$PATH"
```

For the current terminal session:

```bash
source ~/.zshrc
```

## Current Flutter Doctor Status

Passing:

- Flutter SDK.
- Android toolchain.
- Android debug APK build.
- Chrome/web target.
- Network resources.

Remaining:

- Android physical-device run is not verified yet because no device was available.
- iOS simulator runtimes are not installed.
- CocoaPods is not installed yet.
- `flutter analyze` can crash on this machine when run from the current non-ASCII repository path; `dart analyze` works, and `flutter analyze` works from an ASCII-only copy of the Flutter app.

CocoaPods install attempts:

```bash
gem install --user-install cocoapods -v 1.16.2 --no-document
gem install --user-install cocoapods -v 1.11.3 --no-document
```

Both attempts stalled in RubyGems dependency resolution on the system Ruby 2.6 runtime and were interrupted to protect hackathon time.

## Practical Recommendation

For the hackathon, implement and test the Flutter app first on:

1. Android debug APK build and Flutter unit/widget tests.
2. Android device, once available.
3. Chrome/mobile browser fallback for live demo backup.
4. iOS simulator only after simulator runtime and CocoaPods are fixed.

This is enough to build the PocketBridge mobile MVP because the app mainly needs QR parsing, REST upload/download, and WebSocket updates.

## Fresh Clone Checklist

Use the current MVP branch until it is merged:

```bash
git clone https://github.com/cyberpinkman/pocketbridge.git
cd pocketbridge
git checkout codex/mobile-flutter-scaffold
```

Server verification:

Run each verification block from the repository root.

```bash
cd server
npm install
npm run build
npm test
npm run demo:smoke
```

Flutter verification:

```bash
cd apps/mobile_flutter
$HOME/development/flutter/bin/flutter pub get
$HOME/development/flutter/bin/flutter test
$HOME/development/flutter/bin/flutter build apk --debug
```
