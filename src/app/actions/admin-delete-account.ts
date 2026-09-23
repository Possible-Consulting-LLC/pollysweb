'use server';

import { withMutation } from '@/lib/mutation-boundary';
import { revalidatePath } from 'next/cache';
import { requireAdminActor } from '@/lib/admin/actor';
import { beginAccountDeletion, resumeAccountDeletion, getDeletionPreview, acknowledgeEndedUploads } from '@/lib/admin/deletion-store';
import type { DeleteStage } from '@/lib/admin/account-deletion';
import { allowAction, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
export type DeletionResult = { operationId?: string; stage?: DeleteStage; error?: string; };
export async function deletionPreviewAction(targetId: string, submittedContext: string): Promise<{ error?: string; preview?: Awaited<ReturnType<typeof getDeletionPreview>>; }> {
  return withMutation(submittedContext, 'admin', 'deletionpreviewaction', async () => {
    try { await requireAdminActor('super_admin'); return { preview: await getDeletionPreview(targetId) }; }
    catch { return { error: 'Deletion preview requires a recent super-admin identity confirmation.' }; }

  });
}
export async function beginAccountDeletionAction(targetId: string, version: number, form: FormData): Promise<DeletionResult> {
  return withMutation(form, 'admin', 'beginaccountdeletionaction', async () => {
    try {
      const actor = await requireAdminActor('super_admin');
      if (!await allowAction('admin-delete', actor.id)) return { error: RATE_LIMIT_MESSAGE };
      if (form.get('confirmed') !== 'yes') return { error: 'Confirm the permanent deletion and billing consequences.' };
      const operationId = await beginAccountDeletion(actor, { targetId, version, confirmationEmail: String(form.get('email') ?? ''), reason: String(form.get('reason') ?? '') });
      // Return the receipt before any slow external work. Refresh/retry always finds it.
      revalidatePath('/admin/accounts'); return { operationId, stage: 'blocked_access' };
    } catch { return { error: 'Deletion could not start. Reconfirm identity, check the typed email, and reload the impact preview.' }; }

  });
}
export async function resumeAccountDeletionAction(operationId: string, submittedContext: string): Promise<DeletionResult> {
  return withMutation(submittedContext, 'admin', 'resumeaccountdeletionaction', async () => {
    try {
      const actor = await requireAdminActor('super_admin');
      if (!await allowAction('admin-delete', actor.id)) return { operationId, error: RATE_LIMIT_MESSAGE };
      const stage = await resumeAccountDeletion(actor, operationId);
      revalidatePath('/admin/accounts'); revalidatePath('/admin/operations');
      return { operationId, stage, ...(stage !== 'completed' ? { error: 'Cleanup remains pending. Photo discovery, billing, storage, or an uncertain upload needs retry or review. Access stays blocked.' } : {}) };
    } catch { return { operationId, error: 'Deletion remains pending. Reconfirm your administrator identity and retry. No completion has been confirmed.' }; }

  });
}

export async function acknowledgeEndedUploadsAction(targetId: string, operationId: string, form: FormData): Promise<DeletionResult> {
  return withMutation(form, 'admin', 'acknowledgeendeduploadsaction', async () => {
    try {
      const actor = await requireAdminActor('super_admin');
      if (!await allowAction('admin-delete', actor.id)) return { operationId, error: RATE_LIMIT_MESSAGE };
      await acknowledgeEndedUploads(targetId, operationId, form.get('terminated') === 'yes', String(form.get('reason') ?? ''));
      return { operationId, error: 'Upload termination review recorded. Retry cleanup to remove the recorded objects.' };
    } catch { return { operationId, error: 'Recovery was not accepted. Reconfirm identity and complete the upload termination review.' }; }

  });
}
