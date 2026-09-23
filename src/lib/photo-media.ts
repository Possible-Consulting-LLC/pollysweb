export const SPOOD_STORAGE_PREFIX = "spood-storage:";
export const SPOODS_BUCKET = "spoods";
const storageMarkers = [
  "/storage/v1/object/public/spoods/",
  "/storage/v1/object/sign/spoods/",
];

export function storageReference(path: string): string {
  return `${SPOOD_STORAGE_PREFIX}${path}`;
}

function safeStoragePath(value: string): string | null {
  if (!value || value.length > 512) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!/^[a-zA-Z0-9_./-]+$/.test(decoded) ||
      decoded.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return decoded;
}

/** Resolve only this project's bucket references; never use the URL as a fetch target. */
export function storagePathFromReference(reference: string, storageOrigin: string): string | null {
  if (reference.startsWith(SPOOD_STORAGE_PREFIX)) {
    return safeStoragePath(reference.slice(SPOOD_STORAGE_PREFIX.length));
  }

  let origin: string;
  try {
    origin = new URL(storageOrigin).origin;
  } catch {
    return null;
  }
  for (const marker of storageMarkers) {
    const prefix = `${origin}${marker}`;
    if (reference.startsWith(prefix)) {
      return safeStoragePath(reference.slice(prefix.length).split(/[?#]/, 1)[0]);
    }
  }
  return null;
}

/** Render Storage objects only through the authenticated, same-origin endpoint. */
export function privatePhotoSrc(source: string): string {
  if (source.startsWith(SPOOD_STORAGE_PREFIX) ||
      storageMarkers.some((marker) => source.includes(marker))) {
    return `/api/photos?ref=${encodeURIComponent(source)}`;
  }
  return source;
}
