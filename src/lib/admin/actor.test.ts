import * as maintenancePolicy from './maintenance-policy';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { TestContextError } from './test-session';
import * as policy from './policy';
import * as credentials from '../credential-version';
import * as reauth from './reauth';
import type * as actorModule from './actor';

const secret = 'test-secret';
const rowFixture = (id: string, role = 'admin') => ({ id, role, emailVerified: new Date(),
  isDemo: false, suspendedAt: null as Date | null, deletingAt: null as Date | null,
  passwordHash: 'hash', authVersion: 'auth-v1', emailChangeVersion: null,
  adminVersion: null as string | null });
function fixture() {
  const actor = rowFixture('z-actor');
  const owner = rowFixture('owner', 'super_admin');
  const target = rowFixture('a-target', 'user');
  const rows = new Map([actor, owner, target].map(row => [row.id, row]));
  const session = { user: { id: actor.id, role: 'super_admin', owner: true,
    credentialVersion: credentials.credentialFingerprint('hash', secret), emailChangeReauthAt: Date.now() } };
  const environment: Record<string, string | undefined> = { AUTH_SECRET: secret, ADMIN_OWNER_ID: owner.id };
  const binding = { id: 1, userId: owner.id };
  const locks: string[] = [];
  let onLock = () => {};
  let proof: number | null = null;
  const deletion = { id: 'op', targetId: target.id, targetRole: 'user', stage: 'blocked_access' };
  const stats = { ownerReads: 0, userReads: 0, proofReads: 0 };
  const hooks: Record<string, (...args: unknown[]) => unknown> = {
    denyTestContext: async () => {},
    getRequestSession: async () => session,
    guardMaintenance: async () => {},
    readAdminProof: async () => { stats.proofReads++; return proof; },
  };
  const db = {
    accountDeletionOperation: { findUnique: async () => deletion },
    user: { findUnique: async ({ where }: { where: { id: string } }) => { stats.userReads++; return rows.get(where.id) ?? null; } },
    protectedOwner: { findUnique: async () => { stats.ownerReads++; return binding.userId ? { ...binding, user: rows.get(binding.userId) } : null; } },
    $queryRaw: async (_sql: TemplateStringsArray, id: string) => { locks.push(id); onLock(); return rows.has(id) ? [{ id }] : []; },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db),
  };
  const exports: Record<string, unknown> = {};
  const dependencies: Record<string, unknown> = { 'server-only': {}, './maintenance-access': { guardMaintenance: (...args: unknown[]) => hooks.guardMaintenance(...args) }, './maintenance-policy': maintenancePolicy, '@/lib/db': { prisma: db },
    '@/lib/raw-session': { getRequestSession: () => hooks.getRequestSession() }, './test-session-store': { denyTestContext: () => hooks.denyTestContext() }, './policy': policy, '../credential-version': credentials, './reauth': reauth, './reauth-store': { readAdminProof: (...args: unknown[]) => hooks.readAdminProof(...args) } };
  const code = ts.transpileModule(readFileSync(new URL('./actor.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, process: { env: environment }, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name];
  } });
  return { api: exports as typeof actorModule, actor, owner, target, rows, session, binding, environment, locks, deletion, db, stats, hooks,
    setProof: (time: number | null) => { proof = time; },
    duringLock: (fn: () => void) => { onLock = fn; } };
}
test('live row ignores forged role, owner and reauthentication session claims', async () => {
  const f = fixture();
  const actor = await f.api.requireAdminActor('admin');
  assert.equal(actor.role, 'admin'); assert.equal(actor.owner, false); assert.equal(actor.reauthenticatedAt, null);
  await assert.rejects(f.api.requireAdminActor('super_admin'));
  f.actor.role = 'user';
  await assert.rejects(f.api.requireAdminActor('admin'));
});
test('only verified immutable owner binding confers owner status', async () => {
  const f = fixture(); f.session.user.id = f.owner.id;
  assert.equal((await f.api.requireAdminActor('super_admin')).owner, true);
  f.environment.ADMIN_OWNER_ID = f.actor.id;
  await assert.rejects(f.api.requireAdminActor('admin'));
  assert.equal(f.binding.userId, 'owner');
});
test('missing configuration, binding, owner or invalid owner state denies every admin', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { delete f.environment.ADMIN_OWNER_ID; },
    (f: ReturnType<typeof fixture>) => { f.binding.userId = ''; },
    (f: ReturnType<typeof fixture>) => { f.rows.delete('owner'); },
    (f: ReturnType<typeof fixture>) => { f.owner.role = 'user'; },
    (f: ReturnType<typeof fixture>) => { f.owner.suspendedAt = new Date(); },
    (f: ReturnType<typeof fixture>) => { f.owner.isDemo = true; },
  ]) { const f = fixture(); mutate(f); await assert.rejects(f.api.requireAdminActor('admin')); }
});
test('suspended, deleting, demo, unverified, missing and stale actors are rejected', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.actor.suspendedAt = new Date(); },
    (f: ReturnType<typeof fixture>) => { f.actor.deletingAt = new Date(); },
    (f: ReturnType<typeof fixture>) => { f.actor.isDemo = true; },
    (f: ReturnType<typeof fixture>) => { f.actor.emailVerified = null as unknown as Date; },
    (f: ReturnType<typeof fixture>) => { f.rows.delete(f.actor.id); },
    (f: ReturnType<typeof fixture>) => { f.actor.adminVersion = 'rotated'; },
    (f: ReturnType<typeof fixture>) => { f.session.user.credentialVersion = 'forged'; },
  ]) { const f = fixture(); mutate(f); await assert.rejects(f.api.requireAdminActor('admin')); }
});
test('mutations lock sorted IDs before rereading and applying live authorization', async () => {
  const f = fixture();
  const result = await f.api.withAdminMutation(f.target.id, 'edit', async (_tx, actor, target) => `${actor.id}:${target.id}`);
  assert.equal(result, 'z-actor:a-target');
  assert.deepEqual(f.locks, ['a-target', 'z-actor']);
  f.duringLock(() => { f.actor.role = 'user'; });
  let called = false;
  await assert.rejects(f.api.withAdminMutation(f.target.id, 'edit', async () => { called = true; }));
  assert.equal(called, false);
});
test('mutation rejects target promotion, owner mutation and credential rotation after lock', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.target.role = 'admin'; },
    (f: ReturnType<typeof fixture>) => { f.actor.adminVersion = 'rotated'; },
    (f: ReturnType<typeof fixture>) => { f.target.deletingAt = new Date(); },
  ]) {
    const f = fixture(); f.duringLock(() => mutate(f));
    let called = false;
    await assert.rejects(f.api.withAdminMutation(f.target.id, 'edit', async () => { called = true; }));
    assert.equal(called, false);
  }
  const f = fixture(); f.actor.role = 'super_admin';
  await assert.rejects(f.api.withAdminMutation(f.owner.id, 'delete', async () => 'forbidden'));
});

test('shared session resolver clears suspended and deleting accounts while ordinary sessions need no owner binding', async () => {
  for (const state of ['active', 'suspendedAt', 'deletingAt'] as const) {
    let cleared = false;
    const user = { id: 'ordinary', suspendedAt: null as Date | null, deletingAt: null as Date | null };
    if (state !== 'active') user[state] = new Date();
    const exports: Record<string, unknown> = {};
    const dependencies: Record<string, unknown> = {
      react: { cache: (fn: unknown) => fn },
      './admin/maintenance-access':{guardMaintenance:async()=>{}}, './admin/maintenance-policy':maintenancePolicy, 'next/dist/client/components/redirect-error':{isRedirectError:(e:Error)=>e.message.startsWith('/')},
      '@/lib/raw-session': { getRequestSession: async () => ({user:{id:user.id}}) },
      '@/lib/admin/test-session-store': { resolveRequestIdentity: async () => ({actorId:user.id,effectiveUserId:user.id,testSessionId:null,contextVersion:'context'}) },
      '@/lib/admin/test-session': { TestContextError: class extends Error {} },
      '@/lib/mutation-context': { mutationIdentity: {getStore:()=>undefined} },
      '@/lib/auth': { auth: async () => ({ user: { id: user.id } }), signOut: async () => { cleared = true; } },
      '@/lib/db': { prisma: { user: { findUnique: async () => user } } },
      'next/navigation': { redirect: (url: string) => { throw new Error(url); } },
    };
    const code = ts.transpileModule(readFileSync(new URL('../session.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; } });
    const api = exports as { getActionUser(): Promise<{ id: string } | null>; getSessionUser(): Promise<{ id: string } | null> };
    if (state === 'active') {
      assert.equal((await api.getActionUser())?.id, 'ordinary');
      assert.equal(cleared, false);
    } else {
      assert.equal(await api.getActionUser(), null);
      assert.equal(cleared, true);
      await assert.rejects(api.getSessionUser(), /clear-stale/);
    }
  }
});

test('role/demo/delete require live reauthentication inside the locked transaction', async () => {
  for (const operation of ['role', 'demo', 'delete'] as const) {
    const f = fixture(); f.actor.role = 'super_admin';
    let called = false;
    await assert.rejects(f.api.withAdminMutation(f.target.id, operation, async () => { called = true; }));
    assert.equal(called, false);
    f.setProof(Date.now());
    await f.api.withAdminMutation(f.target.id, operation, async () => { called = true; });
    assert.equal(called, true);
  }
});
test('site controls require locked live super-admin actor and recent proof', async () => {
  const f = fixture(); let called = false;
  await assert.rejects(f.api.withAdminControl(async () => { called = true; }));
  f.actor.role = 'super_admin';
  await assert.rejects(f.api.withAdminControl(async () => { called = true; }));
  assert.equal(called, false);
  f.setProof(Date.now());
  await f.api.withAdminControl(async () => { called = true; });
  assert.equal(called, true);
  f.duringLock(() => { f.actor.role = 'user'; });
  await assert.rejects(f.api.withAdminControl(async () => {}));
});

test('deletion resume preserves sorted locks, proof, live actor and exact receipt target', async () => {
 const f=fixture();f.actor.role='super_admin';f.target.deletingAt=new Date();f.setProof(Date.now());
 await f.api.withAccountDeletionMutation(f.target.id,'op',async()=>{});
 assert.deepEqual(f.locks,['a-target','z-actor']);
 await assert.rejects(f.api.withAdminMutation(f.target.id,'edit',async()=>{}));
 await assert.rejects(f.api.withAccountDeletionMutation(f.target.id,'wrong-operation',async()=>{}));
 f.setProof(null);await assert.rejects(f.api.withAccountDeletionMutation(f.target.id,'op',async()=>{}));
 f.setProof(Date.now());f.duringLock(()=>{f.actor.role='user';});await assert.rejects(f.api.withAccountDeletionMutation(f.target.id,'op',async()=>{}));
});
test('missing target requires completed matching deletion receipt', async()=>{
 const f=fixture();f.actor.role='super_admin';f.setProof(Date.now());f.rows.delete(f.target.id);
 await assert.rejects(f.api.withAccountDeletionMutation(f.target.id,'op',async()=>{}));
 f.deletion.stage='completed';await f.api.withAccountDeletionMutation(f.target.id,'op',async()=>{});
 await assert.rejects(f.api.withAccountDeletionMutation(f.target.id,undefined,async()=>{}));
});
test('target suspension after Test-as admission never signs out the real actor', async () => {
  let signOuts = 0;
  class TestContextError extends Error {}
  const dependencies: Record<string, unknown> = {
    react: { cache: (fn: unknown) => fn },
      './admin/maintenance-access':{guardMaintenance:async()=>{}}, './admin/maintenance-policy':maintenancePolicy, 'next/dist/client/components/redirect-error':{isRedirectError:(e:Error)=>e.message.startsWith('/')},
    '@/lib/auth': { signOut: async () => { signOuts++; } },
    '@/lib/raw-session': { getRequestSession: async () => ({ user: { id: 'actor' } }) },
    '@/lib/admin/test-session-store': { resolveRequestIdentity: async () => ({ actorId: 'actor', effectiveUserId: 'demo', testSessionId: 'test', contextVersion: 'v' }) },
    '@/lib/admin/test-session': { TestContextError },
    '@/lib/mutation-context': { mutationIdentity: { getStore: () => undefined } },
    '@/lib/db': { prisma: { user: { findUnique: async () => ({ id: 'demo', suspendedAt: new Date() }) } } },
    'next/navigation': { redirect: (url: string) => { throw Error(url); } },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../session.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => dependencies[name] });
  await assert.rejects((exports as typeof import('../session')).getActionUser(), TestContextError);
  assert.equal(signOuts, 0);
});

test('page session context returns the guarded user and admitted Test-as identity from one resolution', async () => {
  let resolutions = 0;
  const identity = { actorId: 'actor', effectiveUserId: 'demo', testSessionId: 'test', contextVersion: 'v' };
  const dependencies: Record<string, unknown> = {
    react: { cache: (fn: unknown) => fn },
    './admin/maintenance-access': { guardMaintenance: async () => {} },
    './admin/maintenance-policy': maintenancePolicy,
    'next/dist/client/components/redirect-error': { isRedirectError: () => false },
    '@/lib/auth': { signOut: async () => {} },
    '@/lib/raw-session': { getRequestSession: async () => ({ user: { id: 'actor' } }) },
    '@/lib/admin/test-session-store': { resolveRequestIdentity: async () => { resolutions++; return identity; } },
    '@/lib/admin/test-session': { TestContextError: class extends Error {} },
    '@/lib/mutation-context': { mutationIdentity: { getStore: () => undefined } },
    '@/lib/db': { prisma: { user: { findUnique: async () => ({ id: 'demo', name: 'Demo', suspendedAt: null, deletingAt: null }) } } },
    'next/navigation': { redirect: (url: string) => { throw Error(url); } },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../session.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => dependencies[name] });
  const result = await (exports as typeof import('../session')).requireUserContext();
  assert.equal(result.user.id, 'demo');
  assert.deepEqual(result.identity, identity);
  assert.equal(resolutions, 1);
});

// --- Fail-closed pins for requireAdminActor's preamble (perf batching work) ---

test('a failing maintenance guard denies with MaintenanceError and reads no actor rows', async () => {
  const f = fixture();
  f.hooks.guardMaintenance = async () => { throw new maintenancePolicy.MaintenanceError(); };
  await assert.rejects(f.api.requireAdminActor('admin'), maintenancePolicy.MaintenanceError);
  assert.equal(f.stats.ownerReads + f.stats.userReads + f.stats.proofReads, 0);
});

test('session resolution failure denies with the session error and reads no actor rows', async () => {
  const f = fixture();
  const failure = new Error('session store unavailable');
  f.hooks.getRequestSession = async () => { throw failure; };
  await assert.rejects(f.api.requireAdminActor('admin'), (error: unknown) => error === failure);
  assert.equal(f.stats.ownerReads + f.stats.userReads + f.stats.proofReads, 0);
});

test('a test-context denial happens before any session, guard or row work', async () => {
  const f = fixture();
  const denial = new TestContextError();
  f.hooks.denyTestContext = async () => { throw denial; };
  await assert.rejects(f.api.requireAdminActor('admin'), (error: unknown) => error === denial);
  assert.equal(f.stats.ownerReads + f.stats.userReads + f.stats.proofReads, 0);
});

test('maintenance denial wins over actor-row denial even when both would fail', async () => {
  const f = fixture();
  f.actor.role = 'user';
  f.hooks.guardMaintenance = async () => { throw new maintenancePolicy.MaintenanceError(); };
  await assert.rejects(f.api.requireAdminActor('admin'), maintenancePolicy.MaintenanceError);
});

// --- Concurrency pins: the independent reads are batched (red before the refactor) ---

test('the owner binding and actor row are read together, so both rows are read even when the binding is invalid', async () => {
  const f = fixture();
  f.binding.userId = '';
  await assert.rejects(f.api.requireAdminActor('admin'));
  assert.equal(f.stats.ownerReads, 1);
  assert.equal(f.stats.userReads, 1, 'actor row read is batched with the binding read instead of waiting for it');
});

test('the owner binding read is issued while the actor row read is still pending', async () => {
  const f = fixture();
  let releaseOwner: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseOwner = resolve; });
  f.db.protectedOwner.findUnique = async () => { await gate;
    return f.binding.userId ? { ...f.binding, user: f.rows.get(f.binding.userId) } : null; };
  const pending = f.api.requireAdminActor('admin');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.stats.userReads, 1, 'actor row read issued while the binding read is in flight');
  releaseOwner();
  const actor = await pending;
  assert.equal(actor.id, f.actor.id);
});

// --- Session.ts batching pins ---

function pageSessionHarness(guard: () => Promise<void>, userRead: () => Promise<unknown>) {
  const events: string[] = [];
  const exports: Record<string, unknown> = {};
  const dependencies: Record<string, unknown> = {
    react: { cache: (fn: unknown) => fn },
    './admin/maintenance-access': { guardMaintenance: async () => { events.push('guard'); await guard(); } },
    './admin/maintenance-policy': maintenancePolicy,
    'next/dist/client/components/redirect-error': { isRedirectError: (error: Error) => error.message.startsWith('/') },
    '@/lib/raw-session': { getRequestSession: async () => ({ user: { id: 'ordinary' } }) },
    '@/lib/admin/test-session-store': { resolveRequestIdentity: async () => ({ actorId: 'ordinary', effectiveUserId: 'ordinary', testSessionId: null, contextVersion: 'context' }) },
    '@/lib/admin/test-session': { TestContextError: class extends Error {} },
    '@/lib/mutation-context': { mutationIdentity: { getStore: () => undefined } },
    '@/lib/auth': { auth: async () => ({ user: { id: 'ordinary' } }), signOut: async () => {} },
    '@/lib/db': { prisma: { user: { findUnique: async () => { events.push('user'); return userRead(); } } } },
    'next/navigation': { redirect: (url: string) => { throw new Error(url); } },
  };
  const code = ts.transpileModule(readFileSync(new URL('../session.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; } });
  return { api: exports as { getSessionUser(): Promise<{ id: string } | null> }, events };
}

test('page session load reads the user row while the maintenance guard is still in flight', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const harness = pageSessionHarness(async () => { await gate; },
    async () => ({ id: 'ordinary', suspendedAt: null, deletingAt: null }));
  const pending = harness.api.getSessionUser();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(harness.events.includes('user'), 'user read issued while the guard is in flight');
  release();
  assert.equal((await pending)?.id, 'ordinary');
});

test('a failing maintenance guard denies the page session even when the user row read also fails', async () => {
  const harness = pageSessionHarness(async () => { throw new maintenancePolicy.MaintenanceError(); },
    async () => { throw new Error('row read failed'); });
  await assert.rejects(harness.api.getSessionUser(), /\/maintenance/);
});
