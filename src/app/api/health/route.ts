import { NextResponse } from "next/server";

/** Public readiness probe — booleans only, never secret values. */
export async function GET() {
  const authSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  const databaseUrl = Boolean(process.env.DATABASE_URL);
  const directUrl = Boolean(process.env.DIRECT_URL);
  const authUrl = Boolean(process.env.AUTH_URL || process.env.NEXTAUTH_URL);
  const supabaseUrl = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  );
  const supabaseKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY,
  );

  const ok = authSecret && databaseUrl;

  return NextResponse.json(
    {
      ok,
      env: {
        AUTH_SECRET: authSecret,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrl,
        AUTH_URL: authUrl,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_KEY: supabaseKey,
      },
      hint: ok
        ? null
        : "Set missing env vars in Vercel → Project → Settings → Environment Variables, then Redeploy.",
    },
    { status: ok ? 200 : 503 },
  );
}
