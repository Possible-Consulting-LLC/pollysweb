'use server';

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { withMutation } from '@/lib/mutation-boundary';

import { revalidatePath } from 'next/cache';
import { requireAdminActor, withAdminMutation } from '@/lib/admin/actor';
import { appendAudit } from '@/lib/admin/audit';
import { setDemoAccount } from '@/lib/admin/demo-accounts';
import { recoverCheckoutForUser } from '@/lib/billing-service';
import type { DemoPlan } from '@/lib/effective-entitlement';

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
function refresh(targetId: string) {
  for (const path of ['/admin/demos', '/admin/accounts', '/admin/operations', `/admin/accounts/${targetId}`, '/settings', '/upgrade']) revalidatePath(path);
}
export async function setDemoAccountAction(targetId: string, remove: boolean, form: FormData): Promise<{ success?: boolean; error?: string; }> {
  return withMutation(form, 'admin', 'setdemoaccountaction', async () => {
    try {
      const actor = await requireAdminActor('super_admin');
      if (value(form, 'confirmation') !== (remove ? 'REMOVE DEMO' : 'DESIGNATE DEMO')) throw Error('Type the confirmation shown on the form.');
      await setDemoAccount(actor, targetId, remove ? null : {
        label: value(form, 'label'), plan: value(form, 'plan') as DemoPlan,
        confirmedDedicatedTestAccount: form.get('dedicatedTestAccount') === 'on'
      }, value(form, 'reason'));
      refresh(targetId);
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error; return { error: error instanceof Error ? error.message : 'Demo designation could not be changed.' };
    }

  });
}

export async function recoverDemoCheckoutAction(targetId: string, form: FormData): Promise<{ success?: boolean; error?: string; }> {
  return withMutation(form, 'admin', 'recoverdemocheckoutaction', async () => {
    try {
      const actor = await requireAdminActor('super_admin');
      const reason = value(form, 'reason');
      if (value(form, 'confirmation') !== 'RECOVER CHECKOUT' || !reason || reason.length > 500) throw Error('Confirm recovery and enter a short reason.');
      await recoverCheckoutForUser(targetId, work => withAdminMutation(targetId, 'demo', async (tx, live) => {
        if (actor.id !== live.id) throw Error('Administrator identity changed.');
        await appendAudit(tx, { actorId: live.id, targetId, action: 'billing.checkout.recovery', reason, changes: { phase: 'replay_original_request' } });
        return work(tx);
      }));
      refresh(targetId);
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error; return { error: error instanceof Error ? error.message : 'Checkout recovery could not be completed.' };
    }

  });
}
