import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { credentialFingerprint, matchesCredentialFingerprint } from "../credential-version";
import { validateRasterUpload } from "../upload-validation";

test("password hash rotation revokes old and legacy tokens", () => {
  const version = credentialFingerprint("old-password-hash", "test-secret");
  assert.equal(matchesCredentialFingerprint(version, "old-password-hash", "test-secret"), true);
  assert.equal(matchesCredentialFingerprint(version, "new-password-hash", "test-secret"), false);
  assert.equal(matchesCredentialFingerprint(undefined, "old-password-hash", "test-secret"), false);
  assert.notEqual(version, "old-password-hash");
});
test("upload validation rejects nonimages, SVG and truncated raster data", async () => {
  await assert.rejects(validateRasterUpload(Buffer.from("not a picture")));
  await assert.rejects(validateRasterUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')));
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(validateRasterUpload(png.subarray(0, 50)));
});
test("upload validation decodes bytes and produces a trusted raster type", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  const image = await validateRasterUpload(png);
  assert.equal(image.extension, "webp");
  assert.equal(image.contentType, "image/webp");
  assert.equal((await sharp(image.bytes).metadata()).format, "webp");
});
test("upload validation rejects oversized bytes and dimensions", async () => {
  await assert.rejects(validateRasterUpload(Buffer.alloc(5 * 1024 * 1024 + 1)));
  const wide = await sharp({ create: { width: 12001, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(validateRasterUpload(wide));
});
