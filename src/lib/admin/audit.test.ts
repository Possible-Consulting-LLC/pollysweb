import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type * as audit from './audit';
function fixture() {
  const events: unknown[] = [];
  const tx = { adminAudit: { create: async (args: unknown) => { events.push(args); },
    findMany: async (args: unknown) => { events.push(args); return []; },
    deleteMany: async (args: unknown) => { events.push(args); return { count: 4 }; } } };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('./audit.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, require: (name: string) => { assert.equal(name, 'server-only'); return {}; } });
  return { api: exports as typeof audit, tx: tx as unknown as Parameters<typeof audit.appendAudit>[0], events };
}
test('audit rejects secrets, emails, nested and unrecognized metadata before any write', async () => {
  const f = fixture();
  for (const changes of [{ password: 'secret' }, { access_token: 'secret' }, { email: 'private@example.com' }, { role: { password: 'secret' } }, { role: 'private@example.com' }]) {
    await assert.rejects(f.api.appendAudit(f.tx, { actorId: 'actor', targetId: 'target', action: 'account.edit', reason: 'Support request', changes: changes as never }));
  }
  assert.equal(f.events.length, 0);
  await f.api.appendAudit(f.tx, { actorId: 'actor', targetId: 'target', action: 'account.role', reason: 'Delegate administration', changes: { role: 'admin' } });
  assert.deepEqual(JSON.parse(JSON.stringify(f.events)), [{ data: { actorId: 'actor', targetId: 'target', action: 'account.role', reason: 'Delegate administration', changes: { role: 'admin' } } }]);
});
test('audit pagination caps requests and uses stable descending timestamp/id cursors', async () => {
  const f = fixture();
  await f.api.queryAudit(f.tx, { limit: 500, actorId: 'actor', cursor: { id: 'last', createdAt: '2026-09-20T00:00:00.000Z' } });
  const args = JSON.parse(JSON.stringify(f.events[0]));
  assert.equal(args.take, 101);
  assert.deepEqual(args.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.deepEqual(args.where.OR, [{ createdAt: { lt: '2026-09-20T00:00:00.000Z' } }, { createdAt: '2026-09-20T00:00:00.000Z', id: { lt: 'last' } }]);
  assert.equal(args.where.actorId, 'actor');
});
test('retention uses twelve UTC calendar months and appends a minimal cleanup receipt', async () => {
  const f = fixture();
  assert.equal(await f.api.cleanupAudit(f.tx, 'actor', new Date('2028-02-29T12:00:00Z')), 4);
  const events = JSON.parse(JSON.stringify(f.events));
  assert.equal(events[0].where.createdAt.lt, '2027-02-28T12:00:00.000Z');
  assert.equal(events[1].data.action, 'audit.cleanup');
  assert.equal(events[1].data.changes.deletedCount, 4);
});
