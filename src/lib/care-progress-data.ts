import { prisma } from './db';
import { applyCareProgress, type CareActivity, type ManualCheckin } from './care-progress';

export async function withCareProgress<T extends {id: string; due: {feeding:boolean;misting:boolean}}>(userId: string, todayKey: string, timeZone: string, items: T[], now = new Date()) {
  const [activity, manual] = await Promise.all([
    prisma.$queryRaw<CareActivity[]>`
      SELECT e."spiderId", bool_or(e.kind = 'feeding') AS feeding,
        bool_or(e.kind = 'misting') AS misting, bool_or(e.kind = 'observation') AS observation
      FROM (
        SELECT f."spiderId", f."date", 'feeding' AS kind FROM "FeedingEvent" f JOIN "Spider" s ON s.id = f."spiderId" WHERE s."userId" = ${userId} AND f."date" >= ${now}::timestamp - interval '2 days'
        UNION ALL
        SELECT f."spiderId", f."date", 'misting' AS kind FROM "MistingEvent" f JOIN "Spider" s ON s.id = f."spiderId" WHERE s."userId" = ${userId} AND f."date" >= ${now}::timestamp - interval '2 days'
        UNION ALL
        SELECT f."spiderId", f."date", 'observation' AS kind FROM "ObservationEvent" f JOIN "Spider" s ON s.id = f."spiderId" WHERE s."userId" = ${userId} AND f.kind <> 'play and interaction' AND f."date" >= ${now}::timestamp - interval '2 days'
        UNION ALL
        SELECT f."spiderId", f."date", 'observation' AS kind FROM "BodyConditionEvent" f JOIN "Spider" s ON s.id = f."spiderId" WHERE s."userId" = ${userId} AND f."date" >= ${now}::timestamp - interval '2 days'
      ) e WHERE e."date" <= ${now}::timestamp
        AND to_char(timezone(${timeZone}, e."date" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') = ${todayKey}
      GROUP BY e."spiderId"
    `,
    prisma.$queryRaw<ManualCheckin[]>`SELECT "spiderId", deferred FROM "CareCheckin" WHERE "userId" = ${userId} AND "dayKey" = ${todayKey}`,
  ]);
  return applyCareProgress(items, activity, manual);
}
