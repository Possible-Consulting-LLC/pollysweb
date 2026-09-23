export type PublicSiteStatus = {
  mode: 'open' | 'countdown' | 'active';
  serverTime: string;
  deadline: string | null;
  announcementEnabled: boolean;
  announcement: string;
};
export type SiteStatusSample = { status: PublicSiteStatus; serverAtReceiptMs: number; receivedAtMs: number };
export function protectedSitePath(pathname: string): boolean {
  return ['/admin', '/activity', '/constellation', '/home', '/settings', '/spoods', '/today', '/upgrade']
    .some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
export function acceptSiteStatus(status: PublicSiteStatus, startedAt: number, receivedAt: number): SiteStatusSample {
  const serverMs = Date.parse(status.serverTime);
  const deadlineMs = status.deadline === null ? null : Date.parse(status.deadline);
  if (!Number.isFinite(serverMs) || (deadlineMs !== null && !Number.isFinite(deadlineMs)) ||
      !Number.isFinite(startedAt) || !Number.isFinite(receivedAt) || receivedAt < startedAt ||
      !['open', 'countdown', 'active'].includes(status.mode) || typeof status.announcement !== 'string' || typeof status.announcementEnabled !== 'boolean')
    throw Error('Invalid site status.');
  // serverTime is captured after the settings read. Pre-timestamp delay may
  // dominate the round trip, so adding a RTT estimate can block early.
  return { status, serverAtReceiptMs: serverMs, receivedAtMs: receivedAt };
}
export function siteStatusView(sample: SiteStatusSample, now: number): { mode: PublicSiteStatus['mode']; seconds: number | null } {
  if (sample.status.mode === 'active') return { mode: 'active', seconds: 0 };
  if (sample.status.deadline === null) return { mode: sample.status.mode, seconds: null };
  const remaining = Date.parse(sample.status.deadline) - sample.serverAtReceiptMs - Math.max(0, now - sample.receivedAtMs);
  return { mode: 'countdown', seconds: Math.max(0, Math.ceil(remaining / 1000)) };
}
export const PUBLIC_STATUS_TIMEOUT_MS = 8000;
type PollOptions = { now: () => number; wallNow?: () => number; visible: () => boolean; read: (signal: AbortSignal) => Promise<PublicSiteStatus>; onStatus: (sample: SiteStatusSample) => void; onError: () => void; schedule: (callback: () => void, delay: number) => unknown; cancel: (id: unknown) => void };
export class SiteStatusPoller {
  private active = false;
  private pending = false;
  private lastStarted = -Infinity;
  private lastStartedWall = -Infinity;
  private timer: unknown;
  private requestTimer: unknown;
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private readonly options: PollOptions) { }
  private clearTimer() {
    if (this.timer !== undefined) this.options.cancel(this.timer);
    this.timer = undefined;
  }
  private scheduleNext(delay: number) {
    this.clearTimer();
    if (this.active && this.options.visible()) this.timer = this.options.schedule(() => { this.timer = undefined; this.refresh(); }, delay);
  }
  private invalidateRequest() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    if (this.requestTimer !== undefined) this.options.cancel(this.requestTimer);
    this.requestTimer = undefined;
    this.pending = false;
  }
  private refresh() {
    if (!this.active || !this.options.visible() || this.pending) return;
    const startedAt = this.options.now();
    const wait = this.lastStarted + 5000 - startedAt;
    if (wait > 0) { this.scheduleNext(wait); return; }
    this.clearTimer();
    this.lastStarted = startedAt;
    this.lastStartedWall = this.options.wallNow?.() ?? -Infinity;
    this.pending = true;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.requestTimer = this.options.schedule(() => {
      if (generation !== this.generation) return;
      this.invalidateRequest();
      if (this.active && this.options.visible()) {
        this.options.onError();
        this.scheduleNext(Math.max(0, this.lastStarted + 5000 - this.options.now()));
      }
    }, PUBLIC_STATUS_TIMEOUT_MS);
    let request: Promise<PublicSiteStatus>;
    try { request = this.options.read(controller.signal); } catch (error) { request = Promise.reject(error); }
    void request.then(status => {
      if (generation === this.generation && this.active && this.options.visible()) this.options.onStatus(acceptSiteStatus(status, startedAt, this.options.now()));
    }).catch(() => { if (generation === this.generation && this.active && this.options.visible()) this.options.onError(); }).finally(() => {
      if (generation !== this.generation) return;
      this.invalidateRequest();
      if (this.active && this.options.visible()) this.scheduleNext(Math.max(0, this.lastStarted + 5000 - this.options.now()));
    });
  }
  start() { if (this.active) return; this.active = true; this.refresh(); }
  focus() {
    // On some platforms performance.now pauses in system sleep. A large gap
    // between wall and monotonic elapsed time means the old throttle is stale.
    const wallElapsed = (this.options.wallNow?.() ?? -Infinity) - this.lastStartedWall;
    const monotonicElapsed = this.options.now() - this.lastStarted;
    if (wallElapsed >= 5000 && wallElapsed - monotonicElapsed >= 5000) this.lastStarted = -Infinity;
    this.refresh();
  }
  visibilityChanged() { if (this.options.visible()) this.refresh(); else { this.clearTimer(); this.invalidateRequest(); } }
  stop() { this.active = false; this.clearTimer(); this.invalidateRequest(); }
}
