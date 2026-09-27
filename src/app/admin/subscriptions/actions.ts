'use server';

import { revalidatePath } from 'next/cache';
import { withMutation } from '@/lib/mutation-boundary';
import { withAdminControl } from '@/lib/admin/actor';
import { assignPlanSubscription } from '@/lib/admin/plan-assignment';
import { MaintenanceError } from '@/lib/admin/maintenance-policy';

type Result = { error?: string; success?: boolean };

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

const failure = (error: unknown, fallback: string) =>
  ({ error: error instanceof Error && error.message ? error.message : fallback });

// Service failures may be Error instances from another module realm; the tag check works in both.
const isServiceError = (result: unknown): result is Error =>
  Object.prototype.toString.call(result) === '[object Error]';

/** Assigns a plan (and one of its active billing options) to the user matched
 * by email or id. The effective date defaults to now when left empty. */
export async function assignSubscriptionAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'assignplan', async () => {
    try {
      const userQuery = value(form, 'userQuery');
      if (!userQuery || userQuery.length > 256) throw Error('Enter a user email or id.');
      const planId = value(form, 'planId');
      if (!planId || planId.length > 128) throw Error('A valid plan is required.');
      const planBillingOptionId = value(form, 'planBillingOptionId');
      if (!planBillingOptionId || planBillingOptionId.length > 128) throw Error('A billing option is required.');
      const reason = value(form, 'reason');
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      const rawEffectiveAt = value(form, 'effectiveAt');
      const effectiveAt = rawEffectiveAt ? new Date(rawEffectiveAt) : new Date();
      if (Number.isNaN(effectiveAt.getTime())) throw Error('Enter a valid effective date.');
      await withAdminControl(async (tx, actor) => {
        const target = await tx.user.findFirst({
          where: { OR: [{ email: userQuery }, { id: userQuery }] }, select: { id: true } });
        if (!target) throw Error('No user matches that email or id.');
        const result = await assignPlanSubscription(tx, actor.id,
          { targetUserId: target.id, planId, planBillingOptionId, effectiveAt, reason });
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/subscriptions');
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The subscription was not assigned. Reload and check your administrator access.');
    }
  });
}
