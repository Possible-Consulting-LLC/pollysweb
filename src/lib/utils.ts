import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDays(days: number | null): string {
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Prefer clock-aware relative time so same-day logs visibly update. */
export function formatCareWhen(date: Date | string | null): string {
  if (!date) return "never";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "never";
  const diffMs = Date.now() - value.getTime();
  if (diffMs < 60_000) return "just now";
  return `${formatDistanceToNowStrict(value)} ago`;
}

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's calendar date on the current device, for client-side date defaults. */
export function localTodayInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local wall-clock value for `<input type="datetime-local">` (`yyyy-MM-ddTHH:mm`). */
export function toDateTimeLocalInputValue(
  date: Date | string | null | undefined,
  timeZone?: string | null,
): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";

  const zone = normalizeTimeZone(timeZone);
  if (zone) {
    const parts = zonedParts(value, zone);
    if (!parts) return "";
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  // No zone available (should be rare) — use UTC so SSR doesn't shift to the
  // host machine's local offset by accident.
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const h = String(value.getUTCHours()).padStart(2, "0");
  const min = String(value.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Calendar dates are stored as UTC midnight. */
export function parseLocalDateInput(value: string | null | undefined): Date | null {
 const raw = String(value ?? "").trim();
 if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
 const parsed = new Date(raw + "T00:00:00.000Z");
 return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? parsed : null;
}

export function requireLocalDateInput(
  value: string | null | undefined,
  fallback = new Date(),
) {
  return parseLocalDateInput(value) ?? fallback;
}

/**
 * Parse a datetime-local / date / ISO string as wall time in `timeZone`.
 * `datetime-local` values have no offset — they must be interpreted in the
 * timezone where they were entered (usually the browser).
 */
export function parseZonedDateTimeInput(
  value: string | null | undefined,
  timeZone: string | null | undefined,
): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const absolute = new Date(raw);
    return Number.isNaN(absolute.getTime()) ? null : absolute;
  }

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] != null ? Number(match[4]) : 12;
  const minute = match[5] != null ? Number(match[5]) : 0;
  const second = match[6] != null ? Number(match[6]) : 0;
  const zone = normalizeTimeZone(timeZone) || "UTC";

  return zonedWallTimeToUtc(year, month, day, hour, minute, second, zone);
}

export function requireZonedDateTimeInput(
  value: string | null | undefined,
  timeZone: string | null | undefined,
  fallback = new Date(),
) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const parsed = parseZonedDateTimeInput(raw, timeZone);
  if (!parsed) throw new Error("Enter a valid date and time.");
  return parsed;
}

/** Read activity when + optional clientTimeZone from a log/edit form. */
export function requireFormDateTime(
  formData: FormData,
  fieldName = "date",
  fallbackTimeZone = "UTC",
) {
  const timeZone =
    String(formData.get("timeZone") || "").trim() ||
    String(formData.get("clientTimeZone") || "").trim() ||
    fallbackTimeZone;
  return requireZonedDateTimeInput(
    String(formData.get(fieldName) || ""),
    timeZone,
  );
}

/** Event history records something that has happened, never a scheduled event. */
export function requireNonFutureFormDateTime(
  formData: FormData,
  fieldName = "date",
  fallbackTimeZone = "UTC",
  now = new Date(),
) {
  const date = requireFormDateTime(formData, fieldName, fallbackTimeZone);
  if (date.getTime() > now.getTime()) {
    throw new Error("Event date and time cannot be in the future.");
  }
  return date;
}

export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString(undefined, { timeZone: "UTC" });
}

/** Format a stored instant in the user's timezone, with time. */
export function formatDateTimeInZone(
  date: Date | string | null | undefined,
  timeZone?: string | null,
  options?: {
    dateStyle?: "full" | "long" | "medium" | "short";
    timeStyle?: "full" | "long" | "medium" | "short";
  },
): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  const zone = normalizeTimeZone(timeZone) || "UTC";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      dateStyle: options?.dateStyle ?? "medium",
      timeStyle: options?.timeStyle ?? "short",
    }).format(value);
  } catch {
    return value.toLocaleString();
  }
}

function decodeCookieTimeZone(raw: string | undefined | null): string {
  if (!raw) return "";
  const value = String(raw).trim();
  // TimezoneSync may store encodeURIComponent(zone); slash becomes %2F.
  try {
    const decoded = normalizeTimeZone(decodeURIComponent(value));
    if (decoded) return decoded;
  } catch {
    // ignore malformed escape sequences
  }
  return normalizeTimeZone(value);
}

/** Prefer saved timezone, then browser cookie, then UTC. */
export async function resolveDisplayTimeZone(
  savedTimeZone?: string | null,
): Promise<string> {
  const saved = normalizeTimeZone(savedTimeZone);
  if (saved) return saved;
  try {
    const { cookies } = await import("next/headers");
    const cookieZone = decodeCookieTimeZone(
      (await cookies()).get("spoodly_tz")?.value,
    );
    if (cookieZone) return cookieZone;
  } catch {
    // cookies() unavailable outside a request
  }
  return "UTC";
}

export function daysBetween(from: Date, to: Date = new Date(), timeZone = "UTC"): number {
 const calendarDay = (date: Date) => {
  const parts = zonedParts(date, normalizeTimeZone(timeZone) || "UTC")!;
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
 };
 return Math.round((calendarDay(to) - calendarDay(from)) / 86400000);
}

export function normalizeTimeZone(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    // Throws RangeError for invalid IANA names.
    Intl.DateTimeFormat(undefined, { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "";
  }
}

export const COMMON_TIMEZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Athens",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
] as const;

type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function zonedParts(date: Date, timeZone: string): ZonedParts | null {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    ) as Record<string, string>;

    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    };
  } catch {
    return null;
  }
}

/** Convert a wall-clock time in `timeZone` to the matching UTC `Date`. */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date | null {
  // Initial guess: treat the wall time as UTC, then correct by the zone offset.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i++) {
    const parts = zonedParts(new Date(utcMs), timeZone);
    if (!parts) return null;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const diff = Date.UTC(year, month - 1, day, hour, minute, second) - asUtc;
    utcMs += diff;
    if (diff === 0) break;
  }

  const verified = zonedParts(new Date(utcMs), timeZone);
  if (
    !verified ||
    Number(verified.year) !== year ||
    Number(verified.month) !== month ||
    Number(verified.day) !== day ||
    Number(verified.hour) !== hour ||
    Number(verified.minute) !== minute
  ) {
    return null;
  }
  return new Date(utcMs);
}

export function parseHydrationMethods(event: {
  methods?: string | null;
  mistedEnclosure?: boolean;
  waterDroplet?: boolean;
}): string[] {
  if (event.methods) {
    try {
      const parsed = JSON.parse(event.methods) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(String);
      }
    } catch {
      // fall through
    }
  }
  const fallback: string[] = [];
  if (event.mistedEnclosure) fallback.push("Misted enclosure");
  if (event.waterDroplet) fallback.push("Water droplet on glass");
  return fallback;
}
