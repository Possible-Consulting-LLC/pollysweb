import 'server-only';
import type { Prisma } from '@prisma/client';
import { appendAudit } from './audit';

export type AssignmentInput = { targetUserId: string; planId: string; planBillingOptionId: string;
  effectiveAt: Date; reason: string };
export type SubscriptionSummary = { id: string; userId: string; planId: string;
  planBillingOptionId: string; status: string; startedAt: Date; renewsAt: Date | null;
  expiresAt: Date | null };
type AssignmentDb = Pick<Prisma.TransactionClient, 'user' | 'plan' | 'planBillingOption'
  | 'userSubscription' | 'adminAudit' | '$queryRaw'>;

const unsafeText = /[\u0000-\u001f\u007f@]/;
const EFFECTIVE_STATUSES: readonly string[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];
/** Rows that count as "one effective subscription per user" / plan history. */
const effectiveWhere = (): Prisma.UserSubscriptionWhereInput => ({
  status: { in: [...EFFECTIVE_STATUSES] },
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

const idOk = (value: string) => value.length > 0 && value.length <= 128;

/** Shared audit-reason shape for every assignment mutation: short, no @ or
 * control characters (mirrors the audit allowlist's text rules). */
const validReason = (reason: unknown): string | Error => {
  const value = typeof reason === 'string' ? reason.trim() : '';
  if (!value || value.length > 500 || unsafeText.test(value))
    return new Error('Enter a short reason without @, control characters, or personal information.');
  return value;
};

/** Input-shape validation; database-dependent checks (plan/option/user state,
 * actor role) happen inside assignPlanSubscription's transaction. */
export function validateAssignment(input: AssignmentInput): AssignmentInput | Error {
  if (!idOk(input.targetUserId)) return new Error('A target user is required.');
  if (!idOk(input.planId)) return new Error('A plan is required.');
  if (!idOk(input.planBillingOptionId)) return new Error('A billing option is required.');
  // Cross-realm safe (test sandboxes): structural date check, not instanceof.
  if (Object.prototype.toString.call(input.effectiveAt) !== '[object Date]' ||
      !Number.isFinite(input.effectiveAt.getTime()))
    return new Error('Enter a valid effective date.');
  const reason = validReason(input.reason);
  if (reason instanceof Error) return reason;
  return { targetUserId: input.targetUserId, planId: input.planId,
    planBillingOptionId: input.planBillingOptionId, effectiveAt: input.effectiveAt, reason };
}

/** Assigns one plan subscription to a user inside the caller's already-
 * authorized withAdminControl transaction. Serializes concurrent assignments
 * for the same user with a row lock, validates plan/option/user state, ends
 * the prior effective subscription, inserts the new ACTIVE row, and audits
 * plan.assign. Returns the new subscription id. */
export async function assignPlanSubscription(tx: AssignmentDb, actorId: string,
  input: AssignmentInput): Promise<string | Error> {
  const validated = validateAssignment(input);
  if (validated instanceof Error) return validated;
  const { targetUserId, planId, planBillingOptionId, effectiveAt, reason } = validated;
  // Same idiom as runAdminMutation: row lock serializes concurrent assignments.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${targetUserId} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (!actor || actor.role !== 'super_admin')
    return new Error('Administrator access denied.');
  const target = await tx.user.findUnique({ where: { id: targetUserId },
    select: { id: true, deletingAt: true } });
  if (!target || target.deletingAt) return new Error('Choose an active user for the assignment.');
  const plan = await tx.plan.findUnique({ where: { id: planId }, include: { billingOptions: true } });
  if (!plan) return new Error('That plan no longer exists. Reload the page.');
  if (!plan.active) return new Error('Choose an active plan.');
  const option = plan.billingOptions.find(candidate => candidate.id === planBillingOptionId);
  if (!option) return new Error('That billing option does not belong to the chosen plan. Reload the page.');
  if (!option.active) return new Error('Choose an active billing option.');
  // End-date prior effective subscriptions so exactly one row is effective.
  await tx.userSubscription.updateMany({ where: { userId: targetUserId, ...effectiveWhere() },
    data: { status: 'CANCELED', expiresAt: effectiveAt } });
  const created = await tx.userSubscription.create({ data: { userId: targetUserId, planId,
    planBillingOptionId, status: 'ACTIVE', startedAt: effectiveAt, renewsAt: null, expiresAt: null } });
  await appendAudit(tx as Prisma.TransactionClient, { actorId, targetId: targetUserId,
    action: 'plan.assign', reason,
    changes: { planId, status: 'ACTIVE', effectiveAt: effectiveAt.toISOString() } });
  return created.id;
}

/** Currently effective subscriptions across all users (admin overview), with
 * joined keeper/plan/option display details, optional case-insensitive search
 * over keeper name/email, plan name, and status, and offset pagination. */
export type EffectiveSubscriptionRow = SubscriptionSummary & {
  userName: string | null; userEmail: string | null; planName: string | null;
  optionInterval: string | null; optionPriceCents: number | null; };
export type EffectiveSubscriptionsQuery = { search?: string; page: number; pageSize: number };
export async function listEffectiveSubscriptions(tx: AssignmentDb,
  query?: EffectiveSubscriptionsQuery): Promise<{ rows: EffectiveSubscriptionRow[]; total: number }> {
  const page = Math.max(1, Math.trunc(query?.page ?? 1) || 1);
  const pageSize = Math.max(1, Math.trunc(query?.pageSize ?? 20) || 1);
  const search = (query?.search ?? '').trim();
  // Search terms nest under AND so they never loosen the effective-only filter.
  const where: Prisma.UserSubscriptionWhereInput = search ? { AND: [effectiveWhere(), { OR: [
    { user: { OR: [{ name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }] } },
    { plan: { name: { contains: search, mode: 'insensitive' } } },
    { status: { contains: search, mode: 'insensitive' } },
  ] }] } : effectiveWhere();
  const [rows, total] = await Promise.all([
    tx.userSubscription.findMany({ where,
      include: { user: { select: { name: true, email: true } }, plan: { select: { name: true } },
        billingOption: { select: { interval: true, basePriceCents: true } } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
    tx.userSubscription.count({ where }),
  ]);
  return { total, rows: rows.map(row => ({ id: row.id, userId: row.userId, planId: row.planId,
    planBillingOptionId: row.planBillingOptionId, status: row.status, startedAt: row.startedAt,
    renewsAt: row.renewsAt, expiresAt: row.expiresAt, userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null, planName: row.plan?.name ?? null,
    optionInterval: row.billingOption?.interval ?? null,
    optionPriceCents: row.billingOption?.basePriceCents ?? null })) };
}

/** Valid keepers for the assignment wizard's user step: name OR email contains
 * (case-insensitive) over non-deleting users, ordered by name. */
export type UserSummary = { id: string; name: string; email: string };
export type SearchUsersQuery = { search?: string; page: number; pageSize: number };
export async function searchUsers(tx: Pick<AssignmentDb, 'user'>,
  query: SearchUsersQuery): Promise<{ users: UserSummary[]; total: number }> {
  const page = Math.max(1, Math.trunc(query.page) || 1);
  const pageSize = Math.max(1, Math.trunc(query.pageSize) || 1);
  const search = (query.search ?? '').trim();
  const where: Prisma.UserWhereInput = { deletingAt: null, ...(search ? { OR: [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
  ] } : {}) };
  const [rows, total] = await Promise.all([
    tx.user.findMany({ where, select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    tx.user.count({ where }),
  ]);
  return { total, users: rows.map(row =>
    ({ id: row.id, name: row.name ?? row.email, email: row.email })) };
}

/** Active plans for the assignment wizard's plan step. Search, ordering, and
 * pagination mirror listPlans' conventions but run over active rows only, so
 * the total and page math describe exactly the assignable set (filtering a
 * mixed page would strand active plans behind inactive ones). */
export type AssignablePlanRow = { id: string; name: string; planType: string;
  billingOptions: Array<{ id: string; interval: string; basePriceCents: number; active: boolean }> };
export type AssignablePlansQuery = { search?: string; page: number; pageSize: number };
export async function listAssignablePlans(tx: Pick<Prisma.TransactionClient, 'plan'>,
  query: AssignablePlansQuery): Promise<{ plans: AssignablePlanRow[]; total: number }> {
  const page = Math.max(1, Math.trunc(query.page) || 1);
  const pageSize = Math.max(1, Math.trunc(query.pageSize) || 1);
  const search = (query.search ?? '').trim();
  const where: Prisma.PlanWhereInput = { active: true,
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) };
  const [rows, total] = await Promise.all([
    tx.plan.findMany({ where, include: { billingOptions: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
    tx.plan.count({ where }),
  ]);
  return { total, plans: rows.map(row => ({ id: row.id, name: row.name, planType: row.planType,
    billingOptions: row.billingOptions.map(option => ({ id: option.id, interval: option.interval,
      basePriceCents: option.basePriceCents, active: option.active })) })) };
}

/** Ends one still-effective subscription: status CANCELED with expiresAt now,
 * audited subscription.end. Fail-closed when the row already ended; the row
 * lock serializes concurrent ends and assignments for the subscription.
 * Caller runs inside an authorized withAdminControl transaction; the reason is
 * derived by the actions layer from the row's own context. */
export async function endSubscription(tx: AssignmentDb, actorId: string,
  subscriptionId: string, reason: string): Promise<'ended' | Error> {
  if (!idOk(subscriptionId)) return new Error('A subscription is required.');
  const auditedReason = validReason(reason);
  if (auditedReason instanceof Error) return auditedReason;
  await tx.$queryRaw`SELECT "id" FROM "UserSubscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (!actor || actor.role !== 'super_admin')
    return new Error('Administrator access denied.');
  const row = await tx.userSubscription.findUnique({ where: { id: subscriptionId },
    select: { userId: true, planId: true, status: true, expiresAt: true } });
  if (!row) return new Error('That subscription no longer exists. Reload the page.');
  const now = new Date();
  const stillEffective = EFFECTIVE_STATUSES.includes(row.status) &&
    (row.expiresAt === null || row.expiresAt.getTime() > now.getTime());
  if (!stillEffective) return new Error('That subscription has already ended.');
  await tx.userSubscription.update({ where: { id: subscriptionId },
    data: { status: 'CANCELED', expiresAt: now } });
  // appendAudit's safeFields allowlist carries the timestamp as `effectiveAt`
  // (the cancellation takes effect now) and the keeper via the derived reason.
  await appendAudit(tx as Prisma.TransactionClient, { actorId, targetId: subscriptionId,
    action: 'subscription.end', reason: auditedReason,
    changes: { planId: row.planId, status: 'CANCELED', effectiveAt: now.toISOString() } });
  return 'ended';
}
