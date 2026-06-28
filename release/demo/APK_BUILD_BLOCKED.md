# Android APK Build Status

The standard demo package is ready, but this Mac did not finish producing `PocketBridge-Mobile.apk` during the automated handoff run.

What succeeded:

- Flutter SDK was found at `/Users/zerone/flutter/bin/flutter`.
- Flutter reported version `3.41.7` with Dart `3.11.5`.
- `flutter pub get` completed after lowering `apps/mobile_flutter/pubspec.yaml` to `sdk: ">=3.11.0 <4.0.0"`.

What blocked the APK:

- `flutter build apk --debug` reached `Running Gradle task 'assembleDebug'...` and then produced no further output or APK for several minutes.
- The build was stopped to avoid leaving a hanging Gradle process during demo packaging.

To retry on this Mac:

```bash
release/demo/Build-Mobile-APK.command
```

Manual equivalent:

```bash
cd apps/mobile_flutter
/Users/zerone/flutter/bin/flutter pub get
/Users/zerone/flutter/bin/flutter build apk --debug
cp build/app/outputs/flutter-apk/app-debug.apk ../../release/demo/PocketBridge-Mobile.apk
```

When `PocketBridge-Mobile.apk` exists in this folder, it replaces this blocker for the Android side of the demo.
