import type { MutationFailure } from '../mutation-failure';
import type { RequestIdentity } from './test-session';
export type MaintenanceState = {
  version: number;
  deadline: Date | null;
  announcementEnabled: boolean;
  announcement: string;
};
export type MaintenanceFailure = MutationFailure & {
  code: 'maintenance';
};
export function maintenanceFailure(): MaintenanceFailure {
  return { ok: false, code: 'maintenance', error: 'The site is temporarily unavailable for maintenance. Your unsaved entries are still here. Please try again after the site reopens.' };
}
export class MaintenanceError extends Error {
  constructor() { super(maintenanceFailure().error); this.name = 'MaintenanceError'; }
}
export function maintenanceMode(state: MaintenanceState, now: Date): 'open' | 'countdown' | 'active' {
  if (!Number.isFinite(now.getTime()) || (state.deadline && !Number.isFinite(state.deadline.getTime())))
    throw new MaintenanceError();
  return !state.deadline ? 'open' : now < state.deadline ? 'countdown' : 'active';
}
export async function assertSiteAccess(identity: RequestIdentity | null, state: MaintenanceState | null, now: Date, operation: 'read' | 'write', bypass: () => Promise<boolean> = async () => false): Promise<void> {
  void identity;
  void operation;
  if (!state)
    throw new MaintenanceError();
  if (maintenanceMode(state, now) !== 'active')
    return;
  try {
    if (await bypass())
      return;
  }
  catch { /* Authentication failure is never a bypass. */ }
  throw new MaintenanceError();
}
export function publicSiteStatus(state: MaintenanceState, now: Date) {
  return {
    mode: maintenanceMode(state, now), serverTime: now.toISOString(), deadline: state.deadline?.toISOString() ?? null,
    announcementEnabled: state.announcementEnabled, announcement: state.announcementEnabled ? state.announcement : ''
  };
}
export function maintenanceResponse() {
  return Response.json({ error: maintenanceFailure().error, code: 'maintenance' }, { status: 503, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' } });
}
