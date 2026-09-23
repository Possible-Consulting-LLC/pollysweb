import 'server-only';
import { createHash } from 'node:crypto';
import { unstable_cache, updateTag } from 'next/cache';
import { prisma } from '../db';
import { badgeCacheKey, badgeQuery, type BadgeCount, type BadgeSnapshot } from './metrics';
import type { ReportingPeriod } from './analytics-period';

function cacheTag(period: ReportingPeriod, includeDemo: boolean) {
  return `admin-badges-${createHash('sha256').update(badgeCacheKey(period, includeDemo)).digest('hex')}`;
}

/** Next's shared data cache also invalidates across workers on explicit refresh. */
export async function loadCachedBadges(period: ReportingPeriod, includeDemo: boolean): Promise<BadgeSnapshot> {
  const tag = cacheTag(period, includeDemo);
  return unstable_cache(async () => {
    const now = new Date();
    const counts = await prisma.$queryRaw<BadgeCount[]>(badgeQuery(period, includeDemo, now));
    return { counts, generatedAt: now.toISOString() };
  }, [tag], { revalidate: 60, tags: [tag] })();
}

/** Server Action only: immediate expiration, not stale-while-revalidate. */
export function refreshCachedBadges(period: ReportingPeriod, includeDemo: boolean) {
  updateTag(cacheTag(period, includeDemo));
}
