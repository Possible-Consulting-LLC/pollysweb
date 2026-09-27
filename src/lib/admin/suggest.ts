import type { Prisma } from '@prisma/client';

/** Live-search narrowing services (UX Task 8 fix round 1).
 *
 * Ruling 1: typing in a search input narrows the RENDERED LIST to matches in
 * real time — the query spans ALL rows, never just the current page. Ruling 3:
 * counters stay truthful while narrowing, so every response carries the TRUE
 * match total alongside the requested page of rows.
 *
 * Deliberately lean: per debounced typing pause (~250ms) each service runs
 * exactly TWO indexed queries — one count (the truthful display total the
 * mockup counter requires) and one capped page select. No joins beyond the
 * subscription display columns, no pagination math beyond skip/take. See
 * performance-report.md findings 2/3 for the catalog-query budget. */

export type Suggestion = { id: string; title: string; subtitle?: string };

export type NarrowingResult = { rows: Suggestion[]; total: number };

export const NARROW_DEFAULT_PAGE_SIZE = 10;
export const NARROW_MAX_PAGE_SIZE = 50;

type SuggestDb = Pick<Prisma.TransactionClient,
  'plan' | 'feature' | 'user' | 'userSubscription'>;

export type NarrowEntity =
  | 'plans' | 'features' | 'users' | 'assignable-plans' | 'subscriptions';
export const NARROW_ENTITIES: readonly NarrowEntity[] =
  ['plans', 'features', 'users', 'assignable-plans', 'subscriptions'];

const clampPage = (page: number) => Math.max(1, Math.trunc(page) || 1);
const clampPageSize = (pageSize: number) =>
  Math.min(NARROW_MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize) || NARROW_DEFAULT_PAGE_SIZE));

/** Plans by name (case-insensitive contains), display order first. */
export async function narrowPlans(tx: Pick<SuggestDb, 'plan'>, search: string,
  page: number, pageSize: number): Promise<NarrowingResult> {
  const where: Prisma.PlanWhereInput = { name: { contains: search, mode: 'insensitive' } };
  const [total, rows] = await Promise.all([
    tx.plan.count({ where }),
    tx.plan.findMany({ where, select: { id: true, name: true, planType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows: rows.map(row => ({ id: row.id, title: row.name, subtitle: row.planType })) };
}

/** Features by name OR key (case-insensitive contains), key order. The features
 * surface selects by feature KEY, so the narrowed row id IS the key — the
 * pick path feeds the same selection map as the checkbox path. */
export async function narrowFeatures(tx: Pick<SuggestDb, 'feature'>, search: string,
  page: number, pageSize: number): Promise<NarrowingResult> {
  const where: Prisma.FeatureWhereInput = { OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { key: { contains: search, mode: 'insensitive' } },
  ] };
  const [total, rows] = await Promise.all([
    tx.feature.count({ where }),
    tx.feature.findMany({ where, select: { id: true, key: true, name: true },
      orderBy: { key: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows: rows.map(row => ({ id: row.key, title: row.name, subtitle: row.key })) };
}

/** Keepers by name OR email (case-insensitive contains) over non-deleting
 * users, name order — searchUsers' where-clause. */
export async function narrowUsers(tx: Pick<SuggestDb, 'user'>, search: string,
  page: number, pageSize: number): Promise<NarrowingResult> {
  const where: Prisma.UserWhereInput = { deletingAt: null, OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
  ] };
  const [total, rows] = await Promise.all([
    tx.user.count({ where }),
    tx.user.findMany({ where, select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows: rows.map(row =>
    ({ id: row.id, title: row.name ?? row.email, subtitle: row.email })) };
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

/** Dispatch an entity's narrowing query — one truthful count plus one page
 * select per call, nothing else. */
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
