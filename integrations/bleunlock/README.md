# BLEUnlock Integration

MVP goal:

- Show the phone as a proximity-based trusted key for Mac.

Fallback path:

- Expose a simulator endpoint that toggles `trusted` and `locked` states for the demo.

Event-script bridge:

- Use `pocketkey-status.sh` from a BLEUnlock event hook to push proximity state into PocketBridge.
- Required env: `PB_PAIR_CODE`, copied from the current Mac pairing payload.
- Optional env: `PB_BASE_URL` defaults to `http://127.0.0.1:3000`; `PB_DEVICE_NAME` defaults to `BLEUnlock Phone`.
- Supported states: `trusted`, `away`, `locked`, `unknown`.

Examples:

```bash
PB_PAIR_CODE=123456 ./integrations/bleunlock/pocketkey-status.sh trusted -49
PB_PAIR_CODE=123456 ./integrations/bleunlock/pocketkey-status.sh away -82
PB_PAIR_CODE=123456 ./integrations/bleunlock/pocketkey-status.sh locked
```

Future path:

- Read BLEUnlock state directly or coordinate through its supported automation hooks.
