import { Prisma } from '@prisma/client';
import { effectiveProWhere } from '../effective-entitlement-query';
import { reportingDates, reportingDayKey, type ReportingPeriod } from './analytics-period';

export const CARE_TYPES = ['feeding', 'misting', 'molt', 'observation', 'bodyCondition', 'enclosureMaintenance'] as const;
export type CareType = typeof CARE_TYPES[number];
export type DailyCount = { day: string; registrations: number; care: number };
export type BadgeCount = { id: string; count: number };
export type BadgeSnapshot = { counts: BadgeCount[]; generatedAt: string };
export type AdminMetrics = {
  totals: {
    accounts: number; ordinaryAccounts: number; demoAccounts: number;
    activeSpoods: number; memorializedSpoods: number;
    effectiveFree: number; effectivePro: number; payingCustomers: number;
  };
  newAccountCount: number;
  activeKeeperCount: number;
  perDayCounts: DailyCount[];
  careTypeCounts: { type: CareType; count: number }[];
  topKeepers: { userId: string; name: string | null; count: number }[];
  starCount: number;
  badgeCounts: BadgeCount[];
  generatedAt: string;
  badgesGeneratedAt: string;
};
type ActivityAggregate = Pick<AdminMetrics, 'newAccountCount' | 'activeKeeperCount' | 'perDayCounts' | 'careTypeCounts' | 'topKeepers' | 'starCount'>;
export type MetricsDatabase = Pick<Prisma.TransactionClient, 'user' | 'spider' | '$queryRaw'>;

function endPredicate(column: Prisma.Sql, period: ReportingPeriod) {
  return period.partialToday ? Prisma.sql`${column} <= ${period.end}::timestamp` : Prisma.sql`${column} < ${period.end}::timestamp`;
}
function intervalPredicate(column: Prisma.Sql, period: ReportingPeriod) {
  return Prisma.sql`${column} >= ${period.start}::timestamp AND ${endPredicate(column, period)}`;
}

/** All variable values are parameters. UTC-naive Prisma timestamps are first interpreted as UTC. */
export function activityQuery(period: ReportingPeriod, includeDemo: boolean): Prisma.Sql {
  const demo = includeDemo ? Prisma.empty : Prisma.sql`WHERE "isDemo" = false`;
  return Prisma.sql`
    WITH keepers AS (SELECT id, name, "createdAt" FROM "User" ${demo}),
    events AS (
      SELECT s."userId", e.date, 'feeding' AS type FROM "FeedingEvent" e
        JOIN "Spider" s ON s.id = e."spiderId" JOIN keepers u ON u.id = s."userId" WHERE ${intervalPredicate(Prisma.sql`e.date`, period)}
      UNION ALL SELECT s."userId", e.date, 'misting' FROM "MistingEvent" e
        JOIN "Spider" s ON s.id = e."spiderId" JOIN keepers u ON u.id = s."userId" WHERE ${intervalPredicate(Prisma.sql`e.date`, period)}
      UNION ALL SELECT s."userId", m."moltDate", 'molt' FROM "MoltEvent" m
        JOIN "Spider" s ON s.id = m."spiderId" JOIN keepers u ON u.id = s."userId" WHERE ${intervalPredicate(Prisma.sql`m."moltDate"`, period)}
      UNION ALL SELECT s."userId", e.date, 'observation' FROM "ObservationEvent" e
        JOIN "Spider" s ON s.id = e."spiderId" JOIN keepers u ON u.id = s."userId" WHERE ${intervalPredicate(Prisma.sql`e.date`, period)}
      UNION ALL SELECT s."userId", e.date, 'bodyCondition' FROM "BodyConditionEvent" e
        JOIN "Spider" s ON s.id = e."spiderId" JOIN keepers u ON u.id = s."userId" WHERE ${intervalPredicate(Prisma.sql`e.date`, period)}
      UNION ALL SELECT s."userId", e.date, 'enclosureMaintenance' FROM "EnclosureMaintenanceEvent" e
        JOIN "Enclosure" en ON en.id = e."enclosureId" JOIN "Spider" s ON s.id = en."spiderId"
        JOIN keepers u ON u.id = s."userId" WHERE ${intervalPredicate(Prisma.sql`e.date`, period)}
    ), registrations AS (SELECT "createdAt" FROM keepers WHERE ${intervalPredicate(Prisma.sql`"createdAt"`, period)}),
    daily AS (
      SELECT to_char(date AT TIME ZONE 'UTC' AT TIME ZONE ${period.zone}, 'YYYY-MM-DD') AS day, 0::bigint AS registrations, count(*) AS care FROM events GROUP BY 1
      UNION ALL SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${period.zone}, 'YYYY-MM-DD'), count(*), 0::bigint FROM registrations GROUP BY 1
    ), day_counts AS (SELECT day, sum(registrations) AS registrations, sum(care) AS care FROM daily GROUP BY day),
    type_counts AS (SELECT type, count(*) AS count FROM events GROUP BY type),
    top_keepers AS (SELECT e."userId", u.name, count(*) AS count FROM events e JOIN keepers u ON u.id = e."userId"
      GROUP BY e."userId", u.name ORDER BY count(*) DESC, e."userId" LIMIT 10)
    SELECT (SELECT count(*)::int FROM registrations) AS "newAccountCount",
      (SELECT COUNT(DISTINCT "userId")::int FROM events) AS "activeKeeperCount",
      COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY day) FROM day_counts d), '[]'::jsonb) AS "perDayCounts",
      COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY type) FROM type_counts t), '[]'::jsonb) AS "careTypeCounts",
      COALESCE((SELECT jsonb_agg(to_jsonb(k) ORDER BY count DESC, "userId") FROM top_keepers k), '[]'::jsonb) AS "topKeepers",
      (SELECT count(*)::int FROM "CareDay" c JOIN keepers u ON u.id = c."userId"
        WHERE c."invalidatedAt" IS NULL AND ${intervalPredicate(Prisma.sql`c."completedAt"`, period)}) AS "starCount"
  `;
}

/** Lifetime eligibility as of now, grouped entirely in PostgreSQL. Returns at most 12 rows.
 * Streak islands operate on the saved keeper dayKey, never the administrator's zone.
 * Missing/invalid keeper preferences use UTC (there is no keeper browser in this context).
 */
export function badgeQuery(_period: ReportingPeriod, includeDemo: boolean, now: Date): Prisma.Sql {
  return Prisma.sql`
    WITH keepers AS (
      SELECT u.id, COALESCE(z.name, 'UTC') AS zone,
        to_char(${now}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(z.name, 'UTC'), 'YYYY-MM-DD') AS today
      FROM "User" u LEFT JOIN LATERAL (SELECT name FROM pg_timezone_names WHERE lower(name) = lower(trim(u.timezone)) ORDER BY name LIMIT 1) z ON true
      ${includeDemo ? Prisma.empty : Prisma.sql`WHERE u."isDemo" = false`}
    ), valid_days AS (
      SELECT c."userId", c."dayKey" FROM "CareDay" c JOIN keepers u ON u.id = c."userId"
      WHERE c."invalidatedAt" IS NULL AND c."completedAt" <= ${now}::timestamp
    ), islands AS (
      SELECT "userId", "dayKey"::date - (row_number() OVER (PARTITION BY "userId" ORDER BY "dayKey"))::int AS island FROM valid_days
    ), runs AS (SELECT "userId", count(*) AS length FROM islands GROUP BY "userId", island),
    best AS (SELECT "userId", max(length) AS length FROM runs GROUP BY "userId"),
    story_spiders AS (
      SELECT s.id, s."userId", u.today,
        CASE WHEN s."acquisitionDate" IS NOT NULL AND s."acquisitionDate"::time = time '00:00:00'
          THEN s."acquisitionDate"::date
          ELSE (COALESCE(s."acquisitionDate", s."createdAt") AT TIME ZONE 'UTC' AT TIME ZONE u.zone)::date END AS start_day
      FROM "Spider" s JOIN keepers u ON u.id = s."userId"
    ), story_eligibility AS (
      SELECT s."userId", 'firstPortrait' AS id FROM story_spiders s JOIN "Photo" p ON p."spiderId" = s.id WHERE p."createdAt" <= ${now}::timestamp
      UNION SELECT s."userId", 'sharpEyes' FROM story_spiders s JOIN "ObservationEvent" e ON e."spiderId" = s.id WHERE e.kind <> 'play and interaction' AND e.date <= ${now}::timestamp
      UNION SELECT s."userId", 'sharpEyes' FROM story_spiders s JOIN "BodyConditionEvent" e ON e."spiderId" = s.id WHERE e.date <= ${now}::timestamp
      UNION SELECT s."userId", 'silkArchitect' FROM story_spiders s JOIN "ObservationEvent" e ON e."spiderId" = s.id WHERE e.kind = 'built a new hammock' AND e.date <= ${now}::timestamp
      UNION SELECT s."userId", 'freshSuit' FROM story_spiders s JOIN "MoltEvent" e ON e."spiderId" = s.id WHERE e.successful = true AND e."moltDate" <= ${now}::timestamp
      UNION SELECT s."userId", 'newChapter' FROM story_spiders s JOIN "Enclosure" en ON en."spiderId" = s.id
        JOIN "EnclosureMaintenanceEvent" e ON e."enclosureId" = en.id WHERE e.kind = 'rehouse' AND e.date <= ${now}::timestamp
      UNION SELECT s."userId", 'spoodiversary' FROM story_spiders s WHERE s.today::date >=
        (make_date(extract(year FROM start_day)::int + 1, extract(month FROM start_day)::int, 1) + (extract(day FROM start_day)::int - 1))
    ), eligibility AS (
      SELECT "userId", id FROM story_eligibility
      UNION ALL SELECT b."userId", 'streak-' || threshold::text FROM best b
        CROSS JOIN unnest(ARRAY[1,3,7,14,30,100]) threshold WHERE b.length >= threshold
    ) SELECT id, count(DISTINCT "userId")::int AS count FROM eligibility GROUP BY id ORDER BY id
  `;
}

export async function queryAdminMetrics(db: MetricsDatabase, period: ReportingPeriod, includeDemo: boolean, now: Date): Promise<Omit<AdminMetrics, 'badgeCounts' | 'badgesGeneratedAt'>> {
  const [accounts, demoAccounts, activeSpoods, memorializedSpoods, pro, payingCustomers, activity] = await Promise.all([
    db.user.count(), db.user.count({ where: { isDemo: true } }),
    db.spider.count({ where: { memorializedAt: null } }), db.spider.count({ where: { memorializedAt: { not: null } } }),
    db.user.count({ where: effectiveProWhere(now) }),
    db.user.count({ where: { isDemo: false, stripeCustomerId: { not: null }, stripeSubscriptionId: { not: null }, subscriptionStatus: 'active' } }),
    db.$queryRaw<ActivityAggregate[]>(activityQuery(period, includeDemo)),
  ]);
  const row = activity[0];
  if (!row) throw new Error('Metrics query returned no aggregate.');
  const days = new Map(row.perDayCounts.map(day => [day.day, day]));
  return {
    totals: { accounts, demoAccounts, ordinaryAccounts: accounts - demoAccounts, activeSpoods, memorializedSpoods, effectiveFree: accounts - pro, effectivePro: pro, payingCustomers },
    ...row,
    perDayCounts: reportingDates(period).map(day => days.get(day) ?? { day, registrations: 0, care: 0 }),
    careTypeCounts: CARE_TYPES.map(type => ({ type, count: row.careTypeCounts.find(row => row.type === type)?.count ?? 0 })),
    generatedAt: now.toISOString(),
  };
}

export function badgeCacheKey(period: ReportingPeriod, includeDemo: boolean) {
  // Partial endpoints share a minute-long snapshot for the same local end date;
  // exact closed endpoints and local rollover still use separate entries.
  return JSON.stringify([period.zone, period.start.toISOString(),
    period.partialToday ? reportingDayKey(period.end, period.zone) : period.end.toISOString(), period.partialToday, includeDemo]);
}
