import { prisma } from './db';
import { calendarDayKey } from './constellation';
import { careDayStillQualifies, type CareEvidence, type CareSnapshot } from './care-day-revalidation';
import { SUCCESSFUL_FEEDING_OUTCOMES } from './constants';
import type { ManualCheckin } from './care-progress';
import { POST_MOLT_RECOVERY_DAYS } from './care';

/** Reversible invalidation keeps the original collection/settings available for later corrections. */
export async function reconcileCareDays(userId: string, now = new Date(), affectedSince = now) {
  const { derivedMutationIdentity, recordDerivedChange } = await import("./derived-mutation");
  const identity = await derivedMutationIdentity(userId);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'care-rewards:' + userId}, 0))`;
    // An edited event can change its own local care day and every later care day,
    // but it cannot affect earlier days. Subtract one UTC day to cover all IANA
    // offsets when converting the changed instant to a saved local day key.
    const lowerBoundInstant = new Date(affectedSince.getTime() - 24 * 60 * 60 * 1000);
    const lowerBoundDayKey = calendarDayKey(lowerBoundInstant, 'UTC');
    const days = await tx.careDay.findMany({ where: { userId, dayKey: { gte: lowerBoundDayKey } } });
    const result = { withdrawn: [] as string[], restored: [] as string[] };
    if (!days.length) return result;
    const dayKeys = [...new Set(days.map(day => day.dayKey))];
    const [user, spiders] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { feedDefaultDays: true, mistDefaultDays: true } }),
      tx.spider.findMany({ where: { userId }, select: { id: true, status: true } }),
    ]);
    const intervalDays = days.reduce((maximum, day) => {
      const policy = (day.snapshot as unknown as Partial<CareSnapshot>).policy;
      return Math.max(maximum, policy?.feedIntervalDays ?? 0, policy?.mistIntervalDays ?? 0);
    }, Math.max(user.feedDefaultDays, user.mistDefaultDays));
    // One additional day covers timezone conversion. Ordinary current-day saves
    // therefore read only the reminder horizon, independent of account age.
    const evidenceSince = new Date(`${lowerBoundDayKey}T00:00:00.000Z`);
    evidenceSince.setUTCDate(evidenceSince.getUTCDate() - Math.max(1, intervalDays, POST_MOLT_RECOVERY_DAYS) - 1);
    const eventRange = { gte: evidenceSince, lte: now };
    const [feedings, mistings, observations, body, molts, checkins] = await Promise.all([
      tx.feedingEvent.findMany({ where: { spider: { userId }, date: eventRange }, select: { spiderId: true, date: true, outcome: true } }),
      tx.mistingEvent.findMany({ where: { spider: { userId }, date: eventRange }, select: { spiderId: true, date: true } }),
      tx.observationEvent.findMany({ where: { spider: { userId }, kind: { not: 'play and interaction' }, date: eventRange }, select: { spiderId: true, date: true } }),
      tx.bodyConditionEvent.findMany({ where: { spider: { userId }, date: eventRange }, select: { spiderId: true, date: true } }),
      tx.moltEvent.findMany({ where: { spider: { userId }, moltDate: eventRange }, select: { spiderId: true, moltDate: true, successful: true } }),
      tx.careCheckin.findMany({ where: { userId, dayKey: { in: dayKeys } } }),
    ]);
    const evidence: CareEvidence[] = [
      ...feedings.map(e => ({ ...e, type: 'feeding', qualifies: (SUCCESSFUL_FEEDING_OUTCOMES as readonly string[]).includes(e.outcome) })),
      ...mistings.map(e => ({ ...e, type: 'misting', qualifies: true })),
      ...[...observations, ...body].map(e => ({ ...e, type: 'observation', qualifies: true })),
      ...molts.map(e => ({ spiderId: e.spiderId, date: e.moltDate, type: 'molt', qualifies: e.successful })),
    ];
    const zoned = new Map<string, CareEvidence[]>();
    for (const day of days) {
      if (!zoned.has(day.timeZone)) zoned.set(day.timeZone, evidence.map(e => ({ ...e, dayKey: calendarDayKey(e.date, day.timeZone) })));
      const dayEvidence = zoned.get(day.timeZone)!;
      const original = day.snapshot as unknown as Partial<CareSnapshot>;
      if (!Array.isArray(original.spiderIds) || !original.spiderIds.length) continue;
      const manual = checkins.filter(c => c.dayKey === day.dayKey).map(c => ({ spiderId: c.spiderId, deferred: c.deferred as ManualCheckin['deferred'] }));
      // Legacy completions predate saved policies. Capture the available context once,
      // BEFORE an edit/deletion. A review with no automatic log is a legacy manual check-in.
      const snapshot: CareSnapshot = {
        spiderIds: original.spiderIds,
        deferred: original.deferred ?? {},
        policy: original.policy ?? { feedIntervalDays: user.feedDefaultDays, mistIntervalDays: user.mistDefaultDays, statuses: Object.fromEntries(spiders.map(s => [s.id, s.status])) },
        manualReviewedIds: original.manualReviewedIds ?? original.spiderIds.filter(id => manual.some(c => c.spiderId === id) || !dayEvidence.some(e => e.spiderId === id && ['feeding','misting','observation'].includes(e.type) && e.date <= now && e.dayKey === day.dayKey)),
      };
      const valid = careDayStillQualifies(day.dayKey, day.timeZone, snapshot, dayEvidence, manual, now);
      if (valid && day.invalidatedAt) result.restored.push(day.dayKey);
      if (!valid && !day.invalidatedAt) result.withdrawn.push(day.dayKey);
      if (!original.policy || !original.manualReviewedIds || valid === Boolean(day.invalidatedAt)) {
        await recordDerivedChange(tx, identity, () => tx.careDay.update({ where: { id: day.id }, data: { snapshot: JSON.parse(JSON.stringify(snapshot)), invalidatedAt: valid ? null : day.invalidatedAt ?? now } }));
      }
    }
    return result;
  }, { timeout: 20000 });
}
