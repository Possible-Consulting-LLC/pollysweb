import { readRewardState } from "./reward-data";
import { withCareProgress } from "./care-progress-data";
import { prisma } from "@/lib/db";
import { listSpidersForUser, getUserDefaults, type SpiderCareView } from "@/lib/spiders";
import { daysBetween, resolveDisplayTimeZone } from "@/lib/utils";
import { getSpiderWriteState } from "@/lib/spider-write-policy";
import {
  calendarDayKey,
  careDueForReview,
  summarizeStreak,
} from "@/lib/constellation";

export function reviewItemsFor(
  views: SpiderCareView[],
  feedIntervalDays: number,
  writeState: { proAccess: boolean; firstSpiderId: string | null },
) {
  return views.filter((view) =>
    !view.spider.memorializedAt &&
    (writeState.proAccess || view.spider.id === writeState.firstSpiderId),
  ).map((view) => ({
    id: view.spider.id,
    name: view.spider.name,
    profilePhoto: view.spider.profilePhoto,
    status: view.spider.status,
    due: careDueForReview({
      status: view.spider.status,
      daysSinceSuccessfulFeed: view.daysSinceSuccessfulFeed,
      daysSinceMolt: view.daysSinceMolt,
      feedIntervalDays,
      mistDue: view.mistDue,
    }),
  }));
}

export async function getCareReviewState(userId: string, now = new Date()) {
  const [defaults, views, writeState] = await Promise.all([
    getUserDefaults(userId), listSpidersForUser(userId), getSpiderWriteState(userId),
  ]);
  const timeZone = await resolveDisplayTimeZone(defaults.timezone);
  const todayKey = calendarDayKey(now, timeZone);
  const completed = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "CareDay" WHERE "userId" = ${userId} AND "dayKey" = ${todayKey} AND "invalidatedAt" IS NULL LIMIT 1
  `;
  return {
    todayKey,
    timeZone,
    completedToday: completed.length > 0,
    restoredToday: false,
    policy: { feedIntervalDays: defaults.feedDefaultDays, mistIntervalDays: defaults.mistDefaultDays, statuses: Object.fromEntries(views.map(view => [view.spider.id, view.spider.status])) },
    reviewItems: await withCareProgress(userId, todayKey, timeZone, reviewItemsFor(views, defaults.feedDefaultDays, writeState), now),
    writeState,
  };
}

export async function getConstellationData(userId: string, now = new Date()) {
  const [defaults, views, writeState, rewards] = await Promise.all([
    getUserDefaults(userId), listSpidersForUser(userId), getSpiderWriteState(userId), readRewardState(userId, now),
  ]);
  const reviewItems = await withCareProgress(userId, rewards.todayKey, rewards.timeZone, reviewItemsFor(views, defaults.feedDefaultDays, writeState), now);
  return {
    daysTogether: Math.max(0, daysBetween(defaults.createdAt, now, rewards.timeZone)),
    todayKey: rewards.todayKey, timeZone: rewards.timeZone, reviewItems,
    completedToday: rewards.days.some(day => day.dayKey === rewards.todayKey),
    completedDayKeys: rewards.days.map(day => day.dayKey),
    streak: rewards.streak, stories: rewards.stories, storyProgress: rewards.storyProgress,
  };
}

export async function getStreakPreview(userId: string, timeZone: string, now = new Date()) {
  const days = await prisma.$queryRaw<Array<{ dayKey: string }>>`
    SELECT "dayKey" FROM "CareDay" WHERE "userId" = ${userId} AND "invalidatedAt" IS NULL ORDER BY "dayKey" ASC
  `;
  const todayKey = calendarDayKey(now, timeZone);
  return {
    streak: summarizeStreak(days.map((day) => day.dayKey), todayKey),
    completedToday: days.some((day) => day.dayKey === todayKey),
  };
}
