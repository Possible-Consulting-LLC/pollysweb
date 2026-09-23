import { addDays, startOfDay } from 'date-fns';
import { TZDate, tz } from '@date-fns/tz';

export type ReportingPeriod = {
  zone: string;
  start: Date;
  end: Date;
  /** A partial end includes server now; a closed end is exclusive next midnight. */
  partialToday: boolean;
};

export function validateReportingZone(zone: string): string {
  if (!zone || /^[+-]/.test(zone)) throw new Error('Choose a valid IANA timezone.');
  try { return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone; }
  catch { throw new Error('Choose a valid IANA timezone.'); }
}

export function reportingDayKey(date: Date, zone: string): string {
  const local = new TZDate(date, zone);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

export function reportingPeriod(zone: string, days: 7 | 14, now: Date): ReportingPeriod {
  zone = validateReportingZone(zone);
  if (![7, 14].includes(days) || !Number.isFinite(now.getTime())) throw new Error('Invalid reporting period.');
  const start = addDays(startOfDay(now, { in: tz(zone) }), -(days - 1), { in: tz(zone) });
  return { zone, start: new Date(start), end: new Date(now), partialToday: true };
}

function localDate(key: string, zone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Use a valid calendar date.');
  const [year, month, day] = key.split('-').map(Number);
  const date = new TZDate(year, month - 1, day, zone);
  // Reject invalid dates and nonexistent calendar days rather than rolling them forward.
  if (reportingDayKey(date, zone) !== key) throw new Error('Use a valid calendar date.');
  return date;
}

export function explicitReportingPeriod(zone: string, startKey: string, endKey: string, now: Date): ReportingPeriod {
  zone = validateReportingZone(zone);
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid current time.');
  const start = localDate(startKey, zone), last = localDate(endKey, zone);
  if (start > last || endKey > reportingDayKey(now, zone) || last >= addDays(start, 366, { in: tz(zone) })) {
    throw new Error('Choose up to 366 calendar dates ending today or earlier.');
  }
  const nextMidnight = addDays(last, 1, { in: tz(zone) });
  const partialToday = nextMidnight > now;
  return { zone, start: new Date(start), end: new Date(partialToday ? now : nextMidnight), partialToday };
}

export function reportingDates(period: ReportingPeriod): string[] {
  const result: string[] = [];
  let day = startOfDay(period.start, { in: tz(period.zone) });
  while (day < period.end || (period.partialToday && day.getTime() === period.end.getTime())) {
    result.push(reportingDayKey(day, period.zone));
    if (result.length > 366) throw new Error('Reporting interval is too long.');
    day = addDays(day, 1, { in: tz(period.zone) });
  }
  return result;
}

export function periodContains(period: ReportingPeriod, date: Date): boolean {
  return date >= period.start && (period.partialToday ? date <= period.end : date < period.end);
}
