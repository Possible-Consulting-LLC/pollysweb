// Vercel limits the entire request to 4.5 MB. Leave room for form fields
// and multipart/Server Action overhead; Next's bodySizeLimit cannot raise it.
export const MAX_PHOTO_BYTES = 4_000_000;
export const PHOTO_SIZE_LABEL = "4 MB";

export function getPhotoSizeError(file: Pick<File, "size"> | null): string | null {
  return file && file.size > MAX_PHOTO_BYTES
    ? `This photo is too large. Choose a photo up to ${PHOTO_SIZE_LABEL} or remove it to continue.`
    : null;
}
