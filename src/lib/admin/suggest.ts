import type { Prisma } from '@prisma/client';
import { listPlans, type PlanSummary } from '@/lib/admin/plans';
import { listEffectiveSubscriptions } from '@/lib/admin/plan-assignment';
import { LEGACY_PLAN_NAMES } from '@/lib/admin/legacy-entitlements';
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
 * listAssignablePlans' where-shape INCLUDING the legacy-plan exclusion (Task
 * 11). Task 10: the narrowed rows carry the same read-only enabled feature
 * NAMES as the committed picker rows (one grouped translations query per
 * pause), so the "Included features" line never disappears while narrowing. */
export type NarrowAssignablePlanRow = Suggestion & { features: string[] };
export async function narrowAssignablePlans(tx: Pick<SuggestDb,
  'plan' | 'featurePlanTranslation'>, search: string, page: number,
  pageSize: number): Promise<{ rows: NarrowAssignablePlanRow[]; total: number }> {
  const where: Prisma.PlanWhereInput = { active: true,
    name: { notIn: [...LEGACY_PLAN_NAMES],
      ...(search ? { contains: search, mode: 'insensitive' } : {}) } };
  const [total, rows] = await Promise.all([
    tx.plan.count({ where }),
    tx.plan.findMany({ where, select: { id: true, name: true, planType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const translations = rows.length ? await tx.featurePlanTranslation.findMany({
    where: { planId: { in: rows.map(row => row.id) }, enabled: true },
    select: { planId: true, feature: { select: { name: true } } },
  }) : [];
  const featuresByPlan = new Map<string, string[]>();
  for (const translation of translations) {
    if (!translation.feature) continue;
    const names = featuresByPlan.get(translation.planId) ?? [];
    names.push(translation.feature.name);
    featuresByPlan.set(translation.planId, names);
  }
  return { total, rows: rows.map(row => ({ id: row.id, title: row.name,
    subtitle: row.planType,
    features: (featuresByPlan.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)) })) };
}

/** Effective subscriptions by keeper name/email, plan name, or status —
 * Task 11: the committed page's own UNION query (listEffectiveSubscriptions:
 * real effective rows + tier-derived legacy rows), so the narrowed view is
 * exactly what /admin/subscriptions renders, kept to display triples only. */
export async function narrowSubscriptions(tx: Pick<SuggestDb,
  'user' | 'plan' | 'userSubscription'>, search: string, page: number,
  pageSize: number): Promise<NarrowingResult> {
  const { rows, total } = await listEffectiveSubscriptions(tx, { search, page, pageSize });
  return { total, rows: rows.map(row => {
    const keeper = row.userName ?? row.userEmail ?? row.userId;
    const option = row.source === 'tier'
      ? `${row.planName ?? row.planId} · Legacy — derived`
      : [row.planName, row.optionInterval].filter(Boolean).join(' · ') || row.status;
    return { id: row.id, title: keeper, subtitle: option };
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

// --- S13c: select all / select none (lean ids service) ----------------------

/** Select-all fetches the FULL matching set on CLICK (never per keystroke):
 * exactly one indexed, count-free, page-free select of the display columns
 * only, capped so a huge catalog can't blow the payload (the counter stays
 * truthful — "N of M" with N possibly < M is still honest). */
export const SELECT_ALL_CAP = 500;

/** The multi-select surfaces (S13c): the feature matrix is registry-local and
 * needs no service; the two accordions fetch from here. Task 10 adds the USER
 * picker: its step 1 is multi-select now, so Select all spans every selectable
 * keeper across all pages via the same ids endpoint (the plan picker stays
 * single-mode and excluded). */
export const SELECTABLE_ENTITIES = ['features', 'plans', 'users'] as const;
export type SelectableEntity = (typeof SELECTABLE_ENTITIES)[number];

/** The select-all wire row: the surface's selection identity plus the display
 * triple, so merged picks land in the same tray structures as manual picks —
 * never a bare id. */
export type SelectableIdRow = { id: string; title: string; subtitle: string };

/** Features matching the committed search (name OR key, case-insensitive —
 * narrowFeatures' where-shape), key order. An EMPTY search means the current
 * view is unfiltered, so it selects EVERYTHING (unlike narrowing's blank
 * no-op). Orphaned keys never join: a key absent from the code registry is
 * unselectable everywhere (the client re-checks at render time by ruling). */
export async function selectableFeatureRows(
  tx: Pick<SuggestDb, 'feature'>, search: string): Promise<SelectableIdRow[]> {
  const trimmed = search.trim();
  const where: Prisma.FeatureWhereInput = trimmed ? { OR: [
    { name: { contains: trimmed, mode: 'insensitive' } },
    { key: { contains: trimmed, mode: 'insensitive' } },
  ] } : {};
  const rows = await tx.feature.findMany({ where,
    select: { key: true, name: true }, orderBy: { key: 'asc' }, take: SELECT_ALL_CAP });
  return rows.filter(row => isRegisteredFeatureKey(row.key))
    .map(row => ({ id: row.key, title: row.name, subtitle: row.key }));
}

/** Plans matching the committed search (name contains, case-insensitive —
 * listPlans' where-shape), display order, display columns only. */
export async function selectablePlanRows(
  tx: Pick<SuggestDb, 'plan'>, search: string): Promise<SelectableIdRow[]> {
  const trimmed = search.trim();
  const where: Prisma.PlanWhereInput = trimmed
    ? { name: { contains: trimmed, mode: 'insensitive' } } : {};
  const rows = await tx.plan.findMany({ where,
    select: { id: true, name: true, planType: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: SELECT_ALL_CAP });
  return rows.map(row => ({ id: row.id, title: row.name, subtitle: row.planType }));
}

/** Keepers matching the committed search (name OR email, case-insensitive —
 * searchUsers' where-shape), name order, display columns only. Deleting
 * accounts NEVER join: `deletingAt: null` guards the where-clause itself (they
 * are greyed/unselectable everywhere in the picker). */
export async function selectableUserRows(
  tx: Pick<SuggestDb, 'user'>, search: string): Promise<SelectableIdRow[]> {
  const trimmed = search.trim();
  const where: Prisma.UserWhereInput = { deletingAt: null,
    ...(trimmed ? { OR: [
      { name: { contains: trimmed, mode: 'insensitive' } },
      { email: { contains: trimmed, mode: 'insensitive' } },
    ] } : {}) };
  const rows = await tx.user.findMany({ where,
    select: { id: true, name: true, email: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }], take: SELECT_ALL_CAP });
  return rows.map(row => ({ id: row.id, title: row.name ?? row.email, subtitle: row.email }));
}

/** Dispatch a selectable entity's ids query — one lean query per call,
 * nothing else. */
export async function selectableRows(tx: Pick<SuggestDb, 'feature' | 'plan' | 'user'>,
  entity: SelectableEntity, search: string): Promise<SelectableIdRow[]> {
  switch (entity) {
    case 'features': return selectableFeatureRows(tx, search);
    case 'plans': return selectablePlanRows(tx, search);
    case 'users': return selectableUserRows(tx, search);
    default: throw new Error(`Unknown selectable entity: ${String(entity)}`);
  }
}
