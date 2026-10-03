import { requireAdminActor } from '@/lib/admin/actor';
import { readMaintenanceState } from '@/lib/admin/maintenance-state';
import { maintenanceMode } from '@/lib/admin/maintenance-policy';
import { getAdminReportingPreferences } from '@/lib/admin/reporting';
import { adminEnvironment } from '@/lib/admin/presentation';
import { MaintenanceControls } from '@/components/admin/maintenance-controls';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { setFeatureTelemetrySinkAction } from '@/app/actions/admin-maintenance';
import { prisma } from '@/lib/db';
import { checkFeatureReleaseReadiness, type FeatureReleaseReadiness } from '@/lib/features/release-preflight';

async function releaseReadiness(): Promise<FeatureReleaseReadiness> {
  try {
    return await checkFeatureReleaseReadiness(prisma);
  } catch (error) {
    console.error('feature-release-preflight', error);
    return { ok: false, problems: ['The release preflight could not read the database.'] };
  }
}

export const dynamic = 'force-dynamic';
export default async function MaintenanceAdminPage() {
  await requireAdminActor('super_admin');
  const [state, { timezone }, readiness] = await Promise.all([readMaintenanceState(), getAdminReportingPreferences(), releaseReadiness()]);
  const currentSink = (state as { featureTelemetrySink?: string }).featureTelemetrySink ?? 'off';

  return (
    <div className="space-y-6">
      <MaintenanceControls state={{
        version: state.version, mode: maintenanceMode(state, new Date()), deadline: state.deadline?.toISOString() ?? null,
        announcementEnabled: state.announcementEnabled, announcement: state.announcement,
      }} environment={adminEnvironment(process.env)} timezone={timezone} />

      <section aria-labelledby="telemetry-sink-heading" className="space-y-3 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] p-4 sm:p-6">
        <h3 id="telemetry-sink-heading" className="text-xl font-semibold">Feature telemetry sink</h3>
        <p className="text-sm text-[var(--muted)]">Route feature-flag exposure events to an external analytics sink or keep collection disabled.</p>
        <MutationForm action={setFeatureTelemetrySinkAction} className="space-y-3">
          <MutationContextInput />
          <input type="hidden" name="version" value={state.version} />
          <label className="flex items-center gap-3 text-sm">
            <span className="font-medium">Telemetry sink:</span>
            <select
              name="sink"
              defaultValue={currentSink}
              className="rounded-xl border border-[var(--plum)]/30 bg-[var(--card-solid)] p-2 font-medium"
            >
              <option value="off">Off</option>
              <option value="posthog">PostHog</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[var(--plum)] px-4 py-2 font-semibold text-[var(--on-accent)]"
          >
            Save telemetry sink
          </button>
        </MutationForm>
        <div role="status" aria-label="Feature release preflight" className="space-y-1 border-t border-[var(--plum)]/15 pt-3 text-sm">
          <p className="font-medium">
            Feature release preflight: {readiness.ok ? 'ready' : `${readiness.problems.length} problem${readiness.problems.length === 1 ? '' : 's'}`}
          </p>
          {readiness.ok ? null : (
            <ul className="list-disc space-y-0.5 pl-5 text-[var(--muted)]">
              {readiness.problems.map(problem => <li key={problem}>{problem}</li>)}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
