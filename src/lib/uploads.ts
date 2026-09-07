import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
export const SPOODS_BUCKET = "spoods";

function contentTypeFor(ext: string, fileType: string) {
  if (fileType && fileType.startsWith("image/")) return fileType;
  return `image/${ext === "jpg" ? "jpeg" : ext}`;
}

function objectPath(prefix: string, ext: string) {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "spood";
  return `${safePrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

/** Public URL helper for objects already in the spoods bucket. */
export function publicSpoodUrl(objectPathValue: string) {
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage.from(SPOODS_BUCKET).getPublicUrl(objectPathValue);
  return data.publicUrl;
}

export function isSupabaseStorageUrl(url: string) {
  return (
    url.includes("/storage/v1/object/public/spoods/") ||
    url.includes("/storage/v1/object/sign/spoods/")
  );
}

export function storagePathFromPublicUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/spoods/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0] || "");
}

/** Persist an image to the public Supabase `spoods` bucket (with local fallback). */
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
  const contentType = contentTypeFor(safeExt, file.type);
  const pathInBucket = objectPath(prefix, safeExt);

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.storage
        .from(SPOODS_BUCKET)
        .upload(pathInBucket, bytes, {
          contentType,
          upsert: false,
          cacheControl: "3600",
        });

      if (error) {
        console.error("[upload] supabase storage error", error);
        return { error: `Couldn’t upload photo: ${error.message}` };
      }

      return { url: publicSpoodUrl(pathInBucket) };
    } catch (error) {
      console.error("[upload] supabase upload failed", error);
      return {
        error:
          "Couldn’t upload to Supabase Storage. Check SUPABASE_URL and the anon/service key on this deploy.",
      };
    }
  }

  // Local / writable environments without Supabase Storage env vars.
  try {
    const filename = `${prefix}-${Date.now()}.${safeExt}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes);
    return { url: `/uploads/${filename}` };
  } catch (error) {
    console.error("[upload] local disk unavailable and Supabase not configured", error);
    return {
      error:
        "Photo uploads need Supabase Storage. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }
}

/** Best-effort delete from the spoods bucket when the URL points there. */
export async function deleteStoredImage(url: string) {
  if (!isSupabaseConfigured()) return;

  const objectPathValue = storagePathFromPublicUrl(url);
  if (!objectPathValue) return;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(SPOODS_BUCKET)
      .remove([objectPathValue]);
    if (error) {
      console.warn("[upload] supabase delete failed", error.message);
    }
  } catch (error) {
    console.warn("[upload] supabase delete threw", error);
  }
}
