import type { Prisma } from '@prisma/client';
import { listAssignablePlans, searchUsers } from './plan-assignment';

/** Live-search suggestion services (Task 7, live-search requirement).
 *
 * Deliberately minimal: ONE indexed `contains` query per call, no count
 * aggregation, no joins, no pagination math — these run once per debounced
 * typing pause (~250ms) and must never worsen the admin-catalog query
 * patterns (see performance-report.md finding 2/3). Results are capped at
 * SUGGESTION_LIMIT so the payload stays tiny even over a large catalog. */

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

/** Dispatch an entity's suggestions. Users/assignable-plans reuse the wizard
 * services over a single capped first page (identical indexed where-clauses,
 * so the query pattern stays unchanged). */
export async function suggestionsFor(tx: SuggestDb, entity: SuggestEntity, search: string):
  Promise<Suggestion[]> {
  const query = search.trim();
  if (!query) return [];
  switch (entity) {
    case 'plans': return suggestPlans(tx, query);
    case 'features': return suggestFeatures(tx, query);
    case 'users':
      return (await searchUsers(tx, { search: query, page: 1, pageSize: SUGGESTION_LIMIT }))
        .users.map(user => ({ id: user.id, title: user.name, subtitle: user.email }));
    case 'assignable-plans':
      return (await listAssignablePlans(tx, { search: query, page: 1, pageSize: SUGGESTION_LIMIT }))
        .plans.map(plan => ({ id: plan.id, title: plan.name, subtitle: plan.planType }));
    default: throw new Error(`Unknown suggestion entity: ${String(entity)}`);
  }
}