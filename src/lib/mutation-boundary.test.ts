import * as maintenancePolicy from './admin/maintenance-policy';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { mutationIdentity } from './mutation-context';
import * as session from './admin/test-session';
import * as failure from './mutation-failure';
function fixture() {
  let identity: session.RequestIdentity | null = { actorId: 'actor', effectiveUserId: 'demo', testSessionId: 'test', contextVersion: 'a'.repeat(64) };
  let invalid = false;
  const audits: string[] = [];
  const exports = {};
  const deps: Record<string, unknown> = { 'server-only': {}, './admin/maintenance-policy':maintenancePolicy, './admin/maintenance-access':{guardMaintenance:async()=>{}}, './mutation-failure': failure, './mutation-context': { mutationIdentity }, './admin/test-session': session,
    './admin/test-session-store': { resolveRequestIdentity: async () => { if (invalid) throw new session.TestContextError(); return identity; }, anonymousMutationContext: () => 'b'.repeat(64), auditTestMutation: async (i: session.RequestIdentity, _action: string, result: string) => audits.push(`${i.actorId}:${i.effectiveUserId}:${result}`) } };
  const code = ts.transpileModule(readFileSync(new URL('./mutation-boundary.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
      assert.ok(name in deps, name);
      return deps[name];
    } });
  return { api: exports as typeof import('./mutation-boundary'), audits, invalidate: () => { invalid = true; }, revoke: () => {
      identity = null;
    } };
}
test('stale context rejected before helpers can perform early timezone writes', async () => {
  const f = fixture();
  let writes = 0;
  const result = await f.api.withMutation('b'.repeat(64), 'data', 'care', async () => { writes++; return { ok: true }; });
  assert.equal(result.ok, false);
  assert.ok('code' in result && result.code === 'context_changed');
  assert.ok('error' in result);
  assert.match(String(result.error), /reload/i);
  assert.match(String(result.error), /Return to admin/i);
  assert.equal(writes, 0);
  assert.deepEqual(f.audits, []);
});
test('stop during admitted action retains captured demo target, and rejects next stale submission', async () => {
  const f = fixture();
  let target = '';
  await f.api.withMutation('a'.repeat(64), 'data', 'care', async () => {
    f.revoke();
    target = mutationIdentity.getStore()!.identity!.effectiveUserId;
    return { ok: true };
  });
  assert.equal(target, 'demo');
  assert.deepEqual(f.audits, ['actor:demo:attempted', 'actor:demo:succeeded']);
  const failed = await f.api.withMutation('a'.repeat(64), 'data', 'care', async () => assert.fail('stale write'));
  assert.equal(failed.code, 'context_changed');
});
for (const kind of ['identity', 'admin', 'billing', 'public-identity'] as const)
  test(`testing denies ${kind} before side effects`, async () => {
    const f = fixture();
    const failed = await f.api.withMutation('a'.repeat(64), kind, 'care', async () => assert.fail('forbidden'));
    assert.equal(failed.code, 'context_changed');
    assert.deepEqual(f.audits, []);
  });
test('failed and throwing actions never receive a successful mutation audit', async () => {
  const f = fixture();
  await f.api.withMutation('a'.repeat(64), 'data', 'care', async () => ({ ok: false, error: 'private note' }));
  await assert.rejects(f.api.withMutation('a'.repeat(64), 'data', 'care', async () => {
    throw Error('private note');
  }));
  assert.deepEqual(f.audits, ['actor:demo:attempted', 'actor:demo:attempted']);
});

test('invalid-cookie resolution returns safe inline guidance before invoking a helper', async () => {
  const f = fixture(); f.invalidate();
  const result = await f.api.withMutation('a'.repeat(64), 'data', 'care', async () => assert.fail('must not write'));
  assert.equal(result.code, 'context_changed');
  assert.match(result.error, /unsaved/i);
  assert.deepEqual(f.audits, []);
});
test('successful action return shapes and redirect control flow are preserved', async () => {
  for (const expected of [{ok:true,message:'saved'}, {success:'saved'}, {url:'/billing'}, {operationId:'op',stage:'completed'}]) {
    const f=fixture();
    const result=await f.api.withMutation('a'.repeat(64),'data','care',async()=>expected);
    assert.deepEqual(result, expected);
  }
  const f=fixture(), redirect=Error('NEXT_REDIRECT');
  await assert.rejects(f.api.withMutation('a'.repeat(64),'data','care',async()=>{throw redirect;}), error=>error===redirect);
});
