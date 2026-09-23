import sharp from "sharp";

import { MAX_PHOTO_BYTES } from "./upload-limits";

export const MAX_UPLOAD_BYTES = MAX_PHOTO_BYTES;
const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 12_000;

class UploadValidationError extends Error {}

export function uploadValidationMessage(error: unknown): string {
  return error instanceof UploadValidationError ? error.message
    : "We couldn’t read this photo. It may be damaged or in an unsupported format. Try exporting it as JPEG, PNG, WebP or still GIF.";
}

/** Decode the entire image and re-encode, dropping metadata and trailing payloads. */
export async function validateRasterUpload(bytes: Buffer) {
  if (!bytes.length) throw new UploadValidationError("This photo is empty. Choose another photo.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadValidationError("This photo is too large. Choose a photo up to 4 MB.");
  const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning" });
  // Inspect the header first; full decoding below still enforces the pixel limit.
  const metadata = await sharp(bytes, { limitInputPixels: false, failOn: "warning" }).metadata();
  if (!metadata.format || !["jpeg", "png", "webp", "gif"].includes(metadata.format)) {
    throw new UploadValidationError("This photo format isn’t supported yet. Export it as JPEG, PNG, WebP or still GIF and try again.");
  }
  if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION ||
      metadata.height > MAX_DIMENSION || metadata.width * metadata.height > MAX_PIXELS) {
    throw new UploadValidationError("This photo’s pixel dimensions are too large. Resize it to no more than 12000 pixels per side and 40 megapixels.");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new UploadValidationError("Animated or multi-frame images aren’t supported. Export a single still photo and try again.");
  }
  const normalized = await image.rotate().webp({ quality: 85 }).toBuffer();
  if (normalized.length > MAX_UPLOAD_BYTES) throw new UploadValidationError("This photo exceeds 4 MB after image processing, even though the original may be smaller. Reduce its dimensions and try again.");
  return { bytes: normalized, extension: "webp", contentType: "image/webp" };
}
