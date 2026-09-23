import Link from 'next/link';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { AdminMetricsView } from '@/components/admin/metrics';
import { reportingPeriod } from '@/lib/admin/analytics-period';
import { getAdminReportingPreferences, loadAdminMetrics } from '@/lib/admin/reporting';
import { refreshMetricsAction } from './actions';

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { timezone } = await getAdminReportingPreferences();
  const params = await searchParams;
  if (params.days !== undefined && params.days !== '7' && params.days !== '14') {
    return <><h2 className="text-2xl font-semibold">Overview</h2><p role="alert">Choose a seven or fourteen day reporting period.</p><Link href="/admin" className="underline">Reset reporting filters</Link></>;
  }
  const days = params.days === '14' ? 14 : 7;
  const includeDemo = params.includeDemo === 'yes';
  const period = reportingPeriod(timezone, days, new Date());
  const metrics = await loadAdminMetrics(period, includeDemo);
  return <>
    <h2 className="text-2xl font-semibold">Overview and engagement</h2>
    <div className="flex flex-wrap items-end gap-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Reporting period · {timezone}
          <select name="days" defaultValue={days} className="rounded-xl border border-[var(--plum)]/25 p-2">
            <option value="7">Today + previous 6 local days</option><option value="14">Today + previous 13 local days</option>
          </select>
        </label>
        <label className="py-2"><input type="checkbox" name="includeDemo" value="yes" defaultChecked={includeDemo} /> Include demo activity</label>
        <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">Apply filters</button>
      </form>
      <MutationForm action={refreshMetricsAction}><MutationContextInput />
        <input type="hidden" name="days" value={days} /><input type="hidden" name="includeDemo" value={includeDemo ? 'yes' : 'no'} />
        <button className="rounded-xl border border-[var(--plum)]/25 px-4 py-2">Refresh metrics</button>
      </MutationForm>
    </div>
    <AdminMetricsView metrics={metrics} period={period} includeDemo={includeDemo} />
    <p className="text-sm">Use <Link href="/settings" className="underline">My settings</Link> for your own preferences or <Link href="/admin/reauth" className="underline">confirm your identity</Link> before sensitive actions.</p>
  </>;
}
