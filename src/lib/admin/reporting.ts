import 'server-only';
import { prisma } from '../db';
import { requireAdminActor } from './actor';
import { adminTimezone } from './presentation';
import { reportingDates, validateReportingZone, type ReportingPeriod } from './analytics-period';
import { queryAdminMetrics, type AdminMetrics } from './metrics';
import { loadCachedBadges } from './metrics-cache';

export async function getAdminReportingPreferences() {
  const actor = await requireAdminActor('admin');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { timezone: true } });
  return adminTimezone(user.timezone);
}

export async function getAdminDateFormatter() {
  const { timezone, fallback } = await getAdminReportingPreferences();
  return { timezone, fallback, dates: new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }) };
}

export async function loadAdminMetrics(period: ReportingPeriod, includeDemo = false): Promise<AdminMetrics> {
  const { timezone } = await getAdminReportingPreferences();
  const now = new Date();
  if (validateReportingZone(period.zone) !== timezone || !Number.isFinite(period.start.getTime()) ||
      !Number.isFinite(period.end.getTime()) || period.start > period.end || period.end > now || !reportingDates(period).length) {
    throw new Error('Reload to use your current reporting preference.');
  }
  const [metrics, badges] = await Promise.all([
    queryAdminMetrics(prisma, period, includeDemo, now), loadCachedBadges(period, includeDemo),
  ]);
  return { ...metrics, badgeCounts: badges.counts, badgesGeneratedAt: badges.generatedAt };
}
