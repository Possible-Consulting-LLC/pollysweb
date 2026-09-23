import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { activityQuery, badgeQuery, queryAdminMetrics, type MetricsDatabase } from './metrics';
import { reportingPeriod } from './analytics-period';
import { effectiveProWhere } from '../effective-entitlement-query';
import { effectivePro } from '../effective-entitlement';

const now = new Date('2026-03-10T19:00:00Z');
const period = reportingPeriod('America/Los_Angeles', 7, now);

// This small evaluator executes the emitted Prisma filter against fixture rows.
// SQL itself remains a staging checkpoint; its real parameter/shape contract is tested below.
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Record<string, unknown>[]).some(clause => matches(row, clause));
    if (key === 'AND') return (value as Record<string, unknown>[]).every(clause => matches(row, clause));
    if (key === 'NOT') return !matches(row, value as Record<string, unknown>);
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
      if (op === 'not') return row[key] !== expected;
      if (op === 'in') return (expected as unknown[]).includes(row[key]);
      if (op === 'gte') return row[key] !== null && (row[key] as Date) >= (expected as Date);
      if (op === 'lte') return row[key] !== null && (row[key] as Date) <= (expected as Date);
      throw new Error(`Unhandled fixture predicate: ${op}`);
    });
    return row[key] === value;
  });
}
const ordinary = { isDemo: false, demoPlan: null, plan: 'free', stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: null, billingLastCheckedAt: null };
const users = [ordinary, { ...ordinary, isDemo: true, demoPlan: 'pro' },
  { ...ordinary, plan: 'pro', stripeCustomerId: 'cus_paid', stripeSubscriptionId: 'sub_paid', subscriptionStatus: 'active', billingLastCheckedAt: now },
  { ...ordinary, plan: 'pro' },
  { ...ordinary, plan: 'pro', stripeCustomerId: 'cus_stale', subscriptionStatus: 'active', billingLastCheckedAt: new Date('2026-03-01Z') },
  { ...ordinary, isDemo: true, demoPlan: 'free', plan: 'pro' }];

test('database entitlement filter agrees with shared effectivePro including demos, stale/future billing', () => {
  const fixtures = [...users, { ...users[2], billingLastCheckedAt: new Date(now.getTime() + 1) },
    { ...users[2], subscriptionStatus: 'trialing' }, { ...users[2], subscriptionStatus: 'past_due' },
    { ...users[2], billingLastCheckedAt: new Date(now.getTime() - 86400000) }];
  for (const user of fixtures) assert.equal(matches(user, effectiveProWhere(now)), effectivePro(user, now));
});

test('activity query binds zones/instants, unions all six current histories and caps bounded groups', () => {
  const query = activityQuery(period, false);
  const sql = query.sql;
  for (const table of ['FeedingEvent', 'MistingEvent', 'MoltEvent', 'ObservationEvent', 'BodyConditionEvent', 'EnclosureMaintenanceEvent']) assert.ok(sql.includes(`"${table}"`));
  assert.match(sql, /m\."moltDate"/);
  assert.match(sql, /JOIN "Enclosure"/);
  assert.match(sql, /AT TIME ZONE 'UTC'/);
  assert.match(sql, /COUNT\(DISTINCT "userId"\)/);
  assert.match(sql, /LIMIT 10/);
  assert.match(sql, /"isDemo" = false/);
  assert.doesNotMatch(sql, /updatedAt|CelebratedReward|play and interaction/);
  assert.equal(sql.includes(period.zone), false);
  assert.ok(query.values.includes(period.zone));
  assert.ok(query.values.some(value => value instanceof Date && value.getTime() === now.getTime()));
  assert.match(sql, /e\.date >=/);
  assert.match(sql, /e\.date <=/);
  assert.equal((sql.match(/e\.date >=/g) ?? []).length, 5);
  assert.equal((sql.match(/e\.date <=/g) ?? []).length, 5);
  assert.match(sql, /m\."moltDate" >=/);
  assert.match(sql, /m\."moltDate" <=/);
  assert.doesNotMatch(sql, /"Photo"/);
  assert.match(sql, /c\."invalidatedAt" IS NULL/);
  assert.doesNotMatch(activityQuery(period, true).sql, /"isDemo" = false/);
  const closed = { ...period, partialToday: false };
  assert.match(activityQuery(closed, false).sql, /e\.date </);
});

test('badge query preserves original day keys and current eligibility, including withdrawn stars', () => {
  const query = badgeQuery(period, false, now);
  assert.match(query.sql, /"invalidatedAt" IS NULL/);
  assert.match(query.sql, /"completedAt" <=/);
  assert.match(query.sql, /"dayKey"::date -/);
  assert.doesNotMatch(query.sql, /CelebratedReward/);
  assert.match(query.sql, /pg_timezone_names/);
  assert.match(query.sql, /u\.timezone/);
  assert.match(query.sql, /lower\(name\) = lower\(trim\(u\.timezone\)\)/);
  assert.match(query.sql, /play and interaction/);
  assert.match(query.sql, /BodyConditionEvent/);
  assert.match(query.sql, /successful = true/);
  assert.match(query.sql, /kind = 'rehouse'/);
  assert.ok(query.values.includes(now));
});

test('bounded aggregate DTO fills empty local dates; inventory separates demo Pro and paying customers', async () => {
  const queries: Prisma.Sql[] = [];
  const db = {
    user: { count: async ({ where }: { where?: Record<string, unknown> } = {}) => users.filter(u => !where || matches(u, where)).length },
    spider: { count: async ({ where }: { where: Record<string, unknown> }) => [
      { memorializedAt: null }, { memorializedAt: null }, { memorializedAt: null }, { memorializedAt: new Date('2026-03-08Z') },
    ].filter(spider => matches(spider, where)).length },
    $queryRaw: async (query: Prisma.Sql) => { queries.push(query); return [{
      newAccountCount: 2, activeKeeperCount: 1,
      perDayCounts: [{ day: '2026-03-08', registrations: 2, care: 3 }],
      careTypeCounts: [{ type: 'feeding', count: 2 }, { type: 'observation', count: 1 }],
      topKeepers: [{ userId: 'keeper', name: 'Keeper', count: 3 }], starCount: 1,
    }]; },
  } as unknown as MetricsDatabase;
  const result = await queryAdminMetrics(db, period, false, now);
  assert.deepEqual(result.totals, { accounts: 6, ordinaryAccounts: 4, demoAccounts: 2, activeSpoods: 3, memorializedSpoods: 1, effectiveFree: 3, effectivePro: 3, payingCustomers: 1 });
  assert.equal(result.newAccountCount, 2);
  assert.equal(result.activeKeeperCount, 1);
  assert.equal(result.perDayCounts.length, 7);
  assert.deepEqual(result.perDayCounts[0], { day: '2026-03-04', registrations: 0, care: 0 });
  assert.equal(result.perDayCounts[4].care, 3);
  assert.equal(result.starCount, 1);
  assert.equal(queries.length, 1);
});


test('a Tokyo completion keeps its original streak key after the keeper changes to LA', async () => {
  const { summarizeStreak } = await import('../constellation');
  const originalKeys = ['2026-03-09', '2026-03-10', '2026-03-11'];
  // Tokyo is already March 11; Los Angeles is March 10 at the same instant.
  // readRewardState keeps the earned best streak even when the current zone changes.
  const existing = summarizeStreak(originalKeys, '2026-03-10');
  assert.equal(existing.best, 3);
  assert.equal(existing.earnedAt[3], '2026-03-11');
  const query = badgeQuery(period, false, now);
  assert.doesNotMatch(query.sql, /c\."dayKey" <= u\.today/);
  assert.match(query.sql, /max\(length\)/);
  assert.deepEqual(originalKeys, ['2026-03-09', '2026-03-10', '2026-03-11']);
});
