import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { listPlans, type PlanSummary } from '@/lib/admin/plans';
import { clampPage, parseListQuery } from '@/lib/admin/paginated-list';
import { FEATURE_REGISTRY } from '@/lib/features/registry';
import { buttonVariants, Button } from '@/components/ui/button';
import { cardClassName } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { deletePlanAction, duplicatePlanAction, reorderPlanAction } from './actions';
export const dynamic = 'force-dynamic';

const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom', INTERNAL: 'Internal' };
const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** Row toggles preserve search/page; pager links drop `open` (paging folds the accordion). */
const listHref = (search: string, page: number, open?: string) =>
  `/admin/plans?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page),
    ...(open ? { open } : {}) })}`;

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={cn(cardClassName, 'space-y-2 p-4')}>
    <h3 className="text-sm font-semibold text-[var(--plum)]">{title}</h3>
    {children}
  </div>;
}

function PlanDetail({ plan, index, search, page }: { plan: PlanSummary; index: number;
  search: string; page: number }) {
  return <div className="space-y-3 border-t border-[var(--plum)]/10 p-4 pt-4">
    <div className="grid gap-3 md:grid-cols-3">
      <DetailCard title="Identity">
        <p>Type: {typeLabel[plan.planType] ?? plan.planType}</p>
        <p>Active: {plan.active ? 'Yes' : 'No'}</p>
        <p>Public: {plan.public
          ? 'Yes — appears on public pricing (future phase)'
          : 'No — assignable only'}</p>
        <p>Spood allowance: {plan.maxSpiders === null ? 'Unlimited' : plan.maxSpiders}</p>
        {plan.description ? <p>{plan.description}</p> : null}
      </DetailCard>
      <DetailCard title="Billing options">
        {plan.billingOptions.length === 0
          ? <p>None</p>
          : plan.billingOptions.map(option => <p key={option.id}>
              {intervalLabel[option.interval] ?? option.interval} {price(option.basePriceCents)}{option.active ? '' : ' (inactive)'}
            </p>)}
      </DetailCard>
      <DetailCard title="Usage">
        <p>Enabled features: {plan.enabledFeatureCount} of {FEATURE_REGISTRY.length}</p>
        <p>Effective subscriptions: {plan.subscriptionCount}</p>
        <p>Last updated: {plan.updatedAt.toISOString().slice(0, 10)}</p>
      </DetailCard>
    </div>
    <div className="flex flex-wrap gap-3">
      <Link href={`/admin/plans/${plan.id}/edit`} className={buttonVariants({ variant: 'primary', size: 'md' })}>Edit plan</Link>
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
  </div>;
}

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
    {plans.map((plan, index) => {
      const isOpen = plan.id === openId;
      return <div key={plan.id} className={cn(cardClassName, 'space-y-3')}>
        {/* Row toggle: a real link keeps Tab/Enter keyboard operability, and the
            single-open state lives in the URL so back/forward and deep links work. */}
        <Link href={isOpen ? listHref(parsed.search, page) : listHref(parsed.search, page, plan.id)}
          className="flex flex-wrap items-center gap-3 p-4" aria-expanded={isOpen}>
          <ChevronDown aria-hidden="true"
            className={cn('h-5 w-5 shrink-0 text-[var(--plum)] transition-transform', isOpen && 'rotate-180')} />
          <span className="min-w-0">
            <span className="block font-semibold">{plan.name}</span>
            {plan.description ? <span className="block text-sm text-[var(--midnight)]/60">{plan.description}</span> : null}
          </span>
          <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">{typeLabel[plan.planType] ?? plan.planType}</span>
            {plan.active
              ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Active</span>
              : <span className="rounded-full px-2.5 py-1 text-xs font-semibold opacity-60">Inactive</span>}
            {plan.public
              ? <span className="rounded-full bg-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-950">Public</span>
              : <span className="rounded-full border border-dashed border-[var(--lavender-deep)] px-2.5 py-1 text-xs font-semibold opacity-60">Private</span>}
          </span>
          <span className="w-full text-sm opacity-70 md:w-auto md:text-right">
            {plan.maxSpiders === null ? 'Unlimited' : `${plan.maxSpiders} spoods`} ·
            {' '}{plan.enabledFeatureCount} features · {plan.subscriptionCount} subscriber{plan.subscriptionCount === 1 ? '' : 's'} ·
            {' '}updated {plan.updatedAt.toISOString().slice(0, 10)}
          </span>
        </Link>
        {isOpen ? <PlanDetail plan={plan} index={index} search={parsed.search} page={page} /> : null}
      </div>;
    })}
    <nav className="flex items-center gap-3" aria-label="Plans pagination">
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
