import type { Prisma } from '@prisma/client';

/** Live-search suggestion services (Task 7, live-search requirement).
 *
 * Deliberately minimal: ONE indexed `contains` query per call, no count
 * aggregation, no joins, no pagination math — for EVERY entity (the wizard
 * pickers' searchUsers/listAssignablePlans compute a discarded total, so the
 * users/assignable-plans paths run their own count-free selects here). These
 * run once per debounced typing pause (~250ms) and must never worsen the
 * admin-catalog query patterns (see performance-report.md findings 2/3).
 * Results are capped at SUGGESTION_LIMIT so the payload stays tiny even over a
 * large catalog. */

export const SUGGESTION_LIMIT = 10;

export type Suggestion = { id: string; title: string; subtitle?: string };

type SuggestDb = Pick<Prisma.TransactionClient, 'plan' | 'feature' | 'user'>;

export type SuggestEntity = 'plans' | 'features' | 'users' | 'assignable-plans';
export const SUGGEST_ENTITIES: readonly SuggestEntity[] =
  ['plans', 'features', 'users', 'assignable-plans'];

/** Plans by name (case-insensitive contains), display order first. */
export async function suggestPlans(tx: Pick<SuggestDb, 'plan'>, search: string):
  Promise<Suggestion[]> {
  const rows = await tx.plan.findMany({
    where: { name: { contains: search, mode: 'insensitive' } },
    select: { id: true, name: true, planType: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: SUGGESTION_LIMIT,
  });
  return rows.map(row => ({ id: row.id, title: row.name, subtitle: row.planType }));
}

/** Features by name OR key (case-insensitive contains), key order. */
export async function suggestFeatures(tx: Pick<SuggestDb, 'feature'>, search: string):
  Promise<Suggestion[]> {
  const rows = await tx.feature.findMany({
    where: { OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { key: { contains: search, mode: 'insensitive' } },
    ] },
    select: { id: true, key: true, name: true },
    orderBy: { key: 'asc' },
    take: SUGGESTION_LIMIT,
  });
  return rows.map(row => ({ id: row.id, title: row.name, subtitle: row.key }));
}

/** Keepers by name OR email (case-insensitive contains) over non-deleting
 * users, name order — searchUsers' where-clause minus its discarded total
 * count, so the suggestion call runs exactly one query. */
export async function suggestUsers(tx: Pick<SuggestDb, 'user'>, search: string):
  Promise<Suggestion[]> {
  const rows = await tx.user.findMany({
    where: { deletingAt: null, OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ] },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: SUGGESTION_LIMIT,
  });
  return rows.map(row => ({ id: row.id, title: row.name ?? row.email, subtitle: row.email }));
}

/** Active plans by name (case-insensitive contains), display order first —
 * listAssignablePlans' where-clause minus its discarded total count. */
export async function suggestAssignablePlans(tx: Pick<SuggestDb, 'plan'>, search: string):
  Promise<Suggestion[]> {
  const rows = await tx.plan.findMany({
    where: { active: true, name: { contains: search, mode: 'insensitive' } },
    select: { id: true, name: true, planType: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: SUGGESTION_LIMIT,
  });
  return rows.map(row => ({ id: row.id, title: row.name, subtitle: row.planType }));
}

/** Dispatch an entity's suggestions — every path is a single capped,
 * count-free, join-free query. */
export async function suggestionsFor(tx: SuggestDb, entity: SuggestEntity, search: string):
  Promise<Suggestion[]> {
  const query = search.trim();
  if (!query) return [];
  switch (entity) {
    case 'plans': return suggestPlans(tx, query);
    case 'features': return suggestFeatures(tx, query);
    case 'users': return suggestUsers(tx, query);
    case 'assignable-plans': return suggestAssignablePlans(tx, query);
    default: throw new Error(`Unknown suggestion entity: ${String(entity)}`);
  }
}