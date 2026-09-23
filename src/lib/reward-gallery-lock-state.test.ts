import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("unearned reward cards receive a theme-aware 50 percent background veil", () => {
  const gallery = readFileSync(
    new URL("../components/constellation/reward-gallery.tsx", import.meta.url),
    "utf8",
  );

  assert.match(gallery, /earned \? null :/);
  assert.match(gallery, /absolute inset-0/);
  assert.match(gallery, /bg-\[var\(--background\)\]\/50/);
});
