import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type * as actions from '../../app/admin/reauth/actions';
function fixture() {
  const actor = { id: 'real-actor', credentialVersion: 'v1' };
  const queries: string[] = []; let proofs = 0; let cookie = ''; let passwordChecked = '';
  const tx = { user: { findUnique: async ({ where }: { where: { id: string } }) => { queries.push(where.id); return { passwordHash: 'actor-hash' }; } },
    account: { findFirst: async ({ where }: { where: { userId: string } }) => { queries.push(where.userId); return { providerAccountId: 'linked-id' }; } } };
  const dependencies: Record<string, unknown> = {
    '@/lib/mutation-boundary': { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { requireAdminActor: async () => actor, withAdminReauthentication: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) => work(tx, actor) },
    '@/lib/admin/reauth-store': { createAdminProof: async () => { proofs++; return 'opaque'; }, setAdminProofCookie: async (value: string) => { cookie = value; }, setAdminChallengeCookie: async (value: string) => { cookie = value; } },
    '@/lib/password-policy': { verifyPassword: async (value: string, hash: string) => { passwordChecked = hash; return value === 'correct'; } },
    '@/lib/rate-limit': { allowAction: async () => true },
    '@/lib/auth': { signIn: async () => {} },
    '@/lib/social-auth': { configuredSocialProviders: () => ['google'] },
    'next/cache': { revalidatePath: () => {} },
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../../app/admin/reauth/actions.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, process: { env: {} }, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { api: exports as typeof actions, queries, state: () => ({ proofs, cookie, passwordChecked }) };
}
test('password proof checks only actor password and ignores submitted target/timestamp', async () => {
  const f = fixture(); const form = new FormData();
  form.set('actorId', 'victim'); form.set('reauthenticatedAt', String(Date.now())); form.set('password', 'wrong');
  assert.ok((await f.api.confirmAdminPassword({}, form)).error);
  assert.equal(f.state().proofs, 0);
  form.set('password', 'correct');
  assert.equal((await f.api.confirmAdminPassword({}, form)).success, true);
  assert.deepEqual(f.queries, ['real-actor', 'real-actor']);
  assert.deepEqual(f.state(), { proofs: 1, cookie: 'opaque', passwordChecked: 'actor-hash' });
});
test('social reauthentication resolves the actor existing linked provider instead of browser identity', async () => {
  const f = fixture(); const form = new FormData();
  form.set('provider', 'google'); form.set('providerAccountId', 'forged'); form.set('actorId', 'victim');
  await f.api.confirmAdminSocial(form);
  assert.deepEqual(f.queries, ['real-actor']);
  assert.equal(f.state().proofs, 1);
  form.set('provider', 'unconfigured');
  await assert.rejects(f.api.confirmAdminSocial(form));
});
