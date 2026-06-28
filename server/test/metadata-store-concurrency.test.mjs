import { strict as assert } from "node:assert";
import test from "node:test";
import { addItem, readMetadata, writeMetadata } from "../../dist/server/src/storage/metadataStore.js";

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
