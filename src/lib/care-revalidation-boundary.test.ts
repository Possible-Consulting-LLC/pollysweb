import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ordinary constellation and home data reads do not reconcile complete history", () => {
  const source = readFileSync(new URL("./constellation-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /reconcileCareDays/);
});

test("care celebration completion reconciles corrections before rewards are read", () => {
  const source = readFileSync(new URL("./care-celebrations.ts", import.meta.url), "utf8");
  const finish = source.slice(source.indexOf("export async function finishCareCelebrations"));
  assert.match(finish, /reconcileCareDays\(userId, new Date\(\), affectedSince\)/);
  const baseline = source.slice(source.indexOf("export async function baselineCelebrations"), source.indexOf("export async function awardCareDay"));
  assert.doesNotMatch(baseline, /forgetWithdrawnCelebrations/);
});

test("mutation reconciliation scopes care days and evidence to the affected range", () => {
  const source = readFileSync(new URL("./care-revalidation-data.ts", import.meta.url), "utf8");
  assert.match(source, /dayKey: \{ gte: lowerBoundDayKey \}/);
  assert.match(source, /const eventRange = \{ gte: evidenceSince, lte: now \}/);
  assert.match(source, /date: eventRange/);
  assert.match(source, /dayKey: \{ in: dayKeys \}/);
  assert.match(source, /Math\.max\(1, intervalDays, POST_MOLT_RECOVERY_DAYS\)/);
});

test("molt create, edit, and delete forward their historical date for care reevaluation", () => {
  const activity = readFileSync(new URL("../app/actions/activity.ts", import.meta.url), "utf8");
  const careEvents = readFileSync(new URL("../app/actions/care-events.ts", import.meta.url), "utf8");
  assert.match(activity, /type === "molt"\s*\? \(owned\.row as \{ moltDate: Date \}\)\.moltDate/);
  assert.match(activity, /finishCareCelebrations\(user\.id, baseline, activityDate, false, affectedSince\)/);
  assert.match(activity, /forgetWithdrawnCelebrations\(user\.id, affectedSince\)/);
  assert.match(careEvents, /finishCareCelebrations\(user\.id!, baseline, undefined, false, moltDate\)/);
});
