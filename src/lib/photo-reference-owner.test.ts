import assert from "node:assert/strict";
import test from "node:test";
import { ownsPhotoReference } from "./photo-reference-owner";

test("photo ownership covers every schema photo reference under the keeper", async () => {
  let where: unknown;
  const owned = await ownsPhotoReference("spood-storage:spider/event.webp", "keeper", {
    spider: { findFirst: async (args) => { where = args.where; return { id: "spider" }; } },
  });
  assert.equal(owned, true);
  assert.deepEqual(where, {
    userId: "keeper",
    OR: [
      { profilePhoto: "spood-storage:spider/event.webp" },
      { photos: { some: { url: "spood-storage:spider/event.webp" } } },
      { enclosure: { is: { photo: "spood-storage:spider/event.webp" } } },
      { feedings: { some: { photoUrl: "spood-storage:spider/event.webp" } } },
      { molts: { some: { OR: [{ moltPhoto: "spood-storage:spider/event.webp" }, { postMoltPhoto: "spood-storage:spider/event.webp" }] } } },
      { observations: { some: { photoUrl: "spood-storage:spider/event.webp" } } },
    ],
  });
});

test("photo ownership denies a missing relational match", async () => {
  const owned = await ownsPhotoReference("spood-storage:spider/event.webp", "foreign", {
    spider: { findFirst: async () => null },
  });
  assert.equal(owned, false);
});
