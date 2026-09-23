import { resolveRequestIdentity } from '@/lib/admin/test-session-store';
import { hasMaintenanceBypass } from '@/lib/admin/maintenance-access';
import { TestContextError } from '@/lib/admin/test-session';

export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const identity = await resolveRequestIdentity();
    const bypass = identity ? await hasMaintenanceBypass(identity) : false;
    return Response.json({ bypass, testContextChanged: false }, { headers });
  } catch (error) {
    return Response.json({ bypass: false, testContextChanged: error instanceof TestContextError }, { headers });
  }
}
