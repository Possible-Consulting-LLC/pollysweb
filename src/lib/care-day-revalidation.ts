import { calendarDayKey, careDueForReview } from './constellation';
import { POST_MOLT_RECOVERY_DAYS } from './care';
import { applyCareProgress, type ManualCheckin } from './care-progress';

export type CareEvidence = { spiderId: string; type: string; date: Date; qualifies: boolean; dayKey?: string };
export type CareSnapshot = {
  spiderIds: string[];
  deferred: Record<string, { feeding?: string; misting?: string }>;
  policy: { feedIntervalDays: number; mistIntervalDays: number; statuses: Record<string, string> };
  manualReviewedIds: string[];
};
const ordinal = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86400000;

export function careDayStillQualifies(dayKey: string, zone: string, snapshot: CareSnapshot, evidence: CareEvidence[], manual: ManualCheckin[], now: Date): boolean {
  if (!snapshot.spiderIds.length || dayKey > calendarDayKey(now, zone)) return false;
  const keyOf = (event: CareEvidence) => event.dayKey ?? calendarDayKey(event.date, zone);
  const bySpider = new Map<string, CareEvidence[]>();
  for (const event of evidence) {
    if (event.date > now || keyOf(event) > dayKey) continue;
    const group = bySpider.get(event.spiderId) ?? [];
    group.push(event); bySpider.set(event.spiderId, group);
  }
  const activity = snapshot.spiderIds.map(spiderId => {
    const today = (bySpider.get(spiderId) ?? []).filter(event => keyOf(event) === dayKey);
    return { spiderId, feeding: today.some(e => e.type === 'feeding'), misting: today.some(e => e.type === 'misting'), observation: today.some(e => e.type === 'observation') };
  });
  const items = snapshot.spiderIds.map(id => {
    const lastDay = (type: string, successOnly = false) => (bySpider.get(id) ?? []).filter(e => e.type === type && (!successOnly || e.qualifies)).reduce<string | null>((last, e) => {
      const day = keyOf(e); return !last || day > last ? day : last;
    }, null);
    const elapsed = (day: string | null) => day ? ordinal(dayKey) - ordinal(day) : null;
    const molt = elapsed(lastDay('molt', true));
    const mist = elapsed(lastDay('misting'));
    let status = snapshot.policy.statuses[id] ?? 'Normal';
    if (status === 'Post-molt recovery' && (molt === null || molt >= POST_MOLT_RECOVERY_DAYS)) status = 'Normal';
    return { id, due: careDueForReview({ status, daysSinceSuccessfulFeed: elapsed(lastDay('feeding', true)), daysSinceMolt: molt,
      feedIntervalDays: snapshot.policy.feedIntervalDays, mistDue: mist === null || mist >= snapshot.policy.mistIntervalDays }) };
  });
  const checkins = new Map(manual.map(item => [item.spiderId, item]));
  for (const id of snapshot.manualReviewedIds) if (!checkins.has(id)) checkins.set(id, { spiderId: id, deferred: snapshot.deferred[id] ?? {} });
  for (const [id, deferred] of Object.entries(snapshot.deferred)) {
    if (deferred.feeding?.trim() || deferred.misting?.trim()) checkins.set(id, { spiderId: id, deferred: { ...deferred, ...checkins.get(id)?.deferred } });
  }
  return applyCareProgress(items, activity, [...checkins.values()]).every(item => item.caredFor);
}
