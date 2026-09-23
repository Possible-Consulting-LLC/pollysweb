import {
  PREMOLT_STATUSES,
  SUCCESSFUL_FEEDING_OUTCOMES,
  type CareStatus,
  type PremoltStatus,
} from "./constants";
import { daysBetween } from "./utils";

/** Calendar days after a molt before Post-molt recovery returns to Normal. */
export const POST_MOLT_RECOVERY_DAYS = 5;

export function isSuccessfulFeeding(outcome: string): boolean {
  return (SUCCESSFUL_FEEDING_OUTCOMES as readonly string[]).includes(outcome);
}

export function isPremoltLike(status: string): boolean {
  return (
    status === "Possible premolt" ||
    status === "Premolt" ||
    status === "Molting"
  );
}

/**
 * Post-molt recovery is temporary (about 3–5 days). After that window — or if
 * there is no molt date — treat the spider as Normal again.
 */
export function resolveSpiderStatus(
  status: string,
  lastMoltAt: Date | null | undefined,
  now = new Date(),
  timeZone = "UTC",
): string {
  if (status !== "Post-molt recovery") return status;
  const elapsed = daysSince(lastMoltAt, now, timeZone);
  if (elapsed === null || elapsed >= POST_MOLT_RECOVERY_DAYS) {
    return "Normal";
  }
  return status;
}

/** Status to store after logging a successful molt on `moltDate`. */
export function statusAfterSuccessfulMolt(
  moltDate: Date,
  now = new Date(),
  timeZone = "UTC",
): string {
  return resolveSpiderStatus("Post-molt recovery", moltDate, now, timeZone);
}

export function shouldSuppressFeedingReminder(status: string): boolean {
  return isPremoltLike(status);
}

export function daysSince(date: Date | null | undefined, now = new Date(), timeZone = "UTC"): number | null {
  if (!date) return null;
  return daysBetween(date, now, timeZone);
}

export function daysBetweenMolts(
  earlier: Date | null | undefined,
  later: Date | null | undefined,
  timeZone = "UTC",
): number | null {
  if (!earlier || !later) return null;
  return daysBetween(earlier, later, timeZone);
}

export function nextInstar(current: string | null | undefined): string | null {
  if (!current) return null;
  const match = current.trim().match(/^i(\d+)$/i);
  if (!match) return current;
  return `i${Number(match[1]) + 1}`;
}

export type CareInputs = {
  status: string;
  lastFedAt: Date | null;
  lastSuccessfulFedAt: Date | null;
  lastMistedAt: Date | null;
  lastMoltAt: Date | null;
  feedIntervalDays: number;
  mistIntervalDays: number;
  now?: Date;
  timeZone?: string;
};

export function isMistingDue(
  input: Pick<CareInputs, "lastMistedAt" | "mistIntervalDays" | "now" | "timeZone">,
): boolean {
  const elapsed = daysSince(input.lastMistedAt, input.now, input.timeZone);
  return elapsed === null || elapsed >= input.mistIntervalDays;
}

export function deriveCareStatus(input: CareInputs): CareStatus {
  const now = input.now ?? new Date();
  const status = resolveSpiderStatus(
    input.status,
    input.lastMoltAt,
    now,
    input.timeZone,
  ) as PremoltStatus;

  if (status === "Post-molt recovery") return "Post-molt recovery";
  if (status === "Molting") return "Molting";
  if (status === "Premolt") return "In premolt";
  if (status === "Possible premolt") return "Possible premolt";

  const daysSinceMolt = daysSince(input.lastMoltAt, now, input.timeZone);
  if (daysSinceMolt !== null && daysSinceMolt <= 7) {
    return "Recently molted";
  }

  if (isMistingDue(input)) {
    return "Mist today";
  }

  if (!shouldSuppressFeedingReminder(status)) {
    const daysSinceFeed = daysSince(input.lastSuccessfulFedAt, now, input.timeZone);
    if (daysSinceFeed === null || daysSinceFeed >= input.feedIntervalDays) {
      return "Feeding due";
    }
  }

  return "All good";
}

export function careStatusTone(status: CareStatus): "good" | "attention" | "calm" {
  switch (status) {
    case "All good":
    case "Recently molted":
      return "good";
    case "Feeding due":
    case "Mist today":
      return "attention";
    default:
      return "calm";
  }
}

export function friendlyNeedCopy(name: string, status: CareStatus): string {
  switch (status) {
    case "Feeding due":
      return `${name} may be ready for a meal.`;
    case "Mist today":
      return `${name} could use a little mist today.`;
    case "Possible premolt":
      return `${name} might be heading toward a molt.`;
    case "In premolt":
      return `${name} is in premolt — fasting may be expected.`;
    case "Molting":
      return `${name} is molting. Give them a little space.`;
    case "Recently molted":
      return `${name} recently molted. Take it gentle.`;
    case "Post-molt recovery":
      return `${name} is recovering after a molt.`;
    default:
      return `${name} is all good.`;
  }
}

export function isValidPremoltStatus(value: string): value is PremoltStatus {
  return (PREMOLT_STATUSES as readonly string[]).includes(value);
}

/** Fasting days before molt based on last successful feeding before molt date. */
export function fastingDaysBeforeMolt(
  lastSuccessfulFeedBeforeMolt: Date | null | undefined,
  moltDate: Date,
): number | null {
  if (!lastSuccessfulFeedBeforeMolt) return null;
  return daysBetween(lastSuccessfulFeedBeforeMolt, moltDate);
}
