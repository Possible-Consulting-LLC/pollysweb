'use server';
import { revalidatePath } from 'next/cache';
import { withMutation } from '@/lib/mutation-boundary';
import { requireAdminActor } from '@/lib/admin/actor';
import { setMaintenance, setAnnouncement } from '@/lib/admin/maintenance-state';
import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { allowAction, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import type { MutationFailure } from '@/lib/mutation-failure';
type Result = {
  success: true;
} | {
  error: string;
} | MutationFailure;
export async function setMaintenanceAction(operation: 'start' | 'cancel' | 'reopen', form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'maintenance', async () => {
    try {
      const confirmation = form.get('confirmation');
      const phrases = { start: 'START MAINTENANCE', cancel: 'CANCEL MAINTENANCE', reopen: 'REOPEN SITE' } as const;
      if (!(operation in phrases) || confirmation !== phrases[operation])
        return { error: 'Type the exact confirmation phrase before changing maintenance.' };
      const actor = await requireAdminActor('super_admin');
      if (!await allowAction('care', actor.id))
        return { error: RATE_LIMIT_MESSAGE };
      await setMaintenance(actor, Number(form.get('version')), operation);
      revalidatePath('/admin/maintenance');
      return { success: true };
    }
    catch (error) {
      if (error instanceof MaintenanceError)
        throw error;
      return { error: error instanceof Error ? error.message : 'Maintenance could not be changed.' };
    }
  });
}
export async function setAnnouncementAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'maintenanceannouncement', async () => {
    try {
      const actor = await requireAdminActor('super_admin');
      if (!await allowAction('care', actor.id))
        return { error: RATE_LIMIT_MESSAGE };
      await setAnnouncement(actor, Number(form.get('version')), form.get('enabled') === 'on', String(form.get('announcement') ?? ''));
      revalidatePath('/admin/maintenance');
      return { success: true };
    }
    catch (error) {
      if (error instanceof MaintenanceError)
        throw error;
      return { error: error instanceof Error ? error.message : 'Announcement could not be changed.' };
    }
  });
}
