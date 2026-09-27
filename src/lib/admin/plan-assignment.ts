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
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason || reason.length > 500 || unsafeText.test(reason))
    return new Error('Enter a short reason without @, control characters, or personal information.');
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

/** Currently effective subscriptions across all users (admin overview). */
export async function listEffectiveSubscriptions(tx: AssignmentDb): Promise<SubscriptionSummary[]> {
  const rows = await tx.userSubscription.findMany({ where: effectiveWhere(),
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] });
  return rows.map(row => ({ id: row.id, userId: row.userId, planId: row.planId,
    planBillingOptionId: row.planBillingOptionId, status: row.status,
    startedAt: row.startedAt, renewsAt: row.renewsAt, expiresAt: row.expiresAt }));
}
