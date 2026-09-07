import { mkdir, writeFile } from "fs/promises";
import path from "path";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** Persist an image for Vercel (no durable local disk) and local dev. */
export async function saveImageUpload(
  file: File,
  prefix: string,
): Promise<{ url: string } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "Photo must be under 5MB." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeExt = ALLOWED_EXT.has(ext) ? ext : "jpg";
  const mime =
    file.type && file.type.startsWith("image/")
      ? file.type
      : `image/${safeExt === "jpg" ? "jpeg" : safeExt}`;

  // Local / writable environments: keep serving from /public/uploads.
  try {
    const filename = `${prefix}-${Date.now()}.${safeExt}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes);
    return { url: `/uploads/${filename}` };
  } catch (error) {
    // Vercel serverless FS is read-only — fall back to an inline data URL.
    console.warn("[upload] local disk unavailable; using data URL", error);
    return { url: `data:${mime};base64,${bytes.toString("base64")}` };
  }
}
