'use server';

import { revalidatePath } from 'next/cache';
import { withMutation } from '@/lib/mutation-boundary';
import { withAdminControl } from '@/lib/admin/actor';
import { createPlan, deletePlan, duplicatePlan, reorderPlan, saveBillingOption,
  setBillingOptionActive, updatePlan } from '@/lib/admin/plans';
import { applyFeatureMatrix } from '@/lib/admin/plan-features';
import { FEATURE_REGISTRY } from '@/lib/features/registry';
import { MaintenanceError } from '@/lib/admin/maintenance-policy';

type Result = { error?: string; success?: boolean };

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
// Checkboxes submit "on"; hidden toggles submit "true"/"false".
const checked = (form: FormData, key: string) => form.get(key) === 'on' || form.get(key) === 'true';
const numberField = (form: FormData, key: string) => {
  const raw = value(form, key);
  return raw === '' ? null : Number(raw);
};

function readReason(form: FormData) {
  const reason = value(form, 'reason');
  if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
  return reason;
}

function planIdentity(form: FormData) {
  const planId = value(form, 'planId');
  if (!planId || planId.length > 128) throw Error('A valid plan is required.');
  return { planId, reason: value(form, 'reason') };
}

const failure = (error: unknown, fallback: string) =>
  ({ error: error instanceof Error && error.message ? error.message : fallback });

// Service failures may be Error instances from another module realm; the tag check works in both.
const isServiceError = (result: unknown): result is Error =>
  Object.prototype.toString.call(result) === '[object Error]';

const numberOrNull = (form: FormData, key: string) => {
  const raw = value(form, key);
  return raw === '' ? null : Number(raw);
};

export async function createPlanAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'createplan', async () => {
    try {
      const reason = value(form, 'reason');
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      const input = { name: value(form, 'name'), description: value(form, 'description'),
        planType: value(form, 'planType'), maxSpiders: numberOrNull(form, 'maxSpiders'),
        active: checked(form, 'active'), public: checked(form, 'public') };
      await withAdminControl(async (tx, actor) => {
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
      const { planId, reason } = planIdentity(form);
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      const input = { name: value(form, 'name'), description: value(form, 'description'),
        planType: value(form, 'planType'), maxSpiders: numberOrNull(form, 'maxSpiders'),
        active: checked(form, 'active'), public: checked(form, 'public') };
      await withAdminControl(async (tx, actor) => {
        const result = await updatePlan(tx, actor.id, planId, input, reason);
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
      const { planId, reason } = planIdentity(form);
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      await withAdminControl(async (tx, actor) => {
        const result = await duplicatePlan(tx, actor.id, planId, reason);
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
      const { planId, reason } = planIdentity(form);
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      await withAdminControl(async (tx, actor) => {
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
      const { planId, reason } = planIdentity(form);
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      const input = { interval: value(form, 'interval'),
        basePriceCents: Number(value(form, 'basePriceCents')), active: value(form, 'active') === 'true' };
      await withAdminControl(async (tx, actor) => {
        const result = await saveBillingOption(tx, actor.id, planId, input, reason);
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
      const { planId, reason } = planIdentity(form);
      const optionId = value(form, 'optionId');
      const requested = value(form, 'active');
      if (!optionId || optionId.length > 128) throw Error('A valid billing option is required.');
      if (requested !== 'true' && requested !== 'false') throw Error('Choose active or inactive.');
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      await withAdminControl(async (tx, actor) => {
        const result = await setBillingOptionActive(tx, actor.id, planId, optionId, requested === 'true', reason);
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
      const { planId, reason } = planIdentity(form);
      const direction = value(form, 'direction') === 'up' ? 'up' : 'down';
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      await withAdminControl(async (tx, actor) => {
        const result = await reorderPlan(tx, actor.id, planId, direction, reason);
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

/** Checkboxes named "feature" submit only the enabled keys; the matrix is
 * reconstructed over the full code registry so every save covers every
 * registered feature. A save that removes access from current subscribers
 * still succeeds and returns a warning (never a silent subscriber change). */
export async function saveFeatureMatrixAction(form: FormData): Promise<Result & { warning?: string }> {
  return withMutation(form, 'admin', 'savefeaturematrix',
    async (): Promise<Result & { warning?: string }> => {
      try {
        const { planId, reason } = planIdentity(form);
        if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
        const enabledKeys = new Set(form.getAll('feature').map(entry => String(entry)));
        const entries = FEATURE_REGISTRY.map(definition =>
          ({ key: definition.key, enabled: enabledKeys.has(definition.key) }));
        const applied = await withAdminControl(async (tx, actor) => {
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
