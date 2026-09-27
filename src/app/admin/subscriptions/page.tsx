import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { listEffectiveSubscriptions, listAssignablePlans, searchUsers,
  type AssignablePlanRow, type UserSummary } from '@/lib/admin/plan-assignment';
import { clampPage, parseListQuery } from '@/lib/admin/paginated-list';
import { buttonVariants, Button } from '@/components/ui/button';
import { cardClassName } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { AssignPlanWizard } from '@/components/admin/assign-plan-wizard';
import { endSubscriptionAction } from './actions';
export const dynamic = 'force-dynamic';

const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom',
  INTERNAL: 'Internal' };
const statusBadge: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-200 text-emerald-950' },
  TRIALING: { label: 'Trialing', className: 'bg-sky-200 text-sky-950' },
  PAST_DUE: { label: 'Past due', className: 'bg-amber-200 text-amber-950' },
};
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (date: Date) => date.toISOString().slice(0, 10);
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean)
  .map(word => word.charAt(0)).join('').slice(0, 2).toUpperCase();

type WizardParams = Record<string, string>;
/** URL for the subscriptions list; wizard params (when open) ride along so the
 * in-progress assignment survives list navigation. */
const subscriptionsHref = (search: string, page: number, wizard: WizardParams = {}) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page > 1) params.set('page', String(page));
  for (const [key, value] of Object.entries(wizard)) if (value) params.set(key, value);
  const query = params.toString();
  return `/admin/subscriptions${query ? `?${query}` : ''}`;
};

/** Fetch, clamp the page to the (possibly filtered) total, re-fetch when the
 * URL overshot — the plans page's pattern, generalized. */
async function paged<T extends { total: number }>(
  fetcher: (query: { search: string; page: number; pageSize: number }) => Promise<T>,
  query: { search: string; page: number; pageSize: number },
): Promise<{ data: T; page: number }> {
  const data = await fetcher(query);
  const page = clampPage(query.page, data.total, query.pageSize);
  return page === query.page
    ? { data, page }
    : { data: await fetcher({ ...query, page }), page };
}

const emptyPicker = { rows: [] as Array<{ id: string; title: string; subtitle?: string }>,
  total: 0, page: 1, pageSize: 20, search: '' };

export default async function SubscriptionsPage({ searchParams }:
  { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminActor('super_admin');
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const parsed = parseListQuery(params);
  const listQuery = { search: parsed.search, page: parsed.page, pageSize: parsed.pageSize };
  const wizardOpen = one(params.wizard) === 'open';
  const wizardUserId = one(params.user) ?? '';
  const wizardPlanId = one(params.plan) ?? '';
  const wizardOptionId = one(params.option) ?? '';
  const rawStep = Number.parseInt(one(params.step) ?? '1', 10);
  const userPickerQuery = parseListQuery({ search: params.usearch, page: params.upage });
  const planPickerQuery = parseListQuery({ search: params.psearch, page: params.ppage });

  // Wizard step from the URL, clamped to what the state supports: no keeper →
  // 1; keeper but no plan → 2; both → the requested step within 2..3.
  let step = rawStep >= 1 && rawStep <= 3 ? rawStep : 1;
  if (step > 1 && !wizardUserId) step = 1;
  if (step > 2 && !wizardPlanId) step = 2;

  const { data: subs, page: listPage } = await paged(
    query => listEffectiveSubscriptions(prisma, query), listQuery);
  const lastPage = Math.max(1, Math.ceil(subs.total / parsed.pageSize));

  // Wizard data, fetched in parallel and only for the open wizard's step.
  const wizardData = wizardOpen ? await Promise.all([
    step === 1 && !wizardUserId
      ? paged(query => searchUsers(prisma, query),
          { search: userPickerQuery.search, page: userPickerQuery.page,
            pageSize: userPickerQuery.pageSize })
      : null,
    step === 2 && !wizardPlanId
      ? paged(query => listAssignablePlans(prisma, query),
          { search: planPickerQuery.search, page: planPickerQuery.page,
            pageSize: planPickerQuery.pageSize })
      : null,
    wizardUserId ? prisma.user.findUnique({ where: { id: wizardUserId },
      select: { id: true, name: true, email: true } }) : null,
    wizardPlanId ? prisma.plan.findUnique({ where: { id: wizardPlanId },
      include: { billingOptions: true } }) : null,
  ]) : null;
  const [userList, planList, userRow, planRow] = wizardData ?? [null, null, null, null];
  // A keeper/plan that vanished between navigation and render folds the step back.
  if (step > 1 && !userRow) step = 1;
  if (step > 2 && !planRow) step = 2;

  const wizardProps = wizardData ? {
    step,
    listSearch: parsed.search,
    listPage,
    selectedUser: userRow
      ? { id: userRow.id, name: userRow.name ?? '', email: userRow.email } : null,
    selectedPlan: planRow ? { id: planRow.id, name: planRow.name,
      planType: planRow.planType,
      billingOptions: planRow.billingOptions.map(option => ({ id: option.id,
        interval: option.interval, basePriceCents: option.basePriceCents,
        active: option.active })) } : null,
    selectedOptionId: wizardOptionId,
    // Focused views keep the picker's search/page so "Change" restores the view.
    userPicker: userList
      ? { rows: userList.data.users.map((user: UserSummary) =>
          ({ id: user.id, title: user.name, subtitle: user.email })),
          total: userList.data.total, page: userList.page,
          pageSize: userPickerQuery.pageSize, search: userPickerQuery.search }
      : { ...emptyPicker, page: userPickerQuery.page, search: userPickerQuery.search },
    planPicker: planList
      ? { rows: planList.data.plans.map((plan: AssignablePlanRow) =>
          ({ id: plan.id, title: plan.name,
            subtitle: `${typeLabel[plan.planType] ?? plan.planType} · ${plan.billingOptions.length} option${plan.billingOptions.length === 1 ? '' : 's'}` })),
          total: planList.data.total, page: planList.page,
          pageSize: planPickerQuery.pageSize, search: planPickerQuery.search }
      : { ...emptyPicker, page: planPickerQuery.page, search: planPickerQuery.search },
  } : null;

  // Wizard params preserved across list search/pager navigation so an
  // in-progress assignment survives re-renders of the table behind it.
  const wizardParams: WizardParams = !wizardOpen ? {} : Object.fromEntries(Object.entries({
    wizard: 'open', step: String(step), user: wizardUserId, plan: wizardPlanId,
    option: wizardOptionId, usearch: userPickerQuery.search,
    upage: userPickerQuery.page > 1 ? String(userPickerQuery.page) : '',
    psearch: planPickerQuery.search,
    ppage: planPickerQuery.page > 1 ? String(planPickerQuery.page) : '',
  }).filter(([, value]) => value !== ''));

  return <>
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Subscriptions</h2>
        <Link href={subscriptionsHref(parsed.search, listPage, { wizard: 'open', step: '1' })}
          className={buttonVariants({ variant: 'primary', size: 'md' })}>＋ Add subscription</Link>
      </div>
      <p>Assign a plan to one keeper at a time: assigning ends the prior effective subscription (marked canceled as of the effective date). Only active plans and their active billing options can be assigned. Recent <Link href="/admin/reauth" className="underline">identity confirmation</Link> is required for every change.</p>
      <p>{`${subs.total} effective subscription${subs.total === 1 ? '' : 's'} — effective only; canceled and expired rows are hidden.`}</p>
    </header>
    {wizardProps ? <AssignPlanWizard {...wizardProps} /> : null}
    <section className="space-y-3" aria-label="Current subscriptions">
      <h3 className="font-semibold">Current subscriptions</h3>
      <form method="get" className="flex flex-wrap items-end gap-3">
        {wizardOpen ? Object.entries(wizardParams).map(([key, value]) =>
          <input key={key} type="hidden" name={key} value={value} />) : null}
        <label className="grid gap-1 text-sm">Search by keeper, plan, or status
          <input name="search" defaultValue={parsed.search} maxLength={80}
            className="rounded-xl border border-[var(--plum)]/25 p-2" />
        </label>
        <Button type="submit" variant="secondary" size="sm">Search</Button>
        {parsed.search
          ? <Link href={subscriptionsHref('', 1, wizardParams)}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Clear</Link> : null}
      </form>
      {subs.rows.length === 0
        ? <p>{subs.total === 0 && parsed.search
            ? 'No subscriptions match this search.'
            : 'No effective subscriptions yet. Use ＋ Add subscription above.'}</p>
        : subs.rows.map(row => {
          const badge = statusBadge[row.status];
          const keeper = row.userName || row.userEmail || row.userId;
          return <div key={row.id} data-subscription-row={row.id}
            className={cn(cardClassName, 'flex flex-wrap items-center gap-3 p-4')}>
            <span aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-sm font-bold text-[var(--midnight)]">
              {initialsOf(keeper)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{keeper}</span>
              {row.userEmail ? <span className="block truncate text-sm opacity-70">{row.userEmail}</span> : null}
            </span>
            <span className="text-sm">
              {row.planName ?? row.planId} · {row.optionInterval
                ? (intervalLabel[row.optionInterval] ?? row.optionInterval) : '—'}
              {row.optionPriceCents === null ? '' : ` — ${price(row.optionPriceCents)}`}
            </span>
            {badge
              ? <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', badge.className)}>{badge.label}</span>
              : <span className="rounded-full border border-dashed border-[var(--lavender-deep)] px-2.5 py-1 text-xs font-semibold opacity-60">{row.status}</span>}
            <span className="text-sm opacity-70">
              since {day(row.startedAt)} · {row.renewsAt ? `renews ${day(row.renewsAt)}`
                : row.expiresAt ? `ends ${day(row.expiresAt)}` : 'no renewal'}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <Link href={subscriptionsHref(parsed.search, listPage,
                  { wizard: 'open', step: '2', user: row.userId })}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Reassign</Link>
              <MutationForm action={endSubscriptionAction} className="contents"><MutationContextInput />
                <input type="hidden" name="subscriptionId" value={row.id} />
                <Button type="submit" variant="ghost" size="sm">End</Button>
              </MutationForm>
            </span>
          </div>;
        })}
      <nav className="flex items-center gap-3" aria-label="Subscriptions pagination">
        {listPage <= 1
          ? <Button type="button" disabled variant="secondary" size="sm">Previous</Button>
          : <Link href={subscriptionsHref(parsed.search, listPage - 1, wizardParams)}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Previous</Link>}
        <span>Page {listPage} of {lastPage}</span>
        {listPage >= lastPage
          ? <Button type="button" disabled variant="secondary" size="sm">Next</Button>
          : <Link href={subscriptionsHref(parsed.search, listPage + 1, wizardParams)}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Next</Link>}
      </nav>
    </section>
  </>;
}