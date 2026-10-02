import { drainCareCompletion, guardDerivedMaintenance } from './maintenance-write';
import { readRewardState } from "./reward-data";
import { randomUUID } from 'node:crypto';
import { prisma } from './db';
import { calendarDayKey } from './constellation';
import { reconcileCareDays } from './care-revalidation-data';
import { getCareReviewState, getConstellationData } from './constellation-data';
import { earnedCelebrations, type Celebration } from './care-progress';
import { resolveUserGates } from './features/gate';

/** Baseline existing awards before a mutation so old badges do not flood the screen. */
export async function baselineCelebrations(userId: string): Promise<boolean> {
  try {
    await guardDerivedMaintenance();
    const initialized = await prisma.$queryRaw<Array<{key:string}>>`SELECT key FROM "CelebratedReward" WHERE "userId" = ${userId} AND key = 'baseline:v1'`;
    if (initialized.length) return true;
    const data = await getConstellationData(userId);
    const keys = JSON.stringify([...earnedCelebrations(data.streak, data.stories).map(item => item.key), 'baseline:v1']);
    await prisma.$transaction(async tx => {
      await guardDerivedMaintenance(tx);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'care-rewards:' + userId}, 0))`;
      const existing = await tx.$queryRaw<Array<{key:string}>>`SELECT key FROM "CelebratedReward" WHERE "userId" = ${userId} AND key = 'baseline:v1'`;
      if (existing.length) return;
      await tx.$executeRaw`INSERT INTO "CelebratedReward" ("userId", "key") SELECT ${userId}, value FROM jsonb_array_elements_text(${keys}::jsonb) ON CONFLICT ("userId", "key") DO NOTHING`;
      await guardDerivedMaintenance(tx);
    });
    return true;
  } catch (error) { console.error('Could not baseline celebrations', error); return false; }
}

export async function awardCareDay(userId: string, data: Awaited<ReturnType<typeof getCareReviewState>>) {
  if (data.completedToday || !data.reviewItems.length || !data.reviewItems.every(item => item.caredFor)) return false;
  const activeIds = JSON.stringify(data.reviewItems.map(item => item.id).sort());
  const snapshot = JSON.stringify({ policy: data.policy, manualReviewedIds: data.reviewItems.filter(item => item.manuallyReviewed).map(item => item.id), spiderIds: data.reviewItems.map(item => item.id), deferred: Object.fromEntries(data.reviewItems.map(item => [item.id, item.deferred])) });
  await guardDerivedMaintenance();
  const inserted = await prisma.$queryRaw<Array<{id:string}>>`
    INSERT INTO "CareDay" ("id", "userId", "dayKey", "timeZone", "snapshot")
    SELECT ${randomUUID()}, ${userId}, ${data.todayKey}, ${data.timeZone}, ${snapshot}::jsonb
    WHERE (
      SELECT COALESCE(jsonb_agg("id" ORDER BY "id"), '[]'::jsonb) FROM "Spider"
      WHERE "userId" = ${userId} AND "memorializedAt" IS NULL
      AND (${data.writeState.proAccess} OR "id" = ${data.writeState.firstSpiderId})
    ) = ${activeIds}::jsonb
    AND to_char(timezone(${data.timeZone}, CURRENT_TIMESTAMP), 'YYYY-MM-DD') = ${data.todayKey}
    ON CONFLICT ("userId", "dayKey") DO NOTHING RETURNING "id"
  `;
  return inserted.length > 0;
}

const CELEBRATION_GATE_KEYS = ['journey.check_in', 'journey.streaks.view', 'journey.badges.view'] as const;

/** Gated streak/badge content is dropped from the payload; any unresolved gate counts as not entitled. */
async function celebrationEntitlements(userId: string) {
  try {
    const gates = await resolveUserGates(userId, CELEBRATION_GATE_KEYS);
    return { star: gates['journey.check_in'] === 'entitled' || gates['journey.streaks.view'] === 'entitled', badge: gates['journey.badges.view'] === 'entitled' };
  } catch { return { star: false, badge: false }; }
}

/** A celebration failure must never turn a saved care record into a failed save/retry. */
export async function finishCareCelebrations(userId: string, baselineReady: boolean, activityDate?: Date, manual = false, affectedSince = activityDate ?? new Date()): Promise<Celebration[]> {
  return drainCareCompletion(async () => {
  try {
    const entitlements = celebrationEntitlements(userId);
    const reconciled = await reconcileCareDays(userId, new Date(), affectedSince);
    const state = await getCareReviewState(userId);
    const qualifiesToday = manual || (activityDate && calendarDayKey(activityDate, state.timeZone) === state.todayKey);
    const star = qualifiesToday ? reconciled.restored.includes(state.todayKey) || await awardCareDay(userId, state) : false;
    const { data, badges } = await syncRewardClaims(userId, baselineReady);
    const result: Celebration[] = [];
    const allowed = await entitlements;
    if (star && allowed.star) result.push({ key: `care-day:${state.todayKey}`, kind: 'star', title: 'Today’s care star earned!', symbol: 'stars', message: `You’ve checked on all your spoods. Your streak is now ${data.streak.current} day${data.streak.current === 1 ? '' : 's'}!` });
    if (allowed.badge) result.push(...badges);
    return result;
  } catch (error) { console.error('Could not finish care celebrations', error); return []; }
  });
}

/** Ledger cleanup and new claims share a lock and a fresh eligibility read. */
async function syncRewardClaims(userId: string, award: boolean) {
  return prisma.$transaction(async tx => {
    await guardDerivedMaintenance(tx);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'care-rewards:' + userId}, 0))`;
    const data = await readRewardState(userId, new Date(), tx);
    const earned = earnedCelebrations(data.streak, data.stories);
    await tx.celebratedReward.deleteMany({ where: { userId, key: { notIn: ['baseline:v1', ...earned.map(item => item.key)] } } });
    const badges: Celebration[] = [];
    if (award) for (const badge of earned) {
      const inserted = await tx.celebratedReward.createMany({ data: [{ userId, key: badge.key }], skipDuplicates: true });
      if (inserted.count) badges.push(badge);
    }
    await guardDerivedMaintenance(tx);
    return { data, badges };
  }, { timeout: 20000 });
}

export async function forgetWithdrawnCelebrations(userId: string, affectedSince?: Date) {
  return drainCareCompletion(async () => {
  // Run care-day reconciliation before taking the reward lock (no nested locks).
  if (affectedSince) await reconcileCareDays(userId, new Date(), affectedSince);
  await syncRewardClaims(userId, false);
  });
}
