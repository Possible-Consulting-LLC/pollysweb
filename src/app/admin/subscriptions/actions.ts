'use server';

import { revalidatePath } from 'next/cache';
import { withMutation } from '@/lib/mutation-boundary';
import { withAdminControl } from '@/lib/admin/actor';
import { assignPlanSubscription, assignPlanToUsers, endSubscription,
  BULK_ASSIGNMENT_MAX_USERS } from '@/lib/admin/plan-assignment';
import { MaintenanceError } from '@/lib/admin/maintenance-policy';

type Result = { error?: string; success?: boolean };

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

const failure = (error: unknown, fallback: string) => {
  // Services may fail with Error instances from another module realm (the tag
  // check works in both) — a NAMED service error must reach the UI intact.
  const message = error instanceof Error && error.message ? error.message
    : Object.prototype.toString.call(error) === '[object Error]' &&
      (error as Error).message ? (error as Error).message : '';
  return { error: message || fallback };
};

// Service failures may be Error instances from another module realm; the tag check works in both.
const isServiceError = (result: unknown): result is Error =>
  Object.prototype.toString.call(result) === '[object Error]';

/** Assigns a plan (and one of its active billing options) to the keeper batch
 * carried as `userIds` (comma-separated, duplicates collapse) — ALL-OR-NOTHING
 * via assignPlanToUsers: one transaction, per-user row locks, per-user derived
 * audit reasons, every keeper's prior effective subscription end-dated first;
 * any ineligible keeper aborts the WHOLE batch with a named error. The
 * effective date defaults to now when left empty. No reason field: the audit
 * reasons are derived from the batch's own context. */
export async function assignSubscriptionAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'assignplan', async () => {
    try {
      const rawUserIds = value(form, 'userIds');
      if (rawUserIds.length > 65_536) throw Error('Too many keepers in one batch.');
      const userIds = [...new Set(rawUserIds.split(',').map(id => id.trim()).filter(Boolean))];
      if (userIds.length === 0) throw Error('Select at least one keeper.');
      if (userIds.length > BULK_ASSIGNMENT_MAX_USERS)
        throw Error(`Too many keepers in one batch — select at most ${BULK_ASSIGNMENT_MAX_USERS}.`);
      const planId = value(form, 'planId');
      if (!planId || planId.length > 128) throw Error('A valid plan is required.');
      const planBillingOptionId = value(form, 'planBillingOptionId');
      if (!planBillingOptionId || planBillingOptionId.length > 128) throw Error('A billing option is required.');
      const rawEffectiveAt = value(form, 'effectiveAt');
      const effectiveAt = rawEffectiveAt ? new Date(rawEffectiveAt) : new Date();
      if (Number.isNaN(effectiveAt.getTime())) throw Error('Enter a valid effective date.');
      await withAdminControl(async (tx, actor) => {
        const result = await assignPlanToUsers(tx, actor.id,
          { userIds, planId, planBillingOptionId, effectiveAt });
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/subscriptions');
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The subscriptions were not assigned. Reload and check your administrator access.');
    }
  });
}

/** Edits one stored subscription in place (billing option + effective date;
 * Task 11 ruling 1): supersede semantics via the existing audited service —
 * the row's own plan is kept, its still-effective check is re-verified here,
 * the prior effective subscription is end-dated as of the effective date, and
 * a new ACTIVE row starts; audited plan.assign. No reason field: the audit
 * reason is derived from the row's own context. */
export async function editSubscriptionAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'editsubscription', async () => {
    try {
      const subscriptionId = value(form, 'subscriptionId');
      if (!subscriptionId || subscriptionId.length > 128) throw Error('A subscription is required.');
      const planBillingOptionId = value(form, 'planBillingOptionId');
      if (!planBillingOptionId || planBillingOptionId.length > 128) throw Error('A billing option is required.');
      const rawEffectiveAt = value(form, 'effectiveAt');
      const effectiveAt = rawEffectiveAt ? new Date(rawEffectiveAt) : new Date();
      if (Number.isNaN(effectiveAt.getTime())) throw Error('Enter a valid effective date.');
      await withAdminControl(async (tx, actor) => {
        // Load the row's context for the fail-closed check and the derived
        // audit reason inside the authorized transaction; assignPlanSubscription
        // re-validates plan/option state and the actor under the user lock.
        const row = await tx.userSubscription.findUnique({ where: { id: subscriptionId },
          select: { userId: true, planId: true, status: true, expiresAt: true,
            plan: { select: { name: true } } } });
        if (!row) throw Error('That subscription no longer exists. Reload the page.');
        const now = new Date();
        const stillEffective = ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(row.status) &&
          (row.expiresAt === null || row.expiresAt.getTime() > now.getTime());
        if (!stillEffective) throw Error('That subscription has already ended.');
        const option = await tx.planBillingOption.findUnique({ where: { id: planBillingOptionId },
          select: { interval: true } });
        const reason =
          `Edited subscription for user ${row.userId} (${row.plan?.name ?? row.planId} ${option?.interval ?? ''}) effective ${effectiveAt.toISOString()}`.trim();
        const result = await assignPlanSubscription(tx, actor.id,
          { targetUserId: row.userId, planId: row.planId, planBillingOptionId, effectiveAt, reason });
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/subscriptions');
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The subscription was not updated. Reload and check your administrator access.');
    }
  });
}

/** Ends one effective subscription. No reason field: the audit reason is
 * derived from the row's own context (keeper, plan, interval). */
export async function endSubscriptionAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'endsubscription', async () => {
    try {
      const subscriptionId = value(form, 'subscriptionId');
      if (!subscriptionId || subscriptionId.length > 128) throw Error('A subscription is required.');
      await withAdminControl(async (tx, actor) => {
        // Load the row's context for the derived reason inside the authorized
        // transaction; endSubscription re-validates endability under the lock.
        const row = await tx.userSubscription.findUnique({ where: { id: subscriptionId },
          select: { userId: true, planId: true, status: true, expiresAt: true,
            plan: { select: { name: true } }, billingOption: { select: { interval: true } } } });
        if (!row) throw Error('That subscription no longer exists. Reload the page.');
        const reason =
          `Ended subscription for user ${row.userId} (${row.plan?.name ?? row.planId} ${row.billingOption?.interval ?? ''})`.trim();
        const result = await endSubscription(tx, actor.id, subscriptionId, reason);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/subscriptions');
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The subscription was not ended. Reload and check your administrator access.');
    }
  });
}
