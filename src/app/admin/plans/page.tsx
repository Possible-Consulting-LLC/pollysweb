import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { listPlans, type BillingInterval, type PlanType } from '@/lib/admin/plans';
import { clampPage, parseListQuery } from '@/lib/admin/paginated-list';
import { buttonVariants, Button } from '@/components/ui/button';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { Card } from '@/components/ui/card';
import { deletePlanAction, duplicatePlanAction, reorderPlanAction } from './actions';
export const dynamic = 'force-dynamic';

const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom', INTERNAL: 'Internal' };
const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pageHref = (search: string, page: number) =>
  `/admin/plans?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page) })}`;

export default async function PlansPage({ searchParams }:
  { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminActor('super_admin');
  const parsed = parseListQuery(await searchParams);
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
      <p>{total} plan{total === 1 ? '' : 's'}{parsed.search ? ' matching the search' : ''}</p>
    </header>
    <p><Link href="/admin/plans/new" className={buttonVariants({ variant: 'primary', size: 'md' })}>Create a plan</Link></p>
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">Search by name
        <input name="search" defaultValue={parsed.search} maxLength={80}
          className="rounded-xl border border-[var(--plum)]/25 p-2" />
      </label>
      <Button type="submit" variant="secondary" size="sm">Search</Button>
      {parsed.search ? <Link href="/admin/plans" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Clear</Link> : null}
    </form>
    {plans.length === 0
      ? <p>{total === 0 && parsed.search ? 'No plans match this search.' : 'No plans yet. Create the first plan to start the catalog.'}</p>
      : null}
    {plans.map((plan, index) => <Card key={plan.id} className="space-y-3">
      <Link href={`/admin/plans/${plan.id}`} className="block space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{plan.name}</h3>
          <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">{typeLabel[plan.planType] ?? plan.planType}</span>
          {plan.active
            ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Active</span>
            : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Inactive</span>}
          {plan.public
            ? <span className="rounded-full bg-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-950">Public</span>
            : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Not public</span>}
        </div>
        {plan.description ? <p>{plan.description}</p> : null}
        <p className="text-sm">
          Spood allowance: {plan.maxSpiders === null ? 'Unlimited' : plan.maxSpiders} ·
          {' '}Billing options: {plan.billingOptionCount} ({plan.billingOptions.map(option =>
            `${intervalLabel[option.interval] ?? option.interval} ${price(option.basePriceCents)}${option.active ? '' : ' (inactive)'}`).join(', ') || 'none'}) ·
          {' '}Enabled features: {plan.enabledFeatureCount} ·
          {' '}Subscriptions: {plan.subscriptionCount} ·
          {' '}Updated {plan.updatedAt.toISOString().slice(0, 10)}
        </p>
      </Link>
      <div className="flex flex-wrap gap-3">
        <Link href={`/admin/plans/${plan.id}/edit`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Edit</Link>
        <MutationForm action={duplicatePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <Button variant="secondary" size="sm">Duplicate</Button>
        </MutationForm>
        <MutationForm action={deletePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <Button variant="danger" size="sm">Delete or deactivate</Button>
        </MutationForm>
        <MutationForm action={reorderPlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <input type="hidden" name="direction" value={index === 0 ? 'down' : 'up'} />
          <Button variant="ghost" size="sm">Move {index === 0 ? 'down' : 'up'}</Button>
        </MutationForm>
      </div>
    </Card>)}
    <nav className="flex items-center gap-3" aria-label="Plans pagination">
      {page <= 1
        ? <Button type="button" disabled variant="secondary" size="sm">Previous</Button>
        : <Link href={pageHref(parsed.search, page - 1)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Previous</Link>}
      <span>Page {page} of {lastPage}</span>
      {page >= lastPage
        ? <Button type="button" disabled variant="secondary" size="sm">Next</Button>
        : <Link href={pageHref(parsed.search, page + 1)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Next</Link>}
    </nav>
  </>;
}
