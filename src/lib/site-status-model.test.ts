import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { acceptSiteStatus, protectedSitePath, siteStatusView, SiteStatusPoller, type PublicSiteStatus } from './site-status-model';

const countdown: PublicSiteStatus = { mode: 'countdown', serverTime: '2026-09-22T12:00:00.000Z', deadline: '2026-09-22T12:01:00.000Z', announcementEnabled: false, announcement: '' };
test('blocking treatment applies to app and admin pages while login, legal and maintenance stay usable', () => {
  for (const path of ['/home', '/spoods/new', '/today', '/admin/maintenance']) assert.equal(protectedSitePath(path), true, path);
  for (const path of ['/', '/login', '/register', '/privacy', '/terms', '/data-deletion', '/maintenance']) assert.equal(protectedSitePath(path), false, path);
});

test('server-relative countdown ignores a skewed wall clock and accounts for a slow response', () => {
  const sample = acceptSiteStatus(countdown, 100, 2100);
  assert.deepEqual(siteStatusView(sample, 2100), { mode: 'countdown', seconds: 60 });
  assert.deepEqual(siteStatusView(sample, 62100), { mode: 'countdown', seconds: 0 });
  assert.deepEqual(siteStatusView(acceptSiteStatus({ ...countdown, mode: 'active' }, 63_000, 63_100), 63_100), { mode: 'active', seconds: 0 });
});

test('pre-timestamp server delay cannot consume the save window on receipt', () => {
  const delayed = acceptSiteStatus(countdown, 0, 120_000);
  assert.deepEqual(siteStatusView(delayed, 120_000), { mode: 'countdown', seconds: 60 });
});

test('announcement does not schedule maintenance and a later status replaces the old deadline', () => {
  const open: PublicSiteStatus = { mode: 'open', serverTime: '2026-09-22T12:00:30.000Z', deadline: null, announcementEnabled: true, announcement: 'Updates tonight' };
  assert.deepEqual(siteStatusView(acceptSiteStatus(open, 0, 100), 60_000), { mode: 'open', seconds: null });
  assert.deepEqual(siteStatusView(acceptSiteStatus(countdown, 0, 100), 100), { mode: 'countdown', seconds: 60 });
});

test('visible tabs poll at most once per five seconds, coalesce focus, pause hidden, and refresh on return', async () => {
  let now = 0; let visible = true; let calls = 0;
  let finish!: (value: PublicSiteStatus) => void;
  const received: string[] = [];
  const poller = new SiteStatusPoller({
    now: () => now, visible: () => visible,
    read: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    onStatus: sample => received.push(sample.status.mode), onError: () => { },
    schedule: () => 1, cancel: () => { },
  });
  poller.start(); poller.focus(); assert.equal(calls, 1);
  finish(countdown); await setImmediate();
  now = 4000; poller.focus(); assert.equal(calls, 1);
  visible = false; poller.visibilityChanged(); now = 10_000; poller.focus(); assert.equal(calls, 1);
  visible = true; poller.visibilityChanged(); assert.equal(calls, 2);
  poller.focus(); assert.equal(calls, 2);
  finish({ ...countdown, mode: 'active' }); await setImmediate();
  assert.deepEqual(received, ['countdown', 'active']);
  poller.stop();
});
test('focus refreshes after system sleep even when the monotonic timer did not advance', async () => {
  let monotonic = 100; let wall = 100; let calls = 0;
  const poller = new SiteStatusPoller({
    now: () => monotonic, wallNow: () => wall, visible: () => true,
    read: async () => { calls++; return countdown; }, onStatus: () => {}, onError: () => {}, schedule: () => 1, cancel: () => {},
  });
  poller.start(); await setImmediate();
  wall += 60_000; monotonic += 100;
  poller.focus();
  assert.equal(calls, 2);
  poller.stop();
});
test('short hide/show preserves the five-second throttle and hidden completion does not publish status', async () => {
  let now = 0; let visible = true; let calls = 0;
  let finish!: (status: PublicSiteStatus) => void;
  const scheduled: Array<{ delay: number; callback: () => void }> = [];
  const received: string[] = [];
  const poller = new SiteStatusPoller({ now: () => now, visible: () => visible,
    read: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    onStatus: sample => received.push(sample.status.mode), onError: () => {},
    schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; }, cancel: () => {},
  });
  poller.start(); visible = false; poller.visibilityChanged();
  finish(countdown); await setImmediate();
  assert.deepEqual(received, []);
  now = 100; visible = true; poller.visibilityChanged();
  assert.equal(calls, 1);
  assert.equal(scheduled.at(-1)?.delay, 4900);
  now = 5000; scheduled.at(-1)!.callback(); assert.equal(calls, 2);
  poller.stop();
});
test('stalled public request times out, releases in-flight state, ignores late response, and recovers', async () => {
  let now = 0; let calls = 0; let errors = 0;
  const tasks: Array<{ resolve: (value: PublicSiteStatus) => void; signal: AbortSignal }> = [];
  const timers = new Map<number, { delay: number; callback: () => void }>();
  let nextTimer = 0;
  const received: string[] = [];
  const poller = new SiteStatusPoller({ now: () => now, visible: () => true,
    read: signal => { calls++; return new Promise(resolve => tasks.push({ resolve, signal })); },
    onStatus: sample => received.push(sample.status.mode), onError: () => { errors++; },
    schedule: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    cancel: id => { timers.delete(id as number); },
  });
  poller.start();
  assert.equal(calls, 1);
  const timeout = [...timers.values()].find(timer => timer.delay === 8000);
  assert.ok(timeout);
  now = 8000; timeout.callback();
  assert.equal(tasks[0].signal.aborted, true);
  assert.equal(errors, 1);
  const retry = [...timers.values()].find(timer => timer.delay === 0);
  assert.ok(retry);
  retry.callback(); assert.equal(calls, 2);
  tasks[0].resolve({ ...countdown, mode: 'active' }); await setImmediate();
  assert.deepEqual(received, []);
  tasks[1].resolve(countdown); await setImmediate();
  assert.deepEqual(received, ['countdown']);
  poller.stop();
});
