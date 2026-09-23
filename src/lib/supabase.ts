import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertStagingEnvironment } from "./staging-guard";
import { SPOODS_BUCKET } from "./photo-media";

let client: SupabaseClient | null = null;

function readUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
}

/** Private Storage operations require the service-role API key. */
function isServiceRoleKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("sb_secret_")) return true;
  if (trimmed.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(trimmed.split(".")[1]!, "base64url").toString("utf8")) as { role?: string };
      return payload.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}

function readKey() {
  const candidate = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return isServiceRoleKey(candidate) ? candidate : "";
}

export function getSupabaseKeyKind() {
  const key = readKey();
  if (!key) return "missing" as const;
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1]!, "base64url").toString("utf8"),
      ) as { role?: string };
      return (payload.role === "service_role" ? "service_role" : "anon") as
        | "service_role"
        | "anon";
    } catch {
      return "jwt" as const;
    }
  }
  if (key.startsWith("sb_secret_")) return "service_role" as const;
  if (key.startsWith("sb_publishable_")) return "anon" as const;
  return "unknown" as const;
}

export function getSupabaseAdmin() {
  assertStagingEnvironment();
  const url = readUrl();
  const key = readKey();

  if (!url || !key) {
    throw new Error(
      "Private photo storage requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function isSupabaseConfigured() {
  assertStagingEnvironment();
  return Boolean(readUrl() && readKey());
}

type BucketLookup = {
  getBucket(name: string): PromiseLike<{
    data: { name?: string; public?: boolean } | null;
    error: unknown;
  }>;
};

/** Readiness requires the actual bucket contract, not merely a key-shaped string. */
export async function privatePhotoStorageReady(
  storage: BucketLookup = getSupabaseAdmin().storage,
): Promise<boolean> {
  try {
    const { data, error } = await storage.getBucket(SPOODS_BUCKET);
    return !error && data?.name === SPOODS_BUCKET && data.public === false;
  } catch {
    return false;
  }
}
