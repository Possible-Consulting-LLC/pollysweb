import assert from "node:assert/strict";
import { it } from "node:test";
import { getPhotoSizeError } from "./upload-limits";

it("allows default portraits and photos up to 4 MB", () => {
  assert.equal(getPhotoSizeError(null), null);
  assert.equal(getPhotoSizeError({ size: 0 }), null);
  assert.equal(getPhotoSizeError({ size: 4_000_000 }), null);
});

it("rejects photos above 4 MB, including those below the old 5MB limit", () => {
  for (const size of [4_000_001, 4_800_000, 5 * 1024 * 1024, 12_000_000]) {
    assert.match(getPhotoSizeError({ size })!, /4 MB/);
  }
});
