import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { calendarDayKey, deriveStoryRewards, summarizeStreak, type StorySpider } from './constellation';
import { resolveDisplayTimeZone } from './utils';

/** Uses only the supplied client so reward locks never wait on a second pool connection. */
export async function readRewardState(userId: string, now = new Date(), db: Prisma.TransactionClient = prisma) {
  const [user, days, spiders, photos, observations, bodyObservations, hammocks, molts, rehousings] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
    db.careDay.findMany({ where: { userId, invalidatedAt: null }, orderBy: { dayKey: 'asc' }, select: { dayKey: true, completedAt: true } }),
    db.spider.findMany({
      where: { userId },
      select: {
        id: true, name: true, createdAt: true, acquisitionDate: true,
        enclosure: { select: { id: true } },
      },
    }),
    db.photo.groupBy({ by: ["spiderId"], where: { spider: { userId } }, _min: { createdAt: true } }),
    db.observationEvent.groupBy({ by: ["spiderId"], where: { spider: { userId }, kind: { not: "play and interaction" } }, _min: { date: true } }),
    db.bodyConditionEvent.groupBy({ by: ["spiderId"], where: { spider: { userId } }, _min: { date: true } }),
    db.observationEvent.groupBy({ by: ["spiderId"], where: { spider: { userId }, kind: "built a new hammock" }, _min: { date: true } }),
    db.moltEvent.groupBy({ by: ["spiderId"], where: { spider: { userId }, successful: true }, _min: { moltDate: true } }),
    db.enclosureMaintenanceEvent.groupBy({ by: ["enclosureId"], where: { enclosure: { spider: { userId } }, kind: "rehouse" }, _min: { date: true } }),
  ]);
  const timeZone = await resolveDisplayTimeZone(user.timezone);
  const todayKey = calendarDayKey(now, timeZone);
  const photoBySpider = new Map(photos.map((row) => [row.spiderId, row._min.createdAt]));
  const observationBySpider = new Map<string, Date>();
  for (const row of [...observations, ...bodyObservations]) {
    const date = row._min.date;
    const previous = observationBySpider.get(row.spiderId);
    if (date && (!previous || date < previous)) observationBySpider.set(row.spiderId, date);
  }
  const hammockBySpider = new Map(hammocks.map((row) => [row.spiderId, row._min.date]));
  const moltBySpider = new Map(molts.map((row) => [row.spiderId, row._min.moltDate]));
  const rehouseByEnclosure = new Map(rehousings.map((row) => [row.enclosureId, row._min.date]));
  const storySpiders: StorySpider[] = spiders.map((spider) => ({
    id: spider.id,
    name: spider.name,
    createdAt: spider.createdAt,
    acquisitionDate: spider.acquisitionDate,
    photos: photoBySpider.get(spider.id) ? [{ date: photoBySpider.get(spider.id)! }] : [],
    observations: [
      observationBySpider.get(spider.id) ? { date: observationBySpider.get(spider.id)!, kind: "observation" } : null,
      hammockBySpider.get(spider.id) ? { date: hammockBySpider.get(spider.id)!, kind: "built a new hammock" } : null,
    ].filter((item): item is { date: Date; kind: string } => item !== null),
    molts: moltBySpider.get(spider.id) ? [{ date: moltBySpider.get(spider.id)!, successful: true }] : [],
    rehousings: spider.enclosure?.id && rehouseByEnclosure.get(spider.enclosure.id)
      ? [{ date: rehouseByEnclosure.get(spider.enclosure.id)! }]
      : [],
  }));

  return { todayKey, timeZone, days, streak: summarizeStreak(days.map(day => day.dayKey), todayKey), stories: deriveStoryRewards(storySpiders, todayKey, timeZone, now) };
}
