import { getAdminDateFormatter } from '@/lib/admin/reporting';
import Link from 'next/link';
import { searchAccounts, type AccountSearchFilters } from '@/lib/admin/accounts';
import { Card } from '@/components/ui/card';

const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : undefined;
export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const boolean = (key: string) => one(params[key]) === 'yes' ? true : one(params[key]) === 'no' ? false : undefined;
  const filters: AccountSearchFilters = { query: one(params.q),
    role: ['user', 'admin', 'super_admin'].includes(one(params.role) ?? '') ? one(params.role) as AccountSearchFilters['role'] : undefined,
    demo: boolean('demo'), verified: boolean('verified'), suspended: boolean('suspended'),
    plan: ['free', 'pro'].includes(one(params.plan) ?? '') ? one(params.plan) as 'free' | 'pro' : undefined,
    cursor: one(params.cursorAt) && one(params.cursorId) ? { createdAt: one(params.cursorAt)!, id: one(params.cursorId)! } : undefined };
  const result = await searchAccounts(filters);
  const { dates, timezone } = await getAdminDateFormatter();
  const next = new URLSearchParams();
  for (const key of ['q', 'role', 'demo', 'verified', 'suspended', 'plan']) { const v = one(params[key]); if (v) next.set(key, v); }
  if (result.nextCursor) { next.set('cursorAt', result.nextCursor.createdAt); next.set('cursorId', result.nextCursor.id); }
  return <><div><h2 className="text-2xl font-semibold">Accounts</h2><p>Search current account records. Login activity is not shown because it is not recorded. Times in {timezone}.</p></div>
    <Card><form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm sm:col-span-2">Name or email<input name="q" maxLength={254} defaultValue={filters.query} className="rounded-xl border border-[var(--plum)]/25 p-2" /></label>
      {([['role', 'Role', ['', 'Any role'], ['user', 'User'], ['admin', 'Admin'], ['super_admin', 'Super admin']],
        ['demo', 'Demo', ['', 'Any'], ['yes', 'Demo'], ['no', 'Ordinary']],
        ['verified', 'Email', ['', 'Any'], ['yes', 'Verified'], ['no', 'Unverified']],
        ['suspended', 'Suspension', ['', 'Any'], ['yes', 'Suspended'], ['no', 'Active']],
        ['plan', 'Current entitlement', ['', 'Any'], ['free', 'Free'], ['pro', 'Pro']]] as const).map(([name, label, ...options]) =>
          <label key={name} className="grid gap-1 text-sm">{label}<select name={name} defaultValue={one(params[name]) ?? ''} className="rounded-xl border border-[var(--plum)]/25 p-2">
            {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>)}
      <div className="flex items-end gap-3"><button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">Search</button><Link href="/admin/accounts" className="p-2 underline">Clear</Link></div>
    </form></Card>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Matching accounts</caption>
      <thead><tr>{['Account', 'Access', 'Entitlement', 'Joined', 'Care records'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
      <tbody>{result.items.map(account => <tr key={account.id} className="border-t border-[var(--plum)]/15">
        <td className="p-3"><Link href={`/admin/accounts/${account.id}`} className="font-semibold underline">{account.name || 'Unnamed account'}</Link><br /><span>{account.email}</span></td>
        <td className="p-3">{account.role}{account.isDemo ? ' · demo' : ''}{account.suspendedAt ? ' · suspended' : ''}{account.emailVerified ? ' · verified' : ' · unverified'}</td>
        <td className="p-3">{account.entitlement === 'pro' ? 'Pro' : 'Free'}{account.subscriptionStatus ? ` · ${account.subscriptionStatus}` : ''}</td>
        <td className="p-3"><time dateTime={account.createdAt.toISOString()}>{dates.format(account.createdAt)}</time></td>
        <td className="p-3">{account._count.spiders} spoods · {account._count.careDays} care days</td>
      </tr>)}</tbody></table></div>
    {!result.items.length ? <p>No accounts match these filters.</p> : null}
    {result.nextCursor ? <Link href={`/admin/accounts?${next}`} className="underline">Next page</Link> : null}
  </>;
}
