'use server';

import { revalidatePath } from 'next/cache';
import { withMutation } from '@/lib/mutation-boundary';
import { withAdminReauthentication } from '@/lib/admin/actor';
import { reportingPeriod, validateReportingZone } from '@/lib/admin/analytics-period';
import { adminTimezone } from '@/lib/admin/presentation';
import { refreshCachedBadges } from '@/lib/admin/metrics-cache';

type Result = { error?: string; success?: boolean };

export async function refreshMetricsAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'refreshmetrics', async () => {
    const days = Number(form.get('days'));
    if (days !== 7 && days !== 14) return { error: 'Choose a seven or fourteen day period.' };
    try {
      await withAdminReauthentication(async (tx, actor) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { timezone: true } });
        const { timezone } = adminTimezone(user.timezone);
        refreshCachedBadges(reportingPeriod(timezone, days, new Date()), form.get('includeDemo') === 'yes');
      });
      revalidatePath('/admin');
      return { success: true };
    } catch { return { error: 'Metrics were not refreshed. Reload and check your administrator access.' }; }
  });
}

/** Own preferences are available to both admin roles, including the protected owner. */
export async function saveReportingTimezoneAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'savereportingtimezone', async () => {
    let timezone: string;
    try { timezone = validateReportingZone(String(form.get('timezone') ?? '')); }
    catch { return { error: 'Choose a valid IANA timezone.' }; }
    try {
      await withAdminReauthentication(async (tx, actor) => {
        await tx.user.update({ where: { id: actor.id }, data: { timezone } });
      });
      revalidatePath('/', 'layout');
      return { success: true };
    } catch { return { error: 'Timezone was not saved. Reload and check your administrator access.' }; }
  });
}
