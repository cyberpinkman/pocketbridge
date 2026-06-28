# PocketBridge Standard Demo Package

This folder is the handoff package for the standalone PocketBridge demo.

## Included

- Mac demo client: `PocketBridge-Mac-Demo.app`
- Mac service launcher: `Start-PocketBridge-Mac.command`
- Rehearsal checker: `Run-Demo-Ready.command`
- Real BLE Agent launcher: `Start-BLE-Agent.command`
- Android APK status: `PocketBridge-Mobile.apk` when buildable on this Mac, otherwise `APK_BUILD_BLOCKED.md`

## Demo Order

1. Double-click `Run-Demo-Ready.command`.
2. Double-click `PocketBridge-Mac-Demo.app`.
3. Open the printed Mac URL and phone URL on the same network.
4. Pair the phone with the QR code or pair code.
5. Capture a screen in the Mac UI, draw an annotation, and save it to PocketInbox.
6. Select the capture and click `Send by Bluetooth`.
7. On Android, install `PocketBridge-Mobile.apk`, open the Flutter app, and tap `Start BLE Demo`.
8. Double-click `Start-BLE-Agent.command` for the real Mac BLE Agent path.
9. Move the phone near and away from the Mac to exercise PocketKey RSSI states.

## Expected Signs

- PocketInbox receives phone text, files, and Mac captures.
- The shared item appears on the phone after `Send by Bluetooth`.
- The BLE Agent logs downlink and uplink traffic.
- PocketKey moves through `trusted`, `away`, and `locked`.

The browser mobile fallback remains available at `/mobile.html` for rehearsal, but the standard demo target is the Mac client plus Android APK.
