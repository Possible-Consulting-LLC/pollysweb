import assert from "node:assert/strict";
import test from "node:test";
import { privatePhotoSrc, storagePathFromReference, storageReference } from "./photo-media";

const origin = "https://staging-ref.supabase.co";

test("new storage keys render through the same-origin photo route", () => {
  assert.equal(storageReference("keeper/photo.webp"), "spood-storage:keeper/photo.webp");
  assert.equal(privatePhotoSrc("spood-storage:keeper/photo.webp"), "/api/photos?ref=spood-storage%3Akeeper%2Fphoto.webp");
});

test("legacy public URLs render through the same-origin photo route", () => {
  const legacy = `${origin}/storage/v1/object/public/spoods/keeper/photo.webp`;
  assert.equal(privatePhotoSrc(legacy), `/api/photos?ref=${encodeURIComponent(legacy)}`);
  assert.equal(storagePathFromReference(legacy, origin), "keeper/photo.webp");
});

test("internal keys resolve to a bucket path while foreign hosts and unsafe paths do not", () => {
  assert.equal(storagePathFromReference("spood-storage:keeper/photo.webp", origin), "keeper/photo.webp");
  assert.equal(storagePathFromReference("spood-storage:../private.webp", origin), null);
  assert.equal(storagePathFromReference("spood-storage:/private.webp", origin), null);
  assert.equal(storagePathFromReference("spood-storage:keeper/%2e%2e/private.webp", origin), null);
  assert.equal(storagePathFromReference("https://elsewhere.example/storage/v1/object/public/spoods/keeper/photo.webp", origin), null);
});

test("built-in avatars and local previews stay on their existing sources", () => {
  assert.equal(privatePhotoSrc("/spoods/defaults/star.svg"), "/spoods/defaults/star.svg");
  assert.equal(privatePhotoSrc("/uploads/local.webp"), "/uploads/local.webp");
  assert.equal(privatePhotoSrc("data:image/webp;base64,AA=="), "data:image/webp;base64,AA==");
});
