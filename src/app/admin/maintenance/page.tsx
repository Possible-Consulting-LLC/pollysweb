import { requireAdminActor } from '@/lib/admin/actor';
import { readMaintenanceState } from '@/lib/admin/maintenance-state';
import { maintenanceMode } from '@/lib/admin/maintenance-policy';
import { getAdminReportingPreferences } from '@/lib/admin/reporting';
import { adminEnvironment } from '@/lib/admin/presentation';
import { MaintenanceControls } from '@/components/admin/maintenance-controls';

export const dynamic = 'force-dynamic';
export default async function MaintenanceAdminPage() {
  await requireAdminActor('super_admin');
  const [state, { timezone }] = await Promise.all([readMaintenanceState(), getAdminReportingPreferences()]);
  return <MaintenanceControls state={{
    version: state.version, mode: maintenanceMode(state, new Date()), deadline: state.deadline?.toISOString() ?? null,
    announcementEnabled: state.announcementEnabled, announcement: state.announcement,
  }} environment={adminEnvironment(process.env)} timezone={timezone} />;
}
