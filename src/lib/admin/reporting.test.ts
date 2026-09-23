import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as periods from './analytics-period';
import * as presentation from './presentation';
import type * as Actions from '../../app/admin/actions';

function fixture() {
  let actor = { id: 'admin-a' }, saved = 'Asia/Tokyo';
  let blocked = false, denied = false;
  const updates: unknown[] = [], refreshed: unknown[] = [];
  const exports: Record<string, unknown> = {};
  const dependencies: Record<string, unknown> = {
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, kind: string, _action: string, work: () => Promise<unknown>) => {
      assert.equal(kind, 'admin'); return blocked ? { error: 'Reload to leave testing context.' } : work();
    } },
    '@/lib/admin/actor': { withAdminReauthentication: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) => {
      if (denied) throw new Error('denied');
      return work({ user: { findUniqueOrThrow: async () => ({ timezone: saved }), update: async (input: unknown) => updates.push(input) } }, actor);
    } },
    '@/lib/admin/analytics-period': periods,
    '@/lib/admin/presentation': presentation,
    '@/lib/admin/metrics-cache': { refreshCachedBadges: (period: unknown, demo: unknown) => refreshed.push([period, demo]) },
    'next/cache': { revalidatePath: () => {} },
  };
  const code = ts.transpileModule(readFileSync(new URL('../../app/admin/actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { api: exports as typeof Actions, updates, refreshed, setSaved: (value: string) => { saved = value; }, setBlocked: () => { blocked = true; }, setDenied: () => { denied = true; }, setActor: (value: typeof actor) => { actor = value; } };
}

test('saved administrator zone controls refresh despite forged form zone/actor/range', async () => {
  const f = fixture(), form = new FormData();
  form.set('timezone', 'America/Los_Angeles'); form.set('actorId', 'admin-b'); form.set('days', '14'); form.set('includeDemo', 'yes');
  assert.equal((await f.api.refreshMetricsAction(form)).success, true);
  const [period, demo] = f.refreshed[0] as [periods.ReportingPeriod, boolean];
  assert.equal(period.zone, 'Asia/Tokyo'); assert.equal(demo, true); assert.equal(periods.reportingDates(period).length, 14);
  form.set('days', '500');
  assert.ok((await f.api.refreshMetricsAction(form)).error); assert.equal(f.refreshed.length, 1);
});
test('own timezone update works for an administrator and cannot target another user', async () => {
  const f = fixture(), form = new FormData();
  form.set('timezone', 'America/Los_Angeles'); form.set('userId', 'owner');
  assert.equal((await f.api.saveReportingTimezoneAction(form)).success, true);
  assert.equal(JSON.stringify(f.updates[0]), JSON.stringify({ where: { id: 'admin-a' }, data: { timezone: 'America/Los_Angeles' } }));
  form.set('timezone', '+05:00'); assert.ok((await f.api.saveReportingTimezoneAction(form)).error); assert.equal(f.updates.length, 1);
});
test('stale testing contexts and revoked actors cannot refresh aggregates or save preferences', async () => {
  for (const deny of ['setBlocked', 'setDenied'] as const) {
    const f = fixture(); f[deny]();
    const form = new FormData(); form.set('timezone', 'UTC'); form.set('days', '7');
    assert.ok((await f.api.refreshMetricsAction(form)).error);
    assert.ok((await f.api.saveReportingTimezoneAction(form)).error);
    assert.equal(f.refreshed.length, 0); assert.equal(f.updates.length, 0);
  }
});
test('unset or invalid preferences are visibly represented as UTC fallback', () => {
  assert.deepEqual(presentation.adminTimezone(''), { timezone: 'UTC', fallback: true });
  assert.deepEqual(presentation.adminTimezone('bad/zone'), { timezone: 'UTC', fallback: true });
  assert.deepEqual(presentation.adminTimezone('+05:00'), { timezone: 'UTC', fallback: true });
  assert.deepEqual(presentation.adminTimezone('Asia/Tokyo'), { timezone: 'Asia/Tokyo', fallback: false });
});
