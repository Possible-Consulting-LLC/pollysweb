'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { setAnnouncementAction, setMaintenanceAction } from '@/app/actions/admin-maintenance';
import { siteStatusChannel } from '@/lib/site-status-channel';
import type { PublicSiteStatus } from '@/lib/site-status-model';

type State = { version: number; mode: 'open' | 'countdown' | 'active'; deadline: string | null; announcementEnabled: boolean; announcement: string };
export function MaintenanceControls({ state, environment, timezone }: { state: State; environment: string; timezone: string }) {
  const router = useRouter();
  const [message, setMessage] = useState(state.announcement);
  const [enabled, setEnabled] = useState(state.announcementEnabled);
  const [liveStatus, setLiveStatus] = useState<PublicSiteStatus | null>(null);
  useEffect(() => siteStatusChannel.subscribe(setLiveStatus), []);
  const mode = liveStatus?.mode ?? state.mode;
  const deadlineIso = liveStatus ? liveStatus.deadline : state.deadline;
  const deadline = deadlineIso ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date(deadlineIso)) : null;
  const operation = mode === 'open' ? 'start' : mode === 'countdown' ? 'cancel' : 'reopen';
  const control = operation === 'start' ? { label: 'Start maintenance', confirmation: 'START MAINTENANCE', description: `Start a one-minute save window on ${environment}. Existing users can save until the deadline. New app operations are blocked afterward.` }
    : operation === 'cancel' ? { label: 'Cancel maintenance', confirmation: 'CANCEL MAINTENANCE', description: `Clear the pending deadline on ${environment} and keep the site open.` }
      : { label: 'Reopen site', confirmation: 'REOPEN SITE', description: `Clear the maintenance deadline on ${environment} after service recovery. This explicitly reopens app operations.` };
  async function saveAnnouncement(form: FormData) {
    const result = await setAnnouncementAction(form);
    if ('success' in result && result.success) router.refresh();
    return result;
  }
  return <div className="space-y-6">
    <header className="space-y-2"><h2 className="text-2xl font-semibold">Maintenance</h2>
      <p>Environment: <strong>{environment}</strong>. All times below use your administrator timezone, <strong>{timezone}</strong>.</p>
      <p>Current status: <strong>{mode === 'open' ? 'Open' : mode === 'countdown' ? 'Save window' : 'Maintenance active'}</strong>.</p>
      {deadline ? <p>Expected maintenance deadline: <time dateTime={deadlineIso!}>{deadline}</time>.</p> : <p>Starting maintenance sets a one-minute save window from the confirmed start.</p>}
    </header>
    <section aria-labelledby="announcement-heading" className="space-y-3 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] p-4 sm:p-6">
      <h3 id="announcement-heading" className="text-xl font-semibold">Upcoming-maintenance announcement</h3>
      <p>This announcement is separate from the save window. Editing it never starts maintenance.</p>
      <MutationForm action={saveAnnouncement} className="space-y-3"><MutationContextInput />
        <input type="hidden" name="version" value={state.version} />
        <label className="flex items-center gap-2"><input type="checkbox" name="enabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Show announcement</label>
        <label className="grid gap-1" htmlFor="maintenance-announcement">Announcement text
          <textarea id="maintenance-announcement" name="announcement" value={message} onChange={event => setMessage(event.target.value)} maxLength={500} rows={4} className="w-full rounded-xl border border-[var(--plum)]/30 bg-[var(--card-solid)] p-3" />
        </label>
        <div aria-label="Announcement preview" className="rounded-xl border border-dashed border-[var(--plum)]/30 p-3">
          <p className="text-sm font-semibold">Preview · {enabled ? 'on' : 'off'}</p>
          <p>{enabled ? message.trim() || 'Enter announcement text to preview it.' : 'The announcement is hidden from visitors.'}</p>
        </div>
        <button type="submit" className="rounded-xl bg-[var(--plum)] px-4 py-2 font-semibold text-[var(--on-accent)]">Save announcement</button>
      </MutationForm>
    </section>
    <section aria-labelledby="control-heading" className="space-y-3 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] p-4 sm:p-6">
      <h3 id="control-heading" className="text-xl font-semibold">Site control</h3>
      <ConfirmAction label={control.label} description={control.description} confirmation={control.confirmation} fields={{ version: state.version }} action={setMaintenanceAction.bind(null, operation)} onSuccess={() => router.refresh()} />
    </section>
  </div>;
}
