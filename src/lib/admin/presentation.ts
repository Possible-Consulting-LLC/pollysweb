import { validateReportingZone } from './analytics-period';
export function adminTimezone(value: string | null | undefined): { timezone: string; fallback: boolean } {
  if (value) { try { return { timezone: validateReportingZone(value), fallback: false }; } catch {} }
  return { timezone: 'UTC', fallback: true };
}
export function adminEnvironment(env: Record<string, string | undefined>): string {
  if (env.SPOODLY_ENV === 'production') return 'Production';
  if (env.SPOODLY_ENV === 'staging') return 'Staging';
  if (env.VERCEL_ENV === 'preview') return 'Preview / staging';
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') return 'Local development';
  return 'Unspecified environment';
}
