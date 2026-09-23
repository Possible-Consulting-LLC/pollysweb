import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDayKey,
  checkCareDay,
  careDueForReview,
  deriveStoryRewards,
  reviewStateMatches,
  summarizeStreak,
} from "./constellation";

test("calendar day follows the keeper zone across midnight and DST", () => {
  assert.equal(calendarDayKey(new Date("2026-09-16T06:30:00Z"), "America/Los_Angeles"), "2026-09-15");
  assert.equal(calendarDayKey(new Date("2026-03-09T06:30:00Z"), "America/Los_Angeles"), "2026-03-08");
});

test("streak keeps yesterday alive until today is completed", () => {
  assert.deepEqual(summarizeStreak(["2026-09-14", "2026-09-15"], "2026-09-16"), {
    current: 2,
    best: 2,
    earnedAt: { 1: "2026-09-14" },
  });
});

test("first threshold dates survive a later broken streak", () => {
  const dates = [1, 2, 3, 4, 5, 6, 7].map((day) => `2026-09-${String(day).padStart(2, "0")}`);
  dates.push("2026-09-10", "2026-09-11");
  const result = summarizeStreak(dates, "2026-09-12");
  assert.equal(result.current, 2);
  assert.equal(result.best, 7);
  assert.deepEqual(result.earnedAt, {
    1: "2026-09-01",
    3: "2026-09-03",
    7: "2026-09-07",
  });
});

test("duplicate care dates do not advance a streak", () => {
  assert.equal(summarizeStreak(["2026-09-15", "2026-09-15"], "2026-09-16").best, 1);
});

test("long care runs unlock 14, 30, and 100 day artwork on the right dates", () => {
  const dates = Array.from({ length: 100 }, (_, index) =>
    new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
  );
  const summary = summarizeStreak(dates, "2026-04-10");
  assert.equal(summary.best, 100);
  assert.equal(summary.earnedAt[14], "2026-01-14");
  assert.equal(summary.earnedAt[30], "2026-01-30");
  assert.equal(summary.earnedAt[100], "2026-04-10");
});

test("a care day requires every active spood to be reviewed", () => {
  assert.equal(checkCareDay({ activeSpiderIds: [], reviewedSpiderIds: [], due: {}, deferred: {} }).ok, false);
  assert.equal(checkCareDay({ activeSpiderIds: ["a", "b"], reviewedSpiderIds: ["a"], due: {}, deferred: {} }).ok, false);
});

test("a due misting needs a care log or an explicit reason even during molting", () => {
  const input = { activeSpiderIds: ["star"], reviewedSpiderIds: ["star"], due: { star: { feeding: false, misting: true } }, deferred: {} };
  assert.equal(checkCareDay(input).ok, false);
  assert.equal(checkCareDay({ ...input, deferred: { star: { misting: "" } } }).ok, false);
  assert.equal(checkCareDay({ ...input, deferred: { star: { misting: "In a fragile position" } } }).ok, true);
});

test("molting pauses feeding but does not hide due misting", () => {
  assert.deepEqual(careDueForReview({ status: "Molting", daysSinceSuccessfulFeed: 9, feedIntervalDays: 3, mistDue: true }), {
    feeding: false,
    misting: true,
  });
  assert.deepEqual(careDueForReview({ status: "Normal", daysSinceSuccessfulFeed: 1, feedIntervalDays: 3, mistDue: false }), {
    feeding: false,
    misting: false,
  });
  assert.deepEqual(careDueForReview({ status: "Post-molt recovery", daysSinceSuccessfulFeed: 9, feedIntervalDays: 3, mistDue: true, daysSinceMolt: 2 }), {
    feeding: false,
    misting: true,
  });
  assert.deepEqual(careDueForReview({ status: "Normal", daysSinceSuccessfulFeed: 9, feedIntervalDays: 3, mistDue: false, daysSinceMolt: 6 }), {
    feeding: false,
    misting: false,
  });
});

test("story rewards require a real photo and a successful molt", () => {
  const rewards = deriveStoryRewards([{
    id: "star", name: "Star", createdAt: new Date("2026-08-01T12:00:00Z"), acquisitionDate: null,
    photos: [], observations: [], molts: [{ date: new Date("2026-09-01T12:00:00Z"), successful: false }], rehousings: [],
  }], "2026-09-16", "UTC");
  assert.equal(rewards.firstPortrait.length, 0);
  assert.equal(rewards.freshSuit.length, 0);
});

test("a hammock observation earns a story reward without any handling", () => {
  const rewards = deriveStoryRewards([{
    id: "star", name: "Star", createdAt: new Date("2026-08-01T12:00:00Z"), acquisitionDate: null,
    photos: [{ date: new Date("2026-09-01T12:00:00Z") }],
    observations: [{ date: new Date("2026-09-02T12:00:00Z"), kind: "built a new hammock" }],
    molts: [{ date: new Date("2026-09-03T12:00:00Z"), successful: true }], rehousings: [],
  }], "2026-09-16", "UTC");
  assert.equal(rewards.firstPortrait[0]?.spiderId, "star");
  assert.equal(rewards.sharpEyes[0]?.spiderId, "star");
  assert.equal(rewards.silkArchitect[0]?.spiderId, "star");
  assert.equal(rewards.freshSuit[0]?.spiderId, "star");
});

test("optional play alone does not unlock the observation reward", () => {
  const rewards = deriveStoryRewards([{
    id: "star", name: "Star", createdAt: new Date("2026-09-01"), acquisitionDate: null,
    photos: [], observations: [{ date: new Date("2026-09-03"), kind: "play and interaction" }],
    molts: [], rehousings: [],
  }], "2026-09-16", "UTC");
  assert.equal(rewards.sharpEyes.length, 0);
});

test("spoodiversary uses acquisition date and remains locked before one year", () => {
  const spider = {
    id: "star", name: "Star", createdAt: new Date("2026-01-01T12:00:00Z"),
    acquisitionDate: new Date("2025-09-17T00:00:00Z"),
    photos: [], observations: [], molts: [], rehousings: [],
  };
  assert.equal(deriveStoryRewards([spider], "2026-09-16", "UTC").spoodiversary.length, 0);
  assert.equal(deriveStoryRewards([spider], "2026-09-17", "UTC").spoodiversary[0]?.spiderId, "star");
  assert.equal(deriveStoryRewards([spider], "2026-09-16", "America/Los_Angeles").spoodiversary.length, 0);
  assert.equal(deriveStoryRewards([spider], "2026-09-17", "America/Los_Angeles").spoodiversary[0]?.spiderId, "star");
});

test("legacy acquisition instants use the keeper day rather than a UTC date-only key", () => {
  const rewards = deriveStoryRewards([{
    id: "star", name: "Star", createdAt: new Date("2025-09-20T00:00:00Z"),
    acquisitionDate: new Date("2025-09-17T00:30:00Z"),
    photos: [], observations: [], molts: [], rehousings: [],
  }], "2026-09-16", "America/Los_Angeles");
  assert.equal(rewards.spoodiversary[0]?.earnedAt, "2026-09-16");
});

test("a grouped story reward shows its first earned date", () => {
  const base = { acquisitionDate: null, observations: [], molts: [], rehousings: [] };
  const rewards = deriveStoryRewards([
    { ...base, id: "late", name: "Late", createdAt: new Date("2026-01-01"), photos: [{ date: new Date("2026-09-10") }] },
    { ...base, id: "early", name: "Early", createdAt: new Date("2026-01-01"), photos: [{ date: new Date("2026-09-01") }] },
  ], "2026-09-16", "UTC");
  assert.equal(rewards.firstPortrait[0]?.spiderId, "early");
});

test("future-dated moments do not unlock story rewards early", () => {
  const future = new Date("2026-09-20T12:00:00Z");
  const rewards = deriveStoryRewards([{
    id: "star", name: "Star", createdAt: new Date("2026-09-01"), acquisitionDate: null,
    photos: [{ date: future }], observations: [{ date: future, kind: "built a new hammock" }],
    molts: [{ date: future, successful: true }], rehousings: [{ date: future }],
  }], "2026-09-16", "UTC");
  assert.equal(rewards.firstPortrait.length, 0);
  assert.equal(rewards.sharpEyes.length, 0);
  assert.equal(rewards.silkArchitect.length, 0);
  assert.equal(rewards.freshSuit.length, 0);
  assert.equal(rewards.newChapter.length, 0);
});

test("a moment later today does not unlock before its time", () => {
  const rewards = deriveStoryRewards([{
    id: "star", name: "Star", createdAt: new Date("2026-09-01"), acquisitionDate: null,
    photos: [], observations: [],
    molts: [{ date: new Date("2026-09-16T18:00:00Z"), successful: true }], rehousings: [],
  }], "2026-09-16", "UTC", new Date("2026-09-16T12:00:00Z"));
  assert.equal(rewards.freshSuit.length, 0);
});

test("care completion rechecks the day, active spoods, and due items", () => {
  const original = { todayKey: "2026-09-16", timeZone: "America/Los_Angeles", reviewItems: [{ id: "star", due: { feeding: false, misting: true } }] };
  assert.equal(reviewStateMatches(original, original), true);
  assert.equal(reviewStateMatches(original, { ...original, todayKey: "2026-09-17" }), false);
  assert.equal(reviewStateMatches(original, { ...original, reviewItems: [...original.reviewItems, { id: "mochi", due: { feeding: false, misting: false } }] }), false);
  assert.equal(reviewStateMatches(original, { ...original, reviewItems: [{ id: "star", due: { feeding: true, misting: true } }] }), false);
});

test("editing the last successful molt withdraws Fresh Suit but another spood can retain the account badge", () => {
  const base = { name: 'Star', createdAt: new Date('2026-09-01'), acquisitionDate: null, photos: [], observations: [], rehousings: [] };
  const edited = { ...base, id: 'a', molts: [{ date: new Date('2026-09-10'), successful: false }] };
  assert.equal(deriveStoryRewards([edited], '2026-09-20', 'UTC').freshSuit.length, 0);
  const other = { ...base, id: 'b', molts: [{ date: new Date('2026-09-11'), successful: true }] };
  assert.deepEqual(deriveStoryRewards([edited, other], '2026-09-20', 'UTC').freshSuit.map(item => item.spiderId), ['b']);
});

test("editing a hammock observation withdraws only badges with no remaining qualifying evidence", () => {
  const spider = { id: 'a', name: 'Star', createdAt: new Date('2026-09-01'), acquisitionDate: null, photos: [], molts: [], rehousings: [], observations: [{ date: new Date('2026-09-10'), kind: 'behavior note' }] };
  const rewards = deriveStoryRewards([spider], '2026-09-20', 'UTC');
  assert.equal(rewards.silkArchitect.length, 0); assert.equal(rewards.sharpEyes.length, 1);
  spider.observations.push({ date: new Date('2026-09-12'), kind: 'built a new hammock' });
  assert.equal(deriveStoryRewards([spider], '2026-09-20', 'UTC').silkArchitect.length, 1);
});

test("withdrawn care days lower milestones unless another qualifying streak remains", () => {
  assert.equal(summarizeStreak(['2026-09-18','2026-09-20'], '2026-09-20').earnedAt[3], undefined);
  assert.ok(summarizeStreak(['2026-09-10','2026-09-11','2026-09-12','2026-09-18','2026-09-20'], '2026-09-20').earnedAt[3]);
});
