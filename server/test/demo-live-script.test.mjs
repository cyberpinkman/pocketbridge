import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import test from "node:test";

test("package exposes a live demo rehearsal command", async () => {
  const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));

  assert.equal(
    packageJson.scripts["demo:live"],
    "npm run build && node --test --test-concurrency=1 server/test/live-demo-flow.test.mjs"
  );
});
