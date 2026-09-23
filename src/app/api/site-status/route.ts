import { readMaintenanceState } from '@/lib/admin/maintenance-state';
import { publicSiteStatus, maintenanceResponse } from '@/lib/admin/maintenance-policy';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const state = await readMaintenanceState();
    return Response.json(publicSiteStatus(state, new Date()), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return maintenanceResponse(); }
}
