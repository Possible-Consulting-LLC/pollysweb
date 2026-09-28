import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { listEffectiveSubscriptions, listAssignablePlans, searchUsers,
  type AssignablePlanRow, type UserSummary } from '@/lib/admin/plan-assignment';
import { clampPage, parseListQuery } from '@/lib/admin/paginated-list';
import { buttonVariants } from '@/components/ui/button';
import { AssignPlanWizard } from '@/components/admin/assign-plan-wizard';
import { SubscriptionsList } from '@/components/admin/subscriptions-list';
export const dynamic = 'force-dynamic';

const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom',
  INTERNAL: 'Internal' };
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

  // Wizard step from the URL, clamped to what the state supports: the
  // plan/option are URL-owned (no plan → step 2), but the keeper batch is
  // client-owned (the tray) — the view folds any step beyond 1 back to step 1
  // when its batch is empty, so the page no longer gates steps on `user`.
  let step = rawStep >= 1 && rawStep <= 3 ? rawStep : 1;
  if (step > 2 && !wizardPlanId) step = 2;

  const { data: subs, page: listPage } = await paged(
    query => listEffectiveSubscriptions(prisma, query), listQuery);
  const lastPage = Math.max(1, Math.ceil(subs.total / parsed.pageSize));

  // Wizard data, fetched in parallel: the keeper picker page is always served
  // while the wizard is open (the view's empty-batch clamp can land on step 1
  // from any URL state), the plan picker only for the plan step, and the
  // Reassign preselect's row for the tray seed.
  const wizardData = wizardOpen ? await Promise.all([
    paged(query => searchUsers(prisma, query),
      { search: userPickerQuery.search, page: userPickerQuery.page,
        pageSize: userPickerQuery.pageSize }),
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
  // A vanished plan folds the step back; a vanished preselect folds to step 1.
  if (step > 2 && !planRow) step = 2;
  if (step > 1 && wizardUserId && !userRow) step = 1;

  const wizardProps = wizardData ? {
    step,
    listSearch: parsed.search,
    listPage,
    // The Reassign preselect seeds the client-owned keeper batch.
    prefilledKeepers: userRow
      ? [{ id: userRow.id, name: userRow.name ?? '', email: userRow.email }] : [],
    selectedPlan: planRow ? { id: planRow.id, name: planRow.name,
      planType: planRow.planType,
      billingOptions: planRow.billingOptions.map(option => ({ id: option.id,
        interval: option.interval, basePriceCents: option.basePriceCents,
        active: option.active })) } : null,
    selectedOptionId: wizardOptionId,
    // Focused views keep the picker's search/page so "Change" restores the view.
    // Focused views keep the picker's search/page so "Change" restores the view.
    userPicker: userList
      ? { rows: userList.data.users.map((user: UserSummary) =>
          ({ id: user.id, title: user.name, subtitle: user.email,
            leading: initialsOf(user.name || user.email),
            disabled: user.deleting })),
          total: userList.data.total, page: userList.page,
          pageSize: userPickerQuery.pageSize, search: userPickerQuery.search }
      : { ...emptyPicker, page: userPickerQuery.page, search: userPickerQuery.search },
    planPicker: planList
      ? { rows: planList.data.plans.map((plan: AssignablePlanRow) =>
          ({ id: plan.id, title: plan.name,
            subtitle: `${typeLabel[plan.planType] ?? plan.planType} · ${plan.billingOptions.length} option${plan.billingOptions.length === 1 ? '' : 's'}`,
            features: plan.features })),
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
      <p>Assign a plan to one or more keepers in a single audited batch: assigning ends each keeper&apos;s prior effective subscription (marked canceled as of the effective date). Only active plans and their active billing options can be assigned. Recent <Link href="/admin/reauth" className="underline">identity confirmation</Link> is required for every change.</p>
      <p>{`${subs.total} effective subscription${subs.total === 1 ? '' : 's'} — effective only; canceled and expired rows are hidden.`}</p>
    </header>
    {wizardProps ? <AssignPlanWizard {...wizardProps} /> : null}
    {/* The list search narrows the rendered list live (ruling 1); the URL-param
        search remains the explicit Enter fallback. Row rendering lives in the
        client island so narrowing can replace the committed rows in place. */}
    <SubscriptionsList
      rows={subs.rows.map(row => ({
        id: row.id, userId: row.userId, planId: row.planId,
        planBillingOptionId: row.planBillingOptionId, status: row.status,
        startedAt: row.startedAt.toISOString(),
        renewsAt: row.renewsAt ? row.renewsAt.toISOString() : null,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        userName: row.userName, userEmail: row.userEmail, planName: row.planName,
        optionInterval: row.optionInterval, optionPriceCents: row.optionPriceCents,
      }))}
      total={subs.total} search={parsed.search} page={listPage}
      pageSize={parsed.pageSize} lastPage={lastPage} wizardParams={wizardParams} />
  </>;
}