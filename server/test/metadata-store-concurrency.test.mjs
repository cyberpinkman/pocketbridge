import { strict as assert } from "node:assert";
import test from "node:test";
import {
  addItem,
  addPairingSession,
  readMetadata,
  writeMetadata
} from "../../dist/server/src/storage/metadataStore.js";

test("metadata store serializes concurrent item writes without dropping updates", async () => {
  const originalMetadata = await readMetadata();

  await writeMetadata({
    items: [],
    pairingSessions: [],
    shares: []
  });

  try {
    const items = Array.from({ length: 24 }, (_, index) => ({
      id: `concurrent-item-${index}`,
      kind: "text",
      title: `Concurrent item ${index}`,
      source: "phone",
      text: `payload ${index}`,
      createdAt: `2026-06-27T00:00:${String(index).padStart(2, "0")}.000Z`
    }));

    await Promise.all(items.map((item) => addItem(item)));

    const metadata = await readMetadata();
    assert.equal(metadata.items.length, items.length);
    assert.deepEqual(
      new Set(metadata.items.map((item) => item.id)),
      new Set(items.map((item) => item.id))
    );
  } finally {
    await writeMetadata(originalMetadata);
  }
});

test("metadata store normalizes legacy files without pairing or share arrays", async () => {
  const originalMetadata = await readMetadata();

  await writeMetadata({ items: [] });

  try {
    const metadata = await readMetadata();
    assert.deepEqual(metadata, {
      items: [],
      pairingSessions: [],
      shares: []
    });

    await addPairingSession({
      id: "legacy-pairing-session",
      token: "123456",
      createdAt: "2026-06-28T00:00:00.000Z",
      expiresAt: "2026-06-28T00:10:00.000Z"
    });

    const updated = await readMetadata();
    assert.equal(updated.pairingSessions.length, 1);
    assert.equal(updated.pairingSessions[0].token, "123456");
    assert.deepEqual(updated.shares, []);
  } finally {
    await writeMetadata(originalMetadata);
  }
});
