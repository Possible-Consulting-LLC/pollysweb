import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
function fixture(change: boolean) {
  const events: string[] = [];
  const day = { id: 'day', dayKey: '2026-09-19', timeZone: 'UTC', invalidatedAt: change ? new Date() : null, snapshot: { spiderIds: ['spider'], policy: { feedIntervalDays: 3, mistIntervalDays: 1, statuses: {} }, manualReviewedIds: [] } };
  const empty = { findMany: async () => [] };
  const tx = { $executeRaw: async () => {
    }, careDay: { findMany: async () => [day], update: async () => {
        events.push('write');
      } }, user: { findUniqueOrThrow: async () => ({ feedDefaultDays: 3, mistDefaultDays: 1 }) }, spider: empty, feedingEvent: empty, mistingEvent: empty, observationEvent: empty, bodyConditionEvent: empty, moltEvent: empty, careCheckin: empty };
  const identity = { actorId: 'actor', effectiveUserId: 'demo', testSessionId: 'test' };
  const deps: Record<string, unknown> = { './db': { prisma: { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(tx) } }, './constellation': { calendarDayKey: () => '2026-09-19' }, './care': { POST_MOLT_RECOVERY_DAYS: 5 }, './care-day-revalidation': { careDayStillQualifies: () => true }, './constants': { SUCCESSFUL_FEEDING_OUTCOMES: [] }, './derived-mutation': { derivedMutationIdentity: async (id: string) => {
        assert.equal(id, 'demo');
        return identity;
      }, recordDerivedChange: async (_tx: unknown, i: unknown, work: () => Promise<unknown>) => {
        assert.equal(i, identity);
        events.push('attempt');
        await work();
        events.push('success');
      } } };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('./care-revalidation-data.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, JSON, require: (name: string) => {
      assert.ok(name in deps, name);
      return deps[name];
    } });
  return { api: exports as typeof import('./care-revalidation-data'), events };
}
test('unchanged care reads produce no mutation audit', async () => {
  const f = fixture(false);
  await f.api.reconcileCareDays('demo');
  assert.deepEqual(f.events, []);
});
test('derived care restoration attributes only an actual write to captured actor and target', async () => {
  const f = fixture(true);
  await f.api.reconcileCareDays('demo');
  assert.deepEqual(f.events, ['attempt', 'write', 'success']);
});
