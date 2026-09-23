"use server";
import { maintenanceTransaction, drainCareCompletion } from '@/lib/maintenance-write';

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { withMutation } from '@/lib/mutation-boundary';

import { revalidatePath } from 'next/cache';
import { getCareWriteUser, type ActionResult } from './care-shared';
import { getCareReviewState } from '@/lib/constellation-data';
import { baselineCelebrations, finishCareCelebrations } from '@/lib/care-celebrations';

export async function completeCareDay(formData: FormData): Promise<ActionResult> {
  return withMutation(formData, 'data', 'completecareday', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user?.id) return { ok: false, error: 'Please sign in again.' };
      const state = await getCareReviewState(user.id);
      if (state.completedToday) return { ok: true, message: 'Today’s star is already lit.' };
      const reviewed = new Set(formData.getAll('reviewed').map(String));
      if ([...reviewed].some(id => !state.reviewItems.some(item => item.id === id))) {
        return { ok: false, error: 'Your collection changed. Refresh and try again.' };
      }
      const entries: { id: string; deferred: string; }[] = [];
      for (const item of state.reviewItems) {
        if (!reviewed.has(item.id) && !item.reviewed) continue;
        const feeding = String(formData.get(`defer:${item.id}:feeding`) ?? item.deferred.feeding ?? '').trim();
        const misting = String(formData.get(`defer:${item.id}:misting`) ?? item.deferred.misting ?? '').trim();
        if (feeding.length > 240 || misting.length > 240) return { ok: false, error: 'Keep each care note under 240 characters.' };
        // Automatic checks stay derived from logs; persist only explicit check-ins/deferrals.
        if (reviewed.has(item.id) || feeding || misting) entries.push({ id: item.id, deferred: JSON.stringify({ feeding, misting }) });
      }
      const baseline = await baselineCelebrations(user.id);
      await maintenanceTransaction(async tx => {
        for (const entry of entries) await tx.$executeRaw`
        INSERT INTO "CareCheckin" ("userId", "spiderId", "dayKey", "deferred")
        SELECT ${user.id}, s.id, ${state.todayKey}, ${entry.deferred}::jsonb FROM "Spider" s
        WHERE s.id = ${entry.id} AND s."userId" = ${user.id} AND s."memorializedAt" IS NULL
          AND (${state.writeState.proAccess} OR s.id = ${state.writeState.firstSpiderId})
          AND to_char(timezone(${state.timeZone}, CURRENT_TIMESTAMP), 'YYYY-MM-DD') = ${state.todayKey}
        ON CONFLICT ("userId", "dayKey", "spiderId") DO UPDATE SET deferred = EXCLUDED.deferred
      `;
      });
      const celebrations = await finishCareCelebrations(user.id, baseline, undefined, true);
      const fresh = await drainCareCompletion(() => getCareReviewState(user.id!)).catch(() => null);
      revalidatePath('/home'); revalidatePath('/constellation');
      return { ok: true, celebrations, message: !fresh ? 'Check-in saved. Reload to refresh your care progress.' : fresh.completedToday ? 'Today’s care star is lit.' : `Check-in saved. ${fresh.reviewItems.filter(item => item.caredFor).length} of ${fresh.reviewItems.length} spoods cared for. Log or defer any remaining care to earn today’s star.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error('completeCareDay', error);
      return { ok: false, error: 'Could not save your check-in. Please try again.' };
    }

  });
}
