import { NextResponse } from "next/server";
import { getSupabaseKeyKind, isSupabaseConfigured } from "@/lib/supabase";

/** Public readiness probe — booleans only, never secret values. */
export async function GET() {
  const authSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  const databaseUrl = Boolean(process.env.DATABASE_URL);
  const directUrl = Boolean(process.env.DIRECT_URL);
  const authUrl = Boolean(process.env.AUTH_URL || process.env.NEXTAUTH_URL);
  const supabaseConfigured = isSupabaseConfigured();
  const supabaseKeyKind = getSupabaseKeyKind();

  const ok = authSecret && databaseUrl;

  return NextResponse.json(
    {
      ok,
      env: {
        AUTH_SECRET: authSecret,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrl,
        AUTH_URL: authUrl,
        SUPABASE_URL: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
        ),
        SUPABASE_KEY: supabaseConfigured,
        SUPABASE_KEY_KIND: supabaseKeyKind,
      },
      hint: ok
        ? supabaseConfigured
          ? null
          : "Photo uploads need NEXT_PUBLIC_SUPABASE_ANON_KEY set to the anon JWT (eyJ…), not an S3 secret."
        : "Set missing env vars in Vercel → Project → Settings → Environment Variables, then Redeploy.",
    },
    { status: ok ? 200 : 503 },
  );
}
