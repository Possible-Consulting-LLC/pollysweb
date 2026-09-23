import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { STORY_REWARDS, STREAK_REWARDS } from '@/lib/constellation';
import { reportingDayKey, type ReportingPeriod } from '@/lib/admin/analytics-period';
import type { AdminMetrics } from '@/lib/admin/metrics';

const careNames: Record<string, string> = {
  feeding: 'Feeding', misting: 'Misting', molt: 'Molt', observation: 'Observation (including play)',
  bodyCondition: 'Body condition', enclosureMaintenance: 'Enclosure maintenance',
};
const badgeNames = [
  ...STREAK_REWARDS.map(reward => ({ id: `streak-${reward.days}`, title: reward.title })),
  ...STORY_REWARDS.map(reward => ({ id: reward.id, title: reward.title })),
];

export function AdminMetricsView({ metrics, period, includeDemo }: { metrics: AdminMetrics; period: ReportingPeriod; includeDemo: boolean }) {
  const dates = new Intl.DateTimeFormat('en-US', { timeZone: period.zone, dateStyle: 'medium', timeStyle: 'short' });
  const lastDay = reportingDayKey(period.end, period.zone);
  const maximum = Math.max(1, ...metrics.perDayCounts.flatMap(day => [day.registrations, day.care]));
  const slot = 640 / metrics.perDayCounts.length;
  const cards = [
    ['Total accounts', metrics.totals.accounts], ['Ordinary / non-demo accounts', metrics.totals.ordinaryAccounts],
    ['Demo accounts', metrics.totals.demoAccounts], ['Active spoods', metrics.totals.activeSpoods],
    ['Memorialized spoods', metrics.totals.memorializedSpoods], ['Effective Free', metrics.totals.effectiveFree],
    ['Effective Pro', metrics.totals.effectivePro], ['Paying customers (recorded active Stripe)', metrics.totals.payingCustomers],
  ] as const;
  return <>
    <section className="space-y-3" aria-labelledby="inventory-title">
      <h3 id="inventory-title" className="text-xl font-semibold">Current inventory · all accounts</h3>
      <p className="text-sm">Includes demo accounts. Effective plans include demo overrides and manual Pro. Paying customers counts recorded active Stripe subscriptions, excluding demos and trials; it is not a revenue measure or a live Stripe check.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, count]) =>
        <Card key={label}><p className="text-sm">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{count.toLocaleString('en-US')}</p></Card>)}</div>
    </section>
    <section className="space-y-4" aria-labelledby="engagement-title">
      <h3 id="engagement-title" className="text-xl font-semibold">Engagement · {period.zone}</h3>
      <p>{includeDemo ? 'Demo activity included' : 'Demo activity excluded'}. {period.partialToday ? 'Today is partial.' : 'Closed local dates.'} As of <time dateTime={metrics.generatedAt}>{dates.format(new Date(metrics.generatedAt))}</time>.</p>
      <div className="grid gap-3 sm:grid-cols-3">{[
        ['New registrations', metrics.newAccountCount], ['Distinct active keepers', metrics.activeKeeperCount], ['Care stars completed in this period', metrics.starCount],
      ].map(([label, count]) => <Card key={label}><p className="text-sm">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{count}</p></Card>)}</div>
      <p className="text-sm">Activity is current recorded history, including corrections. A keeper is active when they own at least one of the six care log types below in this interval. Future records are excluded. Photos and care-day check-ins are separate from care logs; no visits or logins are inferred.</p>
      <Card className="space-y-3">
        <h4 className="font-semibold">Daily registrations and care logs</h4>
        <p className="text-sm">Purple: registrations · teal: care logs. Exact values and full local dates are in the table.</p>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 700 230" className="min-w-[36rem] w-full" role="img" aria-label={`Daily registrations and care logs in ${period.zone}; exact counts in the following table`}>
            <text x="6" y="20" fill="currentColor" fontSize="12">{maximum}</text>
            <line x1="40" x2="685" y1="175" y2="175" stroke="currentColor" opacity="0.25" />
            {metrics.perDayCounts.map((day, index) => {
              const x = 45 + index * slot;
              return <g key={day.day}>
                <rect x={x} y={175 - day.registrations / maximum * 145} width={slot * 0.3} height={day.registrations / maximum * 145} fill="var(--plum)" />
                <rect x={x + slot * 0.32} y={175 - day.care / maximum * 145} width={slot * 0.3} height={day.care / maximum * 145} fill="#277e7b" />
                <text x={x + slot * 0.3} y="197" textAnchor="middle" fill="currentColor" fontSize="10">{day.day.slice(5)}</text>
                {period.partialToday && day.day === lastDay ? <text x={x + slot * 0.3} y="214" textAnchor="middle" fill="currentColor" fontSize="10">partial</text> : null}
              </g>;
            })}
          </svg>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <caption className="sr-only">Daily registrations and care logs in {period.zone}</caption>
          <thead><tr>{['Local date', 'Registrations', 'Care logs'].map(label => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{metrics.perDayCounts.map(day => <tr key={day.day} className="border-t border-[var(--plum)]/15">
            <th scope="row" className="p-2 font-normal">{day.day}{period.partialToday && day.day === lastDay ? ' (partial)' : ''}</th>
            <td className="p-2 tabular-nums">{day.registrations}</td><td className="p-2 tabular-nums">{day.care}</td>
          </tr>)}</tbody>
        </table></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h4 className="mb-3 font-semibold">Care by type</h4><dl className="space-y-2">{metrics.careTypeCounts.map(row =>
          <div key={row.type} className="flex justify-between gap-4"><dt>{careNames[row.type]}</dt><dd className="tabular-nums">{row.count}</dd></div>)}</dl></Card>
        <Card><h4 className="mb-3 font-semibold">Most active keepers · up to 10</h4>
          {metrics.topKeepers.length ? <ol className="space-y-2">{metrics.topKeepers.map(row => <li key={row.userId} className="flex justify-between gap-4">
            <Link className="underline" href={`/admin/accounts/${row.userId}`}>{row.name || 'Unnamed keeper'}</Link><span>{row.count} logs</span>
          </li>)}</ol> : <p>No qualifying care in this interval.</p>}
        </Card>
      </div>
    </section>
    <Card className="space-y-3">
      <h3 className="text-xl font-semibold">Current lifetime badge eligibility</h3>
      <p>Distinct eligible keepers per badge, {includeDemo ? 'including' : 'excluding'} demos. As of <time dateTime={metrics.badgesGeneratedAt}>{dates.format(new Date(metrics.badgesGeneratedAt))}</time> ({period.zone}). Cached briefly; use Refresh metrics for a fresh snapshot.</p>
      <p className="text-sm">Eligibility comes from current records, including memorialized spoods. Withdrawn care stars are excluded. Streaks preserve original keeper care-day dates; story dates use each keeper’s saved timezone (UTC if unset). These are eligible badges, not celebration notifications.</p>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">{badgeNames.map(badge => <div key={badge.id} className="flex justify-between gap-4">
        <dt>{badge.title}</dt><dd className="tabular-nums">{metrics.badgeCounts.find(row => row.id === badge.id)?.count ?? 0}</dd>
      </div>)}</dl>
    </Card>
  </>;
}
