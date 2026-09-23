'use server';

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { withMutation } from '@/lib/mutation-boundary';

import { revalidatePath } from 'next/cache';
import { AdminAccessError, requireAdminActor } from '@/lib/admin/actor';
import {
  AccountInputError, AccountVersionError, accountPatchFromForm, completeFacebookDeletion, requestAdminEmailChange, setAccountRole, setAccountSuspended, updateAccount,
  type AccountPatch, type FacebookProvenanceReview
} from '@/lib/admin/accounts';
import type { AdminRole } from '@/lib/admin/policy';

export type AdminAccountActionResult = { success?: boolean; error?: string; };
const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const versionNumber = (version: number) => Number.isSafeInteger(version) && version >= 0 ? version : -1;
function resultError(error: unknown): AdminAccountActionResult {
  console.error('[admin-accounts] action failed', error instanceof Error ? error.message : 'Unknown error');
  return {
    error: error instanceof AccountInputError || error instanceof AccountVersionError || error instanceof AdminAccessError
      ? error.message : 'The account change could not be completed. Try again.'
  };
}
function refresh(targetId?: string) {
  revalidatePath('/admin/accounts'); revalidatePath('/admin/operations');
  if (targetId) revalidatePath(`/admin/accounts/${targetId}`);
}

export async function updateAccountAction(targetId: string, version: number, form: FormData): Promise<AdminAccountActionResult> {
  return withMutation(form, 'admin', 'updateaccountaction', async () => {
    try {
      const actor = await requireAdminActor('admin');
      const patch: AccountPatch = accountPatchFromForm(form);
      await updateAccount(actor, targetId, versionNumber(version), patch, value(form, 'reason'));
      refresh(targetId); return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error; return resultError(error);
    }

  });
}

export async function requestAdminEmailChangeAction(targetId: string, form: FormData): Promise<AdminAccountActionResult> {
  return withMutation(form, 'admin', 'requestadminemailchangeaction', async () => {
    try {
      const actor = await requireAdminActor('admin');
      await requestAdminEmailChange(actor, targetId, value(form, 'email'), value(form, 'reason'));
      refresh(targetId); return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error; return resultError(error);
    }

  });
}

export async function setAccountSuspendedAction(targetId: string, version: number, suspended: boolean, form: FormData): Promise<AdminAccountActionResult> {
  return withMutation(form, 'admin', 'setaccountsuspendedaction', async () => {
    const confirmation = suspended ? 'SUSPEND ACCOUNT' : 'REINSTATE ACCOUNT';
    if (value(form, 'confirmation') !== confirmation) return { error: `Type ${confirmation} to confirm.` };
    try {
      const actor = await requireAdminActor('admin');
      await setAccountSuspended(actor, targetId, versionNumber(version), suspended, value(form, 'reason') || `Administrator ${suspended ? 'suspension' : 'reinstatement'}`);
      refresh(targetId); return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error; return resultError(error);
    }

  });
}

export async function setAccountRoleAction(targetId: string, version: number, role: AdminRole, form: FormData): Promise<AdminAccountActionResult> {
  return withMutation(form, 'admin', 'setaccountroleaction', async () => {
    if (value(form, 'confirmation') !== 'CHANGE ROLE') return { error: 'Type CHANGE ROLE to confirm.' };
    try {
      const actor = await requireAdminActor('super_admin');
      await setAccountRole(actor, targetId, versionNumber(version), role, value(form, 'reason') || 'Administrative role change');
      refresh(targetId); return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error; return resultError(error);
    }

  });
}

export async function completeFacebookDeletionAction(targetId: string, version: number, requestId: string, form: FormData): Promise<AdminAccountActionResult> {
  return withMutation(form, 'admin', 'completefacebookdeletionaction', async () => {
    if (value(form, 'confirmation') !== 'COMPLETE FACEBOOK DELETION') return { error: 'Type COMPLETE FACEBOOK DELETION to confirm.' };
    try {
      const actor = await requireAdminActor('admin');
      const review: FacebookProvenanceReview = {
        name: value(form, 'nameProvenance') as FacebookProvenanceReview['name'],
        image: value(form, 'imageProvenance') as FacebookProvenanceReview['image'], email: value(form, 'emailProvenance') as FacebookProvenanceReview['email']
      };
      await completeFacebookDeletion(actor, targetId, versionNumber(version), requestId, review, value(form, 'reason'));
      refresh(targetId); return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error; return resultError(error);
    }

  });
}
