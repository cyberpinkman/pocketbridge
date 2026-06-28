import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android project uses the PocketBridge app identity', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    final mainActivity = File(
      'android/app/src/main/kotlin/app/pocketbridge/mobile/MainActivity.kt',
    ).readAsStringSync();

    expect(gradle, contains('namespace = "app.pocketbridge.mobile"'));
    expect(gradle, contains('applicationId = "app.pocketbridge.mobile"'));
    expect(gradle, isNot(contains('com.example')));
    expect(mainActivity, contains('package app.pocketbridge.mobile'));
  });

  test('Android manifest supports the local-network demo path', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    expect(manifest, contains('android:label="PocketBridge"'));
    expect(
      manifest,
      contains('<uses-permission android:name="android.permission.CAMERA" />'),
    );
    expect(
      manifest,
      contains('<uses-permission android:name="android.permission.INTERNET" />'),
    );
    expect(manifest, contains('android:usesCleartextTraffic="true"'));
  });
}
