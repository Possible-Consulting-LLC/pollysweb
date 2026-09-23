import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { validateRasterUpload, uploadValidationMessage } from "./upload-validation";

async function rejectionMessage(bytes: Buffer) {
  try {
    await validateRasterUpload(bytes);
    assert.fail("Expected validation to reject this fixture");
  } catch (error) {
    return uploadValidationMessage(error);
  }
}

test("unreadable image data is not reported as a file-size failure", async () => {
  const message = await rejectionMessage(Buffer.from("not a photo"));
  assert.match(message, /read|decode|damaged/i);
  assert.doesNotMatch(message, /4 MB/);
});

test("unsupported decoded image formats explain how to convert the photo", async () => {
  const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).tiff().toBuffer();
  const message = await rejectionMessage(tiff);
  assert.match(message, /format|supported/i);
  assert.match(message, /JPEG|PNG/);
  assert.doesNotMatch(message, /4 MB/);
});

test("small compressed files with excessive dimensions report dimensions", async () => {
  const wide = await sharp({ create: { width: 12001, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  assert.ok(wide.length < 4_000_000);
  assert.match(await rejectionMessage(wide), /dimensions|pixels/i);
});

test("oversized input reports the file-size limit", async () => {
  assert.match(await rejectionMessage(Buffer.alloc(4_000_001)), /4 MB/);
});

test("unexpected failures never expose internal error details", () => {
  assert.doesNotMatch(uploadValidationMessage(new Error("private internal details")), /private internal details/);
});

test("valid photos still decode and normalize to WebP", async () => {
  const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  const result = await validateRasterUpload(png);
  assert.equal((await sharp(result.bytes).metadata()).format, "webp");
});
