export type PrivateStatusContext = { bypass: boolean; testContextChanged: boolean };
type Options = { visible: () => boolean; wallNow?: () => number; initialBypass?: boolean; read: (signal: AbortSignal) => Promise<PrivateStatusContext>; onResult: (result: PrivateStatusContext) => void; onUnavailable: () => void; schedule: (callback: () => void, delay: number) => unknown; cancel: (id: unknown) => void };
export const PRIVATE_STATUS_TIMEOUT_MS = 8000;
export const PRIVATE_STATUS_FRESHNESS_MS = 10_000;
export class PrivateContextValidator {
  private active = true;
  private pending = false;
  private generation = 0;
  private controller: AbortController | null = null;
  private requestTimer: unknown;
  private freshnessTimer: unknown;
  private requestStartedWall = -Infinity;
  private validatedWall = -Infinity;
  constructor(private readonly options: Options) {
    if (options.initialBypass) {
      this.validatedWall = this.wallNow();
      this.freshnessTimer = options.schedule(() => { this.freshnessTimer = undefined; this.unavailable(); }, PRIVATE_STATUS_FRESHNESS_MS);
    }
  }
  private wallNow() { return this.options.wallNow?.() ?? Date.now(); }
  private clearFreshness() {
    if (this.freshnessTimer !== undefined) this.options.cancel(this.freshnessTimer);
    this.freshnessTimer = undefined;
  }
  private invalidatePending() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    if (this.requestTimer !== undefined) this.options.cancel(this.requestTimer);
    this.requestTimer = undefined;
    this.pending = false;
    this.requestStartedWall = -Infinity;
  }
  private unavailable() {
    this.clearFreshness();
    this.validatedWall = -Infinity;
    if (this.active) this.options.onUnavailable();
  }
  refresh() {
    if (!this.active || !this.options.visible() || this.pending) return;
    this.pending = true;
    this.requestStartedWall = this.wallNow();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.requestTimer = this.options.schedule(() => {
      if (generation !== this.generation) return;
      this.invalidatePending();
      this.unavailable();
    }, PRIVATE_STATUS_TIMEOUT_MS);
    let request: Promise<PrivateStatusContext>;
    try { request = this.options.read(controller.signal); } catch (error) { request = Promise.reject(error); }
    void request.then(result => {
      if (generation !== this.generation || !this.active || !this.options.visible()) return;
      this.invalidatePending();
      this.clearFreshness();
      this.validatedWall = this.wallNow();
      this.options.onResult({ bypass: result.bypass === true, testContextChanged: result.testContextChanged === true });
      this.freshnessTimer = this.options.schedule(() => {
        this.freshnessTimer = undefined;
        this.unavailable();
      }, PRIVATE_STATUS_FRESHNESS_MS);
    }).catch(() => {
      if (generation !== this.generation) return;
      this.invalidatePending();
      this.unavailable();
    });
  }
  visibilityChanged() {
    if (this.options.visible()) return;
    this.invalidate();
  }
  focus() {
    const now = this.wallNow();
    if (this.pending && now - this.requestStartedWall >= PRIVATE_STATUS_TIMEOUT_MS) this.invalidate();
    else if (Number.isFinite(this.validatedWall) && now - this.validatedWall >= PRIVATE_STATUS_FRESHNESS_MS) this.invalidate();
  }
  invalidate() { this.invalidatePending(); this.unavailable(); }
  stop() { this.active = false; this.invalidatePending(); this.clearFreshness(); }
}
