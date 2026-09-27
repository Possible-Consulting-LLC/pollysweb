import type { Prisma } from '@prisma/client';
import { listPlans, type PlanSummary } from '@/lib/admin/plans';
import { isRegisteredFeatureKey } from '@/lib/features/registry';

/** Live-search narrowing services (UX Task 8 fix round 1).
 *
 * Ruling 1: typing in a search input narrows the RENDERED LIST to matches in
 * real time — the query spans ALL rows, never just the current page. Ruling 3:
 * counters stay truthful while narrowing, so every response carries the TRUE
 * match total alongside the requested page of rows.
 *
 * S13 — narrowed rows are full citizens: the features/plans services return
 * the COMMITTED pages' own row shapes (detail-rich), so the accordions render
 * narrowed rows through the same renderer as committed rows and can expand and
 * edit them in place. The picker entities (users, assignable-plans) stay lean:
 * pickers need id/title/subtitle/disabled only.
 *
 * Performance rules kept: one grouped query set per debounced typing pause
 * (~250ms), page-clamped — exactly what the committed page's own query costs;
 * never per-keystroke waste. Plans literally reuse the committed page's
 * listPlans query; features mirror the features page's grouped pattern (count
 * + page select + total plan count in one parallel pass, then ONE grouped
 * assignments query for the page's rows — never per-row). */

export type Suggestion = { id: string; title: string; subtitle?: string;
  /** Deleting accounts (users entity) arrive flagged so the picker greys them. */
  disabled?: boolean };

/** The features page's own FeatureRowView shape, carried on the narrowed
 * suggestion row (id IS the feature key — the surface's selection identity).
 * `orphan` is derived from the code registry here like the features page does;
 * the client re-checks the registry at render time (same value by
 * construction) so the lock always matches the deployed code. */
export type NarrowFeatureRow = Suggestion & {
  featureId: string; key: string; name: string; description: string;
  category: string; active: boolean; orphan: boolean;
  assignedPlans: string[]; totalPlans: number;
};

/** The plans page's own PlanSummary row shape (billingOptions + counts), plus
 * the suggestion display fields. updatedAt is the ISO string the wire carries
 * (PlanSummary holds a Date server-side); the client re-hydrates new Date(). */
export type NarrowPlanRow = Suggestion &
  Omit<PlanSummary, 'updatedAt'> & { updatedAt: string };

export type NarrowingResult = { rows: Suggestion[]; total: number };

export const NARROW_DEFAULT_PAGE_SIZE = 10;
export const NARROW_MAX_PAGE_SIZE = 50;

type SuggestDb = Pick<Prisma.TransactionClient,
  'plan' | 'planBillingOption' | 'featurePlanTranslation' | 'userSubscription'
  | 'feature' | 'user'>;

export type NarrowEntity =
  | 'plans' | 'features' | 'users' | 'assignable-plans' | 'subscriptions';
export const NARROW_ENTITIES: readonly NarrowEntity[] =
  ['plans', 'features', 'users', 'assignable-plans', 'subscriptions'];

const clampPage = (page: number) => Math.max(1, Math.trunc(page) || 1);
const clampPageSize = (pageSize: number) =>
  Math.min(NARROW_MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize) || NARROW_DEFAULT_PAGE_SIZE));

/** Plans by name (case-insensitive contains), display order first — the
 * committed page's own listPlans query, so narrowed rows ARE the rows
 * /admin/plans renders (S13). */
export async function narrowPlans(tx: Pick<SuggestDb,
  'plan' | 'planBillingOption' | 'featurePlanTranslation' | 'userSubscription'>,
  search: string, page: number, pageSize: number): Promise<NarrowingResult> {
  const { plans, total } = await listPlans(tx, { search, page, pageSize });
  return { total, rows: plans.map(plan => ({
    id: plan.id, title: plan.name, subtitle: plan.planType,
    name: plan.name, description: plan.description, planType: plan.planType,
    maxSpiders: plan.maxSpiders, active: plan.active, public: plan.public,
    sortOrder: plan.sortOrder, updatedAt: plan.updatedAt.toISOString(),
    billingOptions: plan.billingOptions, billingOptionCount: plan.billingOptionCount,
    enabledFeatureCount: plan.enabledFeatureCount, subscriptionCount: plan.subscriptionCount,
  })) };
}

/** Features by name OR key (case-insensitive contains), key order. The features
 * surface selects by feature KEY, so the narrowed row id IS the key — the
 * pick path feeds the same selection map as the checkbox path. The page's own
 * grouped pattern: count + page select + total plan count in one parallel
 * pass, then ONE grouped assignments query for the page's rows. */
export async function narrowFeatures(tx: Pick<SuggestDb,
  'feature' | 'featurePlanTranslation' | 'plan'>, search: string, page: number,
  pageSize: number): Promise<NarrowingResult> {
  const where: Prisma.FeatureWhereInput = { OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { key: { contains: search, mode: 'insensitive' } },
  ] };
  const [total, rows, totalPlans] = await Promise.all([
    tx.feature.count({ where }),
    tx.feature.findMany({ where,
      select: { id: true, key: true, name: true, description: true,
        category: true, active: true },
      orderBy: { key: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    tx.plan.count(),
  ]);
  const assignments = rows.length
    ? await tx.featurePlanTranslation.findMany({
        where: { featureId: { in: rows.map(row => row.id) }, enabled: true },
        select: { featureId: true, plan: { select: { name: true } } },
      })
    : [];
  const plansByFeature = new Map<string, string[]>();
  for (const translation of assignments) {
    const names = plansByFeature.get(translation.featureId) ?? [];
    names.push(translation.plan.name);
    plansByFeature.set(translation.featureId, names);
  }
  return { total, rows: rows.map(row => ({
    id: row.key, title: row.name, subtitle: row.key,
    featureId: row.id, key: row.key, name: row.name, description: row.description,
    category: row.category, active: row.active,
    orphan: !isRegisteredFeatureKey(row.key),
    assignedPlans: (plansByFeature.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)),
    totalPlans,
  })) };
}

/** Keepers by name OR email (case-insensitive contains), name order —
 * searchUsers' where-clause. Deleting accounts are included and flagged
 * (disabled) so the narrowed picker view greys them like the committed one. */
export async function narrowUsers(tx: Pick<SuggestDb, 'user'>, search: string,
  page: number, pageSize: number): Promise<NarrowingResult> {
  const where: Prisma.UserWhereInput = { OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
  ] };
  const [total, rows] = await Promise.all([
    tx.user.count({ where }),
    tx.user.findMany({ where, select: { id: true, name: true, email: true, deletingAt: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows: rows.map(row =>
    ({ id: row.id, title: row.name ?? row.email, subtitle: row.email,
      disabled: row.deletingAt != null })) };
}

/** Active plans by name (case-insensitive contains), display order first —
 * listAssignablePlans' where-clause. */
export async function narrowAssignablePlans(tx: Pick<SuggestDb, 'plan'>, search: string,
  page: number, pageSize: number): Promise<NarrowingResult> {
  const where: Prisma.PlanWhereInput = { active: true, name: { contains: search, mode: 'insensitive' } };
  const [total, rows] = await Promise.all([
    tx.plan.count({ where }),
    tx.plan.findMany({ where, select: { id: true, name: true, planType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows: rows.map(row => ({ id: row.id, title: row.name, subtitle: row.planType })) };
}

/** Effective subscriptions by keeper name/email, plan name, or status — the
 * listEffectiveSubscriptions search shape, kept to display columns only. */
export async function narrowSubscriptions(tx: Pick<SuggestDb, 'userSubscription'>,
  search: string, page: number, pageSize: number): Promise<NarrowingResult> {
  const where: Prisma.UserSubscriptionWhereInput = { OR: [
    { user: { OR: [{ name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }] } },
    { plan: { name: { contains: search, mode: 'insensitive' } } },
    { status: { contains: search, mode: 'insensitive' } },
  ] };
  const [total, rows] = await Promise.all([
    tx.userSubscription.count({ where }),
    tx.userSubscription.findMany({ where,
      select: { id: true, status: true,
        user: { select: { name: true, email: true } },
        plan: { select: { name: true } },
        billingOption: { select: { interval: true } } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows: rows.map(row => {
    const keeper = row.user?.name ?? row.user?.email ?? row.status;
    const option = [row.plan?.name, row.billingOption?.interval].filter(Boolean).join(' · ');
    return { id: row.id, title: keeper, subtitle: option || row.status };
  }) };
}

/** Dispatch an entity's narrowing query — one grouped query set per call,
 * page-clamped, nothing else. */
export async function narrowRows(tx: SuggestDb, entity: NarrowEntity, search: string,
  page: number, pageSize: number): Promise<NarrowingResult> {
  const query = search.trim();
  const p = clampPage(page);
  const size = clampPageSize(pageSize);
  if (!query) return { rows: [], total: 0 };
  switch (entity) {
    case 'plans': return narrowPlans(tx, query, p, size);
    case 'features': return narrowFeatures(tx, query, p, size);
    case 'users': return narrowUsers(tx, query, p, size);
    case 'assignable-plans': return narrowAssignablePlans(tx, query, p, size);
    case 'subscriptions': return narrowSubscriptions(tx, query, p, size);
    default: throw new Error(`Unknown narrowing entity: ${String(entity)}`);
  }
}
