# Snapzy Integration

MVP goal:

- Let a Snapzy screenshot or annotated image arrive in PocketInbox.

Fallback path:

- Export from Snapzy into `data/watch/snapzy`.
- In the Mac Web UI, click `Import Snapzy folder`.
- The local bridge imports each file as `source: "snapzy"`.
- For compatibility with earlier local demos, the bridge also imports `integrations/snapzy/inbox` when no explicit folder override is set.
- To use a different folder, set `PB_SNAPZY_WATCH_DIR=/path/to/folder` before starting the bridge. The older `SNAPZY_EXPORT_DIR=/path/to/folder` override is still supported.

API:

```bash
curl -X POST http://127.0.0.1:3000/snapzy/import
```

Future path:

- Add direct automation or share extension support if Snapzy exposes a stable integration surface.
