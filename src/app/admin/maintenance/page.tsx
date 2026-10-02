import type { ComponentType, ReactNode } from 'react';
import { requireAdminActor } from '@/lib/admin/actor';
import { readMaintenanceState } from '@/lib/admin/maintenance-state';
import { maintenanceMode } from '@/lib/admin/maintenance-policy';
import { getAdminReportingPreferences } from '@/lib/admin/reporting';
import { adminEnvironment } from '@/lib/admin/presentation';
import { MaintenanceControls } from '@/components/admin/maintenance-controls';
import type { MutationFormAction } from '@/components/mutation-form';

type MutationFormProps = { action?: MutationFormAction; className?: string; children?: ReactNode };
let MutationFormComp: ComponentType<MutationFormProps> = 'form' as unknown as ComponentType<MutationFormProps>;
let MutationContextInputComp: ComponentType<Record<string, unknown>> = 'input' as unknown as ComponentType<Record<string, unknown>>;
let setFeatureTelemetrySinkAction: MutationFormAction | undefined = undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  MutationFormComp = require('@/components/mutation-form').MutationForm;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  MutationContextInputComp = require('@/components/mutation-context').MutationContextInput;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  setFeatureTelemetrySinkAction = require('./actions').setFeatureTelemetrySink;
} catch {
  // sandbox in shell.test.ts
}

export const dynamic = 'force-dynamic';
export default async function MaintenanceAdminPage() {
  await requireAdminActor('super_admin');
  const [state, { timezone }] = await Promise.all([readMaintenanceState(), getAdminReportingPreferences()]);
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
        <MutationFormComp action={setFeatureTelemetrySinkAction} className="space-y-3">
          <MutationContextInputComp />
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
        </MutationFormComp>
      </section>
    </div>
  );
}
