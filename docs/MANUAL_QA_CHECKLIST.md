# PocketBridge Manual QA Checklist

Automated MVP confidence: 96%.

The remaining 4% is device-bound or external-app-bound and must be verified manually before treating the hackathon demo as fully ready.

## Automated Baseline

Run from the repository root:

```bash
npm test
npm run demo:live
npm run demo:lan-check
npm run env:check
```

Record the command output in the Acceptance Record section.

## Flutter Workstation

- `flutter pub get` succeeds in `apps/mobile_flutter`.
- `flutter analyze` succeeds.
- `flutter test` succeeds.
- `flutter build apk --debug` succeeds, or the CI `pocketbridge-mobile-debug-apk` artifact installs on a test Android phone.
- The app can pair through QR or pasted payload.
- Text upload, file upload, shared-item refresh, and download progress work against the Mac bridge.

## Physical Phone LAN And QR

- Phone and Mac are on the same network.
- Start with `PB_PUBLIC_HOST=<Mac-LAN-IP> npm run dev`.
- `npm run demo:lan-check` reports the same phone-reachable base URL.
- Phone opens `http://<Mac-LAN-IP>:3000/mobile.html`.
- QR payload uses the Mac LAN URL, not `localhost`.
- WebSocket connects with `/ws?pairCode=<code>&client=mobile`.

## Snapzy Integration

- Export or copy a real Snapzy capture into `data/watch/snapzy`.
- The Mac UI import action imports supported files.
- The watch-folder importer picks up new files while the bridge is running.
- Imported items show Snapzy origin and can be exported to the knowledge base.

## BLEUnlock Integration

- Run the BLEUnlock hook script from `integrations/bleunlock`.
- Confirm trusted, away, and locked state transitions can be reflected in the bridge.
- Confirm the demo UI can still simulate the same states if the external app is unavailable.

## BLE Capsule Text Proof

- Run the BLE Capsule text script from `integrations/ble-capsule`.
- Confirm a short text payload reaches the local bridge path documented by the integration.
- If hardware is unavailable, record the blocker and show the local script bridge.

## Acceptance Record

- Date:
- Tester:
- Commit SHA:
- Node baseline:
- Flutter baseline:
- Physical phone:
- Snapzy:
- BLEUnlock:
- BLE Capsule:
- Known gaps:

## Release Decision

Ship the hackathon demo when:

- Root Node checks pass.
- Flutter checks pass locally or through CI artifact.
- Physical-phone LAN or browser fallback is confirmed.
- Known device-bound gaps are recorded above.
