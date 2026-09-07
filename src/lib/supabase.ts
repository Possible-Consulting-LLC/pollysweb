import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function readUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
}

/** Accept Supabase API keys only — reject S3 access-key/secret mistakes. */
function isUsableSupabaseKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return false;
  // Legacy JWT anon / service_role keys
  if (trimmed.startsWith("eyJ")) return true;
  // Newer Supabase key formats
  if (trimmed.startsWith("sb_publishable_") || trimmed.startsWith("sb_secret_")) {
    return true;
  }
  return false;
}

function readKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
  ];

  for (const candidate of candidates) {
    if (candidate && isUsableSupabaseKey(candidate)) {
      return candidate.trim();
    }
    if (candidate && !isUsableSupabaseKey(candidate)) {
      console.warn(
        "[supabase] Ignoring invalid key (looks like an S3 secret or other non-API key). Use the anon JWT from Project Settings → API (starts with eyJ…).",
      );
    }
  }
  return "";
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
  const url = readUrl();
  const key = readKey();

  if (!url || !key) {
    throw new Error(
      "Missing valid Supabase URL/key. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the anon JWT (eyJ…), not the S3 secret.",
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
  return Boolean(readUrl() && readKey());
}
