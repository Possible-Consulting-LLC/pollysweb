import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { listPlans } from '@/lib/admin/plans';
import { clampPage, parseListQuery } from '@/lib/admin/paginated-list';
import { buttonVariants, Button } from '@/components/ui/button';
import { PlansAccordion } from '@/components/admin/plans-accordion';
export const dynamic = 'force-dynamic';

/** Row toggles preserve search/page; pager links drop `open` (paging folds the accordion). */
const listHref = (search: string, page: number) =>
  `/admin/plans?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page) })}`;

export default async function PlansPage({ searchParams }:
  { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminActor('super_admin');
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const openId = one(params.open) ?? '';
  const parsed = parseListQuery(params);
  const query = { search: parsed.search, page: parsed.page, pageSize: parsed.pageSize };
  let { plans, total } = await listPlans(prisma, query);
  // A page beyond the (possibly filtered) total re-queries the last valid page.
  const page = clampPage(parsed.page, total, parsed.pageSize);
  if (page !== parsed.page) ({ plans, total } = await listPlans(prisma, { ...query, page }));
  const lastPage = Math.max(1, Math.ceil(total / parsed.pageSize));
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">Plans</h2>
      <p>Plan identity is the id; display names may repeat. Active billing options are limited to one per interval, and plans with subscription history are deactivated instead of deleted. Recent <Link href="/admin/reauth" className="underline">identity confirmation</Link> is required for every change.</p>
    </header>
    <p><Link href="/admin/plans/new" className={buttonVariants({ variant: 'primary', size: 'md' })}>Create a plan</Link></p>
    {/* Search lives in the accordion's live toolbar (mockup-exact): typing
        suggests live, Enter is the explicit full-page fallback navigation. */}
    {/* Selection state lives in the client wrapper; rows, tray, and counter render there. */}
    <PlansAccordion plans={plans} total={total} search={parsed.search} page={page} openId={openId} />
    {plans.length === 0
      ? <p>{total === 0 && parsed.search ? 'No plans match this search.' : 'No plans yet. Create the first plan to start the catalog.'}</p>
      : null}
    <nav className="mt-4 flex items-center gap-3 border-t border-[var(--hover)] pt-3.5" aria-label="Plans pagination">
      {page <= 1
        ? <Button type="button" disabled variant="secondary" size="sm">Previous</Button>
        : <Link href={listHref(parsed.search, page - 1)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Previous</Link>}
      <span>Page {page} of {lastPage}</span>
      {page >= lastPage
        ? <Button type="button" disabled variant="secondary" size="sm">Next</Button>
        : <Link href={listHref(parsed.search, page + 1)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Next</Link>}
    </nav>
  </>;
}
