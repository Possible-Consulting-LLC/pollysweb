import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { queryAudit } from '@/lib/admin/audit';
import { adminTimezone } from '@/lib/admin/presentation';
import { prisma } from '@/lib/db';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { cleanupAuditAction } from './actions';
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireAdminActor('admin');
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === 'string' ? (params[key] as string).slice(0, 128) : undefined;
  const filters = { actorId: text('actorId'), targetId: text('targetId'), action: text('action') };
  const cursorId = text('cursorId'), cursorAt = text('cursorAt');
  const cursor = cursorId && cursorAt && Number.isFinite(new Date(cursorAt).getTime()) ? { id: cursorId, createdAt: cursorAt } : undefined;
  const [result, preferences] = await Promise.all([
    queryAudit(prisma, { ...filters, cursor }),
    prisma.user.findUnique({ where: { id: actor.id }, select: { timezone: true } }),
  ]);
  const { timezone } = adminTimezone(preferences?.timezone);
  const dates = new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' });
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) next.set(key, value);
  if (result.nextCursor) { next.set('cursorId', result.nextCursor.id); next.set('cursorAt', result.nextCursor.createdAt); }
  return <><h2 className="text-2xl font-semibold">Audit history</h2>
    <p>Times shown in {timezone}. Events are retained for twelve months. References remain after account deletion.</p>
    <form className="flex flex-wrap items-end gap-3" method="get">
      {(['actorId', 'targetId', 'action'] as const).map(key => <label key={key} className="grid gap-1 text-sm">{key === 'actorId' ? 'Actor ID' : key === 'targetId' ? 'Target ID' : 'Action'}
        <input name={key} defaultValue={filters[key]} maxLength={128} className="rounded-lg border border-[var(--plum)]/25 p-2" /></label>)}
      <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]" type="submit">Filter</button>
      <Link href="/admin/audit" className="p-2 underline">Clear filters</Link>
    </form>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="sr-only">Administrative audit events in {timezone}</caption>
      <thead><tr>{['When', 'Actor / target', 'Action / reason', 'Changes'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
      <tbody>{result.items.map(event => <tr key={event.id} className="border-t border-[var(--plum)]/15 align-top">
        <td className="p-3"><time dateTime={event.createdAt.toISOString()}>{dates.format(event.createdAt)}</time></td>
        <td className="break-all p-3">{event.actorId}<br />{event.targetId ?? 'No target'}</td>
        <td className="p-3">{event.action}<p className="mt-1">{event.reason}</p></td>
        <td className="p-3"><pre className="whitespace-pre-wrap break-all font-sans">{JSON.stringify(event.changes, null, 2)}</pre></td>
      </tr>)}</tbody>
    </table></div>
    {result.items.length === 0 ? <p>No matching audit events.</p> : null}
    {result.nextCursor ? <Link href={`/admin/audit?${next}`} className="inline-block underline">Older events</Link> : null}
    {actor.role === 'super_admin' ? <section className="space-y-3 border-t border-[var(--plum)]/20 pt-5"><h3 className="font-semibold">Retention cleanup</h3>
      <p>Recent <Link href="/admin/reauth" className="underline">identity confirmation</Link> is required.</p>
      <ConfirmAction label="Delete expired audit events" confirmation="DELETE EXPIRED EVENTS" action={cleanupAuditAction}
        description="Permanently delete events older than twelve calendar months. A new cleanup receipt will record the count removed." />
    </section> : null}
  </>;
}
