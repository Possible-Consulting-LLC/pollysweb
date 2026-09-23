import { statusAfterSuccessfulMolt } from "./care";
import { daysBetween } from "./utils";

type Molt = {
  id: string;
  moltDate: Date;
  newInstar: string | null;
  previousInstar: string | null;
};

export function reconcileMoltState(
  spider: { instar: string | null; status: string },
  before: Molt | null,
  after: Molt | null,
  created: boolean,
  zone = "UTC",
) {
  const changed =
    before?.id !== after?.id ||
    before?.newInstar !== after?.newInstar ||
    before?.moltDate.getTime() !== after?.moltDate.getTime();
  if (!changed) return {};

  const result: { instar?: string | null; status?: string } = {};
  // Preserve a manually overridden instar when correcting or removing old history.
  if (created || spider.instar === before?.newInstar) {
    result.instar = after?.newInstar ?? before?.previousInstar ?? null;
  }

  const nextStatus = after
    ? statusAfterSuccessfulMolt(after.moltDate, new Date(), zone)
    : "Normal";
  // A newly recorded recent molt starts recovery. Backfilled old molts do not
  // erase a keeper's current manual status. Existing recovery always follows
  // the remaining latest successful molt after edits or deletion.
  if (
    spider.status === "Post-molt recovery" ||
    (after?.id !== before?.id && nextStatus === "Post-molt recovery")
  ) {
    result.status = nextStatus;
  }
  return result;
}

export function maintenanceSummary(events: { kind: string; date: Date }[]) {
  const latest = (kind: string) =>
    events
      .filter((event) => event.kind === kind)
      .reduce<Date | null>(
        (date, event) => (!date || event.date > date ? event.date : date),
        null,
      );
  return {
    lastCleaned: latest("cleaning"),
    lastRehoused: latest("rehouse"),
  };
}

export function deriveMoltMetrics(
  molts: Array<{ id: string; moltDate: Date; successful: boolean }>,
  successfulFeedings: Date[],
  zone = "UTC",
) {
  const orderedMolts = [...molts].sort(
    (a, b) => a.moltDate.getTime() - b.moltDate.getTime() || a.id.localeCompare(b.id),
  );
  const orderedMeals = [...successfulFeedings].sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  let previousSuccessfulMolt: Date | null = null;
  let mealIndex = 0;
  let lastMeal: Date | null = null;

  return orderedMolts.map((molt) => {
    while (
      mealIndex < orderedMeals.length &&
      orderedMeals[mealIndex] <= molt.moltDate
    ) {
      lastMeal = orderedMeals[mealIndex];
      mealIndex += 1;
    }
    const row = {
      id: molt.id,
      daysSincePriorMolt: previousSuccessfulMolt
        ? daysBetween(previousSuccessfulMolt, molt.moltDate, zone)
        : null,
      fastingDaysBefore: lastMeal
        ? daysBetween(lastMeal, molt.moltDate, zone)
        : null,
    };
    if (molt.successful) previousSuccessfulMolt = molt.moltDate;
    return row;
  });
}
