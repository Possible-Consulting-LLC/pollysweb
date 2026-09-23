'use server';

import { withMutation } from '@/lib/mutation-boundary';
import { withAdminControl } from '@/lib/admin/actor';
import { cleanupAudit } from '@/lib/admin/audit';
import { allowAction } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';
export async function cleanupAuditAction(form: FormData): Promise<{ error?: string; success?: boolean }> {
  return withMutation(form, 'admin', 'cleanupauditaction', async () => {
    if (form.get('confirmation') !== 'DELETE EXPIRED EVENTS') return { error: 'Enter the exact confirmation to continue.' };
    try {
      await withAdminControl(async (tx, actor) => {
        if (!await allowAction('password', actor.id)) throw new Error('Rate limited');
        await cleanupAudit(tx, actor.id, new Date());
      });
      revalidatePath('/admin/audit');
      return { success: true };
    } catch { return { error: 'Cleanup was not completed. Confirm your identity again, then retry.' }; }

  });
}
