import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { TimezoneSelect } from '@/components/ui/datetime-field';
import { saveReportingTimezoneAction } from './actions';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminAccessError, requireAdminActor } from '@/lib/admin/actor';
import { TestContextError } from '@/lib/admin/test-session';
import { adminEnvironment, adminTimezone } from '@/lib/admin/presentation';
import { prisma } from '@/lib/db';
import { AdminNav } from '@/components/admin/nav';
export const dynamic = 'force-dynamic';
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminActor('admin').catch(error => { if (error instanceof MaintenanceError) redirect('/maintenance'); if (error instanceof AdminAccessError || error instanceof TestContextError) notFound(); throw error; });
  const preferences = await prisma.user.findUnique({ where: { id: actor.id }, select: { timezone: true } });
  const { timezone, fallback } = adminTimezone(preferences?.timezone);
  return <div data-site-protected className="mx-auto min-h-dvh max-w-7xl px-4 py-6 sm:px-8">
    <a href="#admin-content" className="sr-only focus:not-sr-only">Skip to administration content</a>
    <header className="mb-6 space-y-2 border-b border-[var(--plum)]/20 pb-4">
      <p className="inline-block rounded-lg bg-[var(--plum)] px-3 py-1 font-semibold text-[var(--on-accent)]">{adminEnvironment(process.env)}</p>
      <h1 className="text-3xl font-semibold">Spoodly Space administration</h1>
      <p className="text-sm">Reporting timezone: {timezone}{fallback ? ' (UTC fallback — preference not set)' : ''} · <Link href="/settings" className="underline">Change my timezone</Link></p>
      {fallback ? <section className="max-w-xl space-y-3 rounded-xl border border-[var(--plum)]/25 p-3" aria-label="Choose your reporting timezone">
        <p role="status" className="text-sm">Choose your reporting timezone. Your browser’s timezone is preselected; save it to apply it to all administrative dates.</p>
        <MutationForm action={saveReportingTimezoneAction} className="space-y-3"><MutationContextInput />
          <TimezoneSelect id="admin-timezone" defaultValue="" />
          <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">Save my reporting timezone</button>
        </MutationForm>
      </section> : null}
    </header>
    <div className="flex flex-col gap-6 md:flex-row"><AdminNav role={actor.role as 'admin' | 'super_admin'} />
      <main id="admin-content" className="min-w-0 flex-1 space-y-6">{children}</main>
    </div>
  </div>;
}
