import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as deletionEngine from './admin/account-deletion';
import * as deletionPhotos from './admin/deletion-photos';
import * as maintenancePolicy from './admin/maintenance-policy';

function load(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, Date, console: { error: () => {} }, process: { env: {} }, require: (name: string) => {
    if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

function fixture(failure?: 'create' | 'remove') {
  const token = 'a'.repeat(43);
  const challenge = { id: 'proven', tokenHash: token, purpose: 'register', userId: null as string | null,
    email: 'keeper@example.test', name: 'Keeper', consumedAt: null as Date | null, expiresAt: new Date(Date.now() + 60_000) };
  const unrelated = [
    { ...challenge, id: 'same-email-unproven', tokenHash: 'b'.repeat(43) },
    { ...challenge, id: 'other-register', tokenHash: 'c'.repeat(43), email: 'other@example.test' },
    { ...challenge, id: 'other-legacy', tokenHash: 'd'.repeat(43), purpose: 'legacy', userId: 'other' },
  ];
  const rows = new Map([challenge, ...unrelated].map(row => [row.id, { ...row }]));
  type User = { id: string; email: string; name: string; accountVersion: number; deletingAt: Date | null; stripeCustomerId: null; stripeSubscriptionId: null; billingCheckoutIntent: null };
  let user: User | null = null;
  let operation: Record<string, unknown> | null = null;
  let inTransaction = false;
  const actor = { id: 'admin', role: 'super_admin' as const, owner: false, suspended: false, credentialVersion: 'v', reauthenticatedAt: Date.now() };
  const target = { id: 'registered', role: 'user' as const, owner: false, demo: false };
  const tx = {
    $queryRaw: async () => [],
    pendingEmailVerification: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => [...rows.values()].find(row => row.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({ where, data }: { where: { id: string }; data: { consumedAt: Date } }) => {
        assert.ok(inTransaction);
        const row = rows.get(where.id); if (!row || row.consumedAt) return { count: 0 };
        row.consumedAt = data.consumedAt; return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        assert.ok(inTransaction); assert.ok(user, 'remove proof only after creating user');
        if (failure === 'remove') throw Error('challenge removal failed');
        const row = rows.get(where.id); assert.ok(row); rows.delete(where.id); return row;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        assert.ok(inTransaction);
        for (const [id, row] of rows) if (row.userId === where.userId) rows.delete(id);
      },
    },
    user: {
      findMany: async () => [],
      findFirst: async () => user,
      findUnique: async () => user,
      create: async ({ data }: { data: { email: string; name: string } }) => {
        assert.ok(inTransaction); assert.ok(rows.get('proven')?.consumedAt, 'claim proof before user creation');
        if (failure === 'create') throw Error('user creation failed');
        user = { ...data, id: target.id, accountVersion: 0, deletingAt: null, stripeCustomerId: null, stripeSubscriptionId: null, billingCheckoutIntent: null };
        return user;
      },
      update: async ({ data }: { data: { deletingAt: Date } }) => { assert.ok(user); user.deletingAt = data.deletingAt; },
      delete: async ({ where }: { where: { id: string } }) => { assert.equal(where.id, user?.id); user = null; },
    },
    accountDeletionOperation: {
      findUnique: async () => operation,
      findUniqueOrThrow: async () => { assert.ok(operation); return operation; },
      create: async ({ data }: { data: Record<string, unknown> }) => { operation = data; },
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(operation!, data); },
    },
    adminReauth: { deleteMany: async () => {} },
    adminTestSession: { findMany: async () => [], deleteMany: async () => {} },
    spider: { count: async () => 0, findMany: async () => [] },
    photo: { count: async () => 0, findMany: async () => [] },
    enclosure: { count: async () => 0, findMany: async () => [] },
    ownedUpload: { count: async () => 0, findMany: async () => [], deleteMany: async () => {} },
    ...Object.fromEntries(['feedingEvent', 'mistingEvent', 'moltEvent', 'observationEvent', 'bodyConditionEvent', 'enclosureMaintenanceEvent'].map(name => [name, { count: async () => 0, findMany: async () => [] }])),
  };
  const transaction = async <T>(work: (db: typeof tx) => Promise<T>) => {
    const before = structuredClone({ rows, user, operation }); inTransaction = true;
    try { return await work(tx); }
    catch (error) { rows.clear(); for (const [id, row] of before.rows) rows.set(id, row); user = before.user; operation = before.operation; throw error; }
    finally { inTransaction = false; }
  };
  const registration = load('./email-challenge.ts', {
    './admin/maintenance-access': { guardMaintenance: async () => {} }, './admin/maintenance-policy': maintenancePolicy,
    './maintenance-write': { maintenanceTransaction: transaction }, './db': { prisma: tx },
    './email-verification': { verificationTokenHash: (input: string) => input }, './email-delivery': {}, './credential-version': {}, 'node:crypto': {},
  }) as { completeNewEmailRegistration(token: string, hash: string): Promise<string | null> };
  const deletion = load('./admin/deletion-store.ts', {
    'server-only': {}, 'node:crypto': { randomUUID: () => 'operation' }, '../db': { prisma: tx },
    './actor': { requireAdminActor: async () => actor, withAccountDeletionMutation: async (id: string, _op: unknown, work: (db: typeof tx, a: typeof actor, t: typeof target) => Promise<unknown>) => {
      assert.equal(id, target.id); return transaction(db => work(db, actor, target));
    } },
    './audit': { appendAudit: async () => {} }, './deletion-photos': deletionPhotos,
    './account-deletion': deletionEngine, './deletion-external': { createDeletionBilling: () => async () => {}, createStrictPhotoDeletion: () => async () => {} },
    '../stripe': {}, '../supabase': {}, '../photo-media': {},
  }) as { beginAccountDeletion: ReturnType<typeof deletionEngine.createAccountDeletionService>['beginAccountDeletion']; resumeAccountDeletion: ReturnType<typeof deletionEngine.createAccountDeletionService>['resumeAccountDeletion'] };
  return { token, rows, unrelated, registration, deletion, actor, target, get user() { return user; }, get operation() { return operation; } };
}

test('successful registration removes only its proven challenge before later full-account deletion', async () => {
  const f = fixture();
  assert.equal(await f.registration.completeNewEmailRegistration(f.token, 'hash'), 'keeper@example.test');
  assert.equal(f.rows.has('proven'), false, 'do not retain consumed registration identity metadata');
  assert.equal(await f.registration.completeNewEmailRegistration(f.token, 'hash'), null);
  const op = await f.deletion.beginAccountDeletion(f.actor, { targetId: f.target.id, version: 0, confirmationEmail: 'keeper@example.test', reason: 'Requested deletion' });
  assert.equal(await f.deletion.resumeAccountDeletion(f.actor, op), 'completed');
  assert.equal(f.user, null); assert.equal(f.operation?.stage, 'completed');
  assert.deepEqual([...f.rows.values()], f.unrelated, 'unproven same-email and other-account challenges survive');
});

test('registration creation or proven-challenge removal failure rolls back user and claim together', async () => {
  for (const failure of ['create', 'remove'] as const) {
    const f = fixture(failure);
    assert.equal(await f.registration.completeNewEmailRegistration(f.token, 'hash'), null);
    assert.equal(f.user, null); assert.equal(f.rows.get('proven')?.consumedAt, null);
    assert.equal(f.rows.size, 4);
  }
});

test('separate legacy auth cleanup SQL deletes only consumed unbound register challenges', () => {
  const sql = readFileSync(new URL('../../prisma/migrations/20260922010000_remove_consumed_unbound_registration_challenges/migration.sql', import.meta.url), 'utf8');
  // Deliberately static: no PostgreSQL or database connection is used by this check.
  const executable = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(executable, 'BEGIN; DELETE FROM "PendingEmailVerification" WHERE "purpose" = \'register\' AND "consumedAt" IS NOT NULL AND "userId" IS NULL; COMMIT;');
});
