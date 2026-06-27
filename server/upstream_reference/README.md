# Upstream Server Reference

This folder preserves the alternate server scaffold synced from the remote repository.

The active local MVP server currently lives under `server/src/routes`, `server/src/integrations`, and `server/src/storage/metadataStore.ts`. The reference scaffold is kept outside `server/src` so `tsc` does not compile two incompatible server architectures at once.

Use this folder only when intentionally comparing or porting upstream implementation details into the active local bridge.
