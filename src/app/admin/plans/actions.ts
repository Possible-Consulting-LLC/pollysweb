'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { withMutation } from '@/lib/mutation-boundary';
import { withAdminControl } from '@/lib/admin/actor';
import { createPlan, deletePlan, duplicatePlan, planHistoryCount, reorderPlan, saveBillingOption,
  setBillingOptionActive, setPlanFlags, updatePlan } from '@/lib/admin/plans';
import { applyFeatureMatrix } from '@/lib/admin/plan-features';
import { FEATURE_REGISTRY } from '@/lib/features/registry';
import { MaintenanceError } from '@/lib/admin/maintenance-policy';

type Result = { error?: string; success?: boolean };

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
// Checkboxes submit "on"; hidden toggles submit "true"/"false".
const checked = (form: FormData, key: string) => form.get(key) === 'on' || form.get(key) === 'true';

const planIdentity = (form: FormData) => {
  const planId = value(form, 'planId');
  if (!planId || planId.length > 128) throw Error('A valid plan is required.');
  return { planId };
};

const failure = (error: unknown, fallback: string) =>
  ({ error: error instanceof Error && error.message ? error.message : fallback });

// Service failures may be Error instances from another module realm; the tag check works in both.
const isServiceError = (result: unknown): result is Error =>
  Object.prototype.toString.call(result) === '[object Error]';

const numberOrNull = (form: FormData, key: string) => {
  const raw = value(form, key);
  return raw === '' ? null : Number(raw);
};

/** Loads the plan inside the admin transaction so the derived audit reason can
 * describe the target. Typed against the real Prisma client: a query that
 * expects a relation it did not include is a compile-time error. */
async function loadPlanForReason(tx: Prisma.TransactionClient, planId: string) {
  const row = await tx.plan.findUnique({ where: { id: planId } });
  if (!row) throw Error('That plan no longer exists. Reload the catalog.');
  return row;
}

export async function createPlanAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'createplan', async () => {
    try {
      const input = { name: value(form, 'name'), description: value(form, 'description'),
        planType: value(form, 'planType'), maxSpiders: numberOrNull(form, 'maxSpiders'),
        active: checked(form, 'active'), public: checked(form, 'public') };
      await withAdminControl(async (tx, actor) => {
        const reason = `Created plan ${input.name} (${input.planType}, ${input.public ? 'public' : 'not public'})`;
        const result = await createPlan(tx, actor.id, input, reason);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The plan was not created. Reload and check your administrator access.');
    }
  });
}

export async function updatePlanAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'updateplan', async () => {
    try {
      const { planId } = planIdentity(form);
      const input = { name: value(form, 'name'), description: value(form, 'description'),
        planType: value(form, 'planType'), maxSpiders: numberOrNull(form, 'maxSpiders'),
        active: checked(form, 'active'), public: checked(form, 'public') };
      await withAdminControl(async (tx, actor) => {
        const result = await updatePlan(tx, actor.id, planId, input, `Updated plan ${input.name}`);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The plan was not saved. Reload and check your administrator access.');
    }
  });
}

export async function duplicatePlanAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'duplicateplan', async () => {
    try {
      const { planId } = planIdentity(form);
      await withAdminControl(async (tx, actor) => {
        const { name } = await loadPlanForReason(tx, planId);
        const result = await duplicatePlan(tx, actor.id, planId, `Duplicated plan ${name}`);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The plan was not duplicated. Reload and check your administrator access.');
    }
  });
}

export async function deletePlanAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'deleteplan', async () => {
    try {
      const { planId } = planIdentity(form);
      await withAdminControl(async (tx, actor) => {
        const { name } = await loadPlanForReason(tx, planId);
        // Mirror the service's branch decision so the reason states the outcome.
        const reason = (await planHistoryCount(tx, planId)) > 0
          ? `Deactivated plan ${name}` : `Deleted plan ${name}`;
        const result = await deletePlan(tx, actor.id, planId, reason);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The plan was not removed. Reload and check your administrator access.');
    }
  });
}

export async function saveBillingOptionAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'savebillingoption', async () => {
    try {
      const { planId } = planIdentity(form);
      const input = { interval: value(form, 'interval'),
        basePriceCents: Number(value(form, 'basePriceCents')), active: value(form, 'active') === 'true' };
      await withAdminControl(async (tx, actor) => {
        const { name } = await loadPlanForReason(tx, planId);
        const result = await saveBillingOption(tx, actor.id, planId, input,
          `Updated billing option ${input.interval} for plan ${name}`);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The billing option was not saved. Reload and check your administrator access.');
    }
  });
}

export async function setBillingOptionActiveAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'setbillingoptionactive', async () => {
    try {
      const { planId } = planIdentity(form);
      const optionId = value(form, 'optionId');
      const requested = value(form, 'active');
      if (!optionId || optionId.length > 128) throw Error('A valid billing option is required.');
      if (requested !== 'true' && requested !== 'false') throw Error('Choose active or inactive.');
      await withAdminControl(async (tx, actor) => {
        const plan = await loadPlanForReason(tx, planId);
        // Resolve the option by its own table: no relation include needed, and
        // a foreign or missing option id fails closed here.
        const option = await tx.planBillingOption.findFirst({ where: { id: optionId, planId } });
        if (!option) throw Error('That billing option no longer exists. Reload the editor.');
        const result = await setBillingOptionActive(tx, actor.id, planId, optionId,
          requested === 'true', `Updated billing option ${option.interval} for plan ${plan.name}`);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The billing option state was not changed. Reload and check your administrator access.');
    }
  });
}

export async function reorderPlanAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'reorderplan', async () => {
    try {
      const { planId } = planIdentity(form);
      const direction = value(form, 'direction') === 'up' ? 'up' : 'down';
      await withAdminControl(async (tx, actor) => {
        const { name } = await loadPlanForReason(tx, planId);
        const result = await reorderPlan(tx, actor.id, planId, direction, `Reordered plan ${name}`);
        if (isServiceError(result)) throw result;
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The plan order was not changed. Reload and check your administrator access.');
    }
  });
}

/** One audited mutation per selected plan: release/visibility flips with the
 * established derived-reason format. Deletion is deliberately not a bulk
 * action — it stays per-plan behind the subscription-history guard. */
export async function bulkSetPlanFlagsAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'bulksetplanflags', async () => {
    try {
      const planIds = form.getAll('planId').map(String)
        .filter(planId => planId && planId.length <= 128);
      if (planIds.length === 0) throw Error('Select at least one plan first.');
      const field = value(form, 'field');
      if (field !== 'active' && field !== 'public') throw Error('Choose active state or public visibility.');
      const rawValue = value(form, 'value');
      if (rawValue !== 'true' && rawValue !== 'false') throw Error('Choose a true or false state.');
      const setting = rawValue === 'true';
      await withAdminControl(async (tx, actor) => {
        for (const planId of planIds) {
          const { name } = await loadPlanForReason(tx, planId);
          const reason = field === 'active'
            ? `${setting ? 'Activated' : 'Deactivated'} plan ${name}`
            : `${setting ? 'Published' : 'Unpublished'} plan ${name}`;
          const result = await setPlanFlags(tx, actor.id, planId, { [field]: setting }, reason);
          if (isServiceError(result)) throw result;
        }
      });
      revalidatePath('/admin/plans');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return failure(error, 'The bulk change was not applied. Reload and check your administrator access.');
    }
  });
}

/** Checkboxes named "feature" submit only the enabled keys; the matrix is
 * reconstructed over the full code registry so every save covers every
 * registered feature. A save that removes access from current subscribers
 * still succeeds and returns a warning (never a silent subscriber change). */
export async function saveFeatureMatrixAction(form: FormData): Promise<Result & { warning?: string }> {
  return withMutation(form, 'admin', 'savefeaturematrix',
    async (): Promise<Result & { warning?: string }> => {
      try {
        const { planId } = planIdentity(form);
        const enabledKeys = new Set(form.getAll('feature').map(entry => String(entry)));
        const entries = FEATURE_REGISTRY.map(definition =>
          ({ key: definition.key, enabled: enabledKeys.has(definition.key) }));
        const enabledCount = entries.filter(entry => entry.enabled).length;
        const applied = await withAdminControl(async (tx, actor) => {
          const { name } = await loadPlanForReason(tx, planId);
          const reason =
            `Saved feature matrix for plan ${name} (${enabledCount} of ${entries.length} enabled)`;
          const result = await applyFeatureMatrix(tx, actor.id, planId, { entries }, reason);
          if (isServiceError(result)) throw result;
          return result;
        });
        revalidatePath('/admin/plans');
        const warning = applied.removedAccess.length
          ? `Removed access: ${applied.removedAccess.join(', ')}. Accounts assigned to this plan lose these features on their next gate check; their subscription rows were not modified.`
          : undefined;
        return { success: true, warning };
      } catch (error) {
        if (error instanceof MaintenanceError) throw error;
        return failure(error, 'The feature matrix was not saved. Reload and check your administrator access.');
      }
    });
}
