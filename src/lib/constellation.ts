import { normalizeTimeZone } from "./utils";
import { shouldSuppressFeedingReminder } from "./care";

export const STREAK_THRESHOLDS = [1, 3, 7, 14, 30, 100] as const;
export type StreakThreshold = (typeof STREAK_THRESHOLDS)[number];

export type StreakSummary = {
  current: number;
  best: number;
  earnedAt: Partial<Record<StreakThreshold, string>>;
};

export function calendarDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone) || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ordinal(key: string): number {
  return Date.parse(`${key}T00:00:00.000Z`) / 86_400_000;
}

export function summarizeStreak(dayKeys: string[], todayKey: string): StreakSummary {
  const days = [...new Set(dayKeys.filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)))].sort();
  const earnedAt: StreakSummary["earnedAt"] = {};
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  let latest = 0;

  for (const day of days) {
    const value = ordinal(day);
    if (!Number.isFinite(value)) continue;
    run = previous !== null && value === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    for (const threshold of STREAK_THRESHOLDS) {
      if (run >= threshold && !earnedAt[threshold]) earnedAt[threshold] = day;
    }
    previous = value;
    latest = value;
  }

  const today = ordinal(todayKey);
  return {
    current: latest === today || latest === today - 1 ? run : 0,
    best,
    earnedAt,
  };
}

export type CareDayCheck = {
  activeSpiderIds: string[];
  reviewedSpiderIds: string[];
  due: Record<string, { feeding: boolean; misting: boolean }>;
  deferred: Record<string, { feeding?: string; misting?: string }>;
};

export function careDueForReview(input: {
  status: string;
  daysSinceSuccessfulFeed: number | null;
  daysSinceMolt?: number | null;
  feedIntervalDays: number;
  mistDue: boolean;
}): { feeding: boolean; misting: boolean } {
  return {
    feeding:
      !shouldSuppressFeedingReminder(input.status) &&
      input.status !== "Post-molt recovery" &&
      (input.daysSinceMolt === null || input.daysSinceMolt === undefined || input.daysSinceMolt > 7) &&
      (input.daysSinceSuccessfulFeed === null ||
        input.daysSinceSuccessfulFeed >= input.feedIntervalDays),
    misting: input.mistDue,
  };
}

type ReviewState = {
  todayKey: string;
  timeZone: string;
  reviewItems: { id: string; due: { feeding: boolean; misting: boolean } }[];
};

export function reviewStateMatches(first: ReviewState, second: ReviewState): boolean {
  if (first.todayKey !== second.todayKey || first.timeZone !== second.timeZone) return false;
  const fingerprint = (state: ReviewState) => state.reviewItems
    .map((item) => `${item.id}:${Number(item.due.feeding)}:${Number(item.due.misting)}`)
    .sort().join("|");
  return fingerprint(first) === fingerprint(second);
}

export function checkCareDay(input: CareDayCheck): { ok: true } | { ok: false; error: string } {
  const active = new Set(input.activeSpiderIds);
  const reviewed = new Set(input.reviewedSpiderIds);
  if (active.size === 0) return { ok: false, error: "Add a spood before completing a care day." };
  if (reviewed.size !== active.size || [...reviewed].some((id) => !active.has(id))) {
    return { ok: false, error: "Review every active spood to complete today." };
  }
  for (const id of active) {
    const due = input.due[id];
    for (const kind of ["feeding", "misting"] as const) {
      if (due?.[kind] && !input.deferred[id]?.[kind]?.trim()) {
        return { ok: false, error: `Log or explain today's ${kind} for every spood that needs it.` };
      }
    }
  }
  return { ok: true };
}

export const STORY_REWARDS = [
  { id: "firstPortrait", title: "First Portrait", criterion: "Upload a photo", symbol: "camera" },
  { id: "sharpEyes", title: "Sharp Eyes", criterion: "Record an observation", symbol: "eye" },
  { id: "silkArchitect", title: "Silk Architect", criterion: "Spot a new silk retreat", symbol: "house" },
  { id: "freshSuit", title: "Fresh Suit", criterion: "Record a successful molt", symbol: "sparkles" },
  { id: "spoodiversary", title: "Spoodiversary", criterion: "One year together", symbol: "heart" },
  { id: "newChapter", title: "New Chapter", criterion: "Record a new enclosure", symbol: "move-right" },
] as const;

export const STREAK_REWARDS = [
  { days: 1, title: "First Spark", symbol: "sparkle" },
  { days: 3, title: "Little Orbit", symbol: "orbit" },
  { days: 7, title: "Seven Stars", symbol: "stars" },
  { days: 14, title: "Star Path", symbol: "route" },
  { days: 30, title: "Moonkeeper", symbol: "moon-star" },
  { days: 100, title: "Galaxy Guide", symbol: "telescope" },
] as const;

export type StorySpider = {
  id: string;
  name: string;
  createdAt: Date;
  acquisitionDate: Date | null;
  photos: { date: Date }[];
  observations: { date: Date; kind: string }[];
  molts: { date: Date; successful: boolean }[];
  rehousings: { date: Date }[];
};

export type StoryEarned = { spiderId: string; spiderName: string; earnedAt: string };
export type StoryRewardGroups = Record<(typeof STORY_REWARDS)[number]["id"], StoryEarned[]>;

export function deriveStoryRewards(
  spiders: StorySpider[],
  todayKey: string,
  timeZone: string,
  now?: Date,
): StoryRewardGroups {
  const result: StoryRewardGroups = {
    firstPortrait: [], sharpEyes: [], silkArchitect: [],
    freshSuit: [], spoodiversary: [], newChapter: [],
  };
  const earliest = (dates: Date[]) => dates
    .filter((date) => calendarDayKey(date, timeZone) <= todayKey && (!now || date <= now))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  for (const spider of spiders) {
    const award = (id: keyof StoryRewardGroups, date?: Date) => {
      if (date) result[id].push({
        spiderId: spider.id,
        spiderName: spider.name,
        earnedAt: calendarDayKey(date, timeZone),
      });
    };
    award("firstPortrait", earliest(spider.photos.map((item) => item.date)));
    award("sharpEyes", earliest(spider.observations.filter((item) => item.kind !== "play and interaction").map((item) => item.date)));
    award("silkArchitect", earliest(spider.observations.filter((item) => item.kind === "built a new hammock").map((item) => item.date)));
    award("freshSuit", earliest(spider.molts.filter((item) => item.successful).map((item) => item.date)));
    award("newChapter", earliest(spider.rehousings.map((item) => item.date)));

    // Form-entered acquisition dates are UTC-midnight calendar values; older
    // fallback values may be real instants. Preserve both meanings.
    const acquisition = spider.acquisitionDate;
    const isDateOnly = acquisition &&
      acquisition.getUTCHours() === 0 && acquisition.getUTCMinutes() === 0 &&
      acquisition.getUTCSeconds() === 0 && acquisition.getUTCMilliseconds() === 0;
    const startKey = acquisition
      ? isDateOnly
        ? acquisition.toISOString().slice(0, 10)
        : calendarDayKey(acquisition, timeZone)
      : calendarDayKey(spider.createdAt, timeZone);
    const [year, month, day] = startKey.split("-").map(Number);
    const anniversary = new Date(Date.UTC(year + 1, month - 1, day)).toISOString().slice(0, 10);
    if (todayKey >= anniversary) {
      result.spoodiversary.push({ spiderId: spider.id, spiderName: spider.name, earnedAt: anniversary });
    }
  }
  for (const reward of STORY_REWARDS) {
    result[reward.id].sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
  }
  return result;
}
