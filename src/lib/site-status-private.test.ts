import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { PrivateContextValidator } from './site-status-private';

test('stalled private validation expires positive bypass, rejects late reply, and recovers on later checks', async () => {
  let visible = true;
  const timers = new Map<number, { delay: number; callback: () => void }>();
  let nextTimer = 0;
  const tasks: Array<{ resolve: (value: { bypass: boolean; testContextChanged: boolean }) => void; signal: AbortSignal }> = [];
  const states: boolean[] = [];
  const validator = new PrivateContextValidator({
    visible: () => visible,
    read: signal => new Promise(resolve => tasks.push({ resolve, signal })),
    onResult: result => states.push(result.bypass), onUnavailable: () => states.push(false),
    schedule: (callback, delay) => { const id = ++nextTimer; timers.set(id, { delay, callback }); return id; },
    cancel: id => { timers.delete(id as number); },
  });
  validator.refresh(); tasks[0].resolve({ bypass: true, testContextChanged: false }); await setImmediate();
  assert.equal(states.at(-1), true);
  validator.refresh();
  const timeout = [...timers.values()].find(timer => timer.delay === 8000)!;
  assert.ok(timeout);
  timeout.callback(); assert.equal(states.at(-1), false);
  assert.equal(tasks[1].signal.aborted, true);
  validator.refresh();
  tasks[1].resolve({ bypass: true, testContextChanged: false }); await setImmediate();
  assert.equal(states.at(-1), false);
  tasks[2].resolve({ bypass: false, testContextChanged: true }); await setImmediate();
  assert.equal(states.at(-1), false);
  validator.refresh(); tasks[3].resolve({ bypass: true, testContextChanged: false }); await setImmediate();
  assert.equal(states.at(-1), true);
  visible = false; validator.visibilityChanged();
  assert.equal(states.at(-1), false);
  validator.stop();
});

test('a positive private proof expires even without another public status response', async () => {
  const timers = new Map<number, { delay: number; callback: () => void }>(); let next = 0;
  const states: boolean[] = [];
  const validator = new PrivateContextValidator({ visible: () => true,
    read: async () => ({ bypass: true, testContextChanged: false }),
    onResult: result => states.push(result.bypass), onUnavailable: () => states.push(false),
    schedule: (callback, delay) => { const id = ++next; timers.set(id, { delay, callback }); return id; },
    cancel: id => { timers.delete(id as number); },
  });
  validator.refresh(); await setImmediate(); assert.equal(states.at(-1), true);
  const expiry = [...timers.values()].find(timer => timer.delay === 10_000)!;
  assert.ok(expiry); expiry.callback(); assert.equal(states.at(-1), false);
  validator.stop();
});
test('public status failure invalidates an in-flight private proof while visible', async () => {
  let resolve!: (value: { bypass: boolean; testContextChanged: boolean }) => void;
  let signal!: AbortSignal;
  const states: boolean[] = [];
  const validator = new PrivateContextValidator({ visible: () => true,
    read: input => { signal = input; return new Promise(done => { resolve = done; }); },
    onResult: result => states.push(result.bypass), onUnavailable: () => states.push(false),
    schedule: () => 1, cancel: () => {},
  });
  validator.refresh(); validator.invalidate();
  assert.equal(signal.aborted, true);
  assert.equal(states.at(-1), false);
  resolve({ bypass: true, testContextChanged: false }); await setImmediate();
  assert.equal(states.at(-1), false);
  validator.stop();
});
test('focus after sleep expires a stale positive proof before timers resume', async () => {
  let wall = 0;
  const states: boolean[] = [];
  const validator = new PrivateContextValidator({ visible: () => true, wallNow: () => wall,
    read: async () => ({ bypass: true, testContextChanged: false }),
    onResult: result => states.push(result.bypass), onUnavailable: () => states.push(false),
    schedule: () => 1, cancel: () => {},
  });
  validator.refresh(); await setImmediate(); assert.equal(states.at(-1), true);
  wall = 60_000; validator.focus();
  assert.equal(states.at(-1), false);
  validator.stop();
});
test('initial server-provided positive proof also expires without a private reply', () => {
  let wall = 0; const states: boolean[] = [];
  const validator = new PrivateContextValidator({ visible: () => true, wallNow: () => wall, initialBypass: true,
    read: () => new Promise(() => {}), onResult: result => states.push(result.bypass), onUnavailable: () => states.push(false),
    schedule: () => 1, cancel: () => {},
  });
  wall = 10_001; validator.focus();
  assert.deepEqual(states, [false]);
  validator.stop();
});
