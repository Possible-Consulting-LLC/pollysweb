import { NextResponse } from "next/server";

/** Public readiness probe — booleans only, never secret values. */
export async function GET() {
  const authSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  const databaseUrl = Boolean(process.env.DATABASE_URL);
  const directUrl = Boolean(process.env.DIRECT_URL);
  const authUrl = Boolean(process.env.AUTH_URL || process.env.NEXTAUTH_URL);

  const ok = authSecret && databaseUrl;

  return NextResponse.json(
    {
      ok,
      env: {
        AUTH_SECRET: authSecret,
        DATABASE_URL: databaseUrl,
        DIRECT_URL: directUrl,
        AUTH_URL: authUrl,
      },
      hint: ok
        ? null
        : "Set missing env vars in Vercel → Project → Settings → Environment Variables, then Redeploy.",
    },
    { status: ok ? 200 : 503 },
  );
}
