import { guardServiceMaintenance } from '@/lib/admin/maintenance-access';
import { privatePhotoStorageReady } from '@/lib/supabase';
import { NextResponse } from "next/server";

/** Public readiness probe without configuration details. */
export async function GET() {
  const authSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
  const databaseUrl = Boolean(process.env.DATABASE_URL);
  let ok = authSecret && databaseUrl;
  try {
    ok = ok && await privatePhotoStorageReady();
    await guardServiceMaintenance();
  } catch { ok=false; }

  return NextResponse.json(
    { ok },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
