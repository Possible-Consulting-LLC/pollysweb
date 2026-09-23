import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as url from 'node:url';
import ts from 'typescript';
import type { PrismaClient } from '@prisma/client';
import { assertStagingEnvironment } from '../staging-guard';
import { captureFixtures, assertFixtureOwnership, assertCheckEnvironment, assertRehearsalApproval, restoreSettings, runFixtureChecks, withRehearsalRestoration, rehearsal, type CheckRepository, type SettingsSnapshot } from '../../../scripts/staging-admin-check';

const now = Date.parse('2026-09-22T12:00:00Z');
const env = { SPOODLY_ENV: 'staging', DATABASE_URL: 'postgresql://postgres:dummy@db.nfdecdylxcmuypxodppe.supabase.co:5432/postgres', DIRECT_URL: 'postgresql://postgres:dummy@db.nfdecdylxcmuypxodppe.supabase.co:5432/postgres', SUPABASE_URL: 'https://nfdecdylxcmuypxodppe.supabase.co', ADMIN_OWNER_ID: 'owner' };
const approval = { purpose: 'staging-admin-maintenance-rehearsal', environment: 'staging', projectRef: 'nfdecdylxcmuypxodppe', approvedBy: 'operator', approvalReference: 'separate-user-approval', startsAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 300000).toISOString() };
test('staging check guards refuse absent staging, wrong project, mail and Stripe before repository work', () => {
  assert.doesNotThrow(() => assertCheckEnvironment(env));
  for (const changes of [{ SPOODLY_ENV: undefined }, { DATABASE_URL: 'postgresql://x:y@localhost/db' }, { ADMIN_OWNER_ID: '' }, { EMAIL_RESEND_API_KEY: 'dummy' }, { STRIPE_SECRET_KEY: 'dummy' }]) assert.throws(() => assertCheckEnvironment({ ...env, ...changes }));
});

test('CLI neutralizes dotenv-loaded mail credentials before guards and Prisma construction while preserving staging configuration', async () => {
  const sourceUrl = new URL('../../../scripts/staging-admin-check.ts', import.meta.url);
  const source = readFileSync(sourceUrl, 'utf8').replaceAll('import.meta.url', JSON.stringify(sourceUrl.href));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  for (const unsafe of [{}, { SPOODLY_ENV: 'production' }, { ADMIN_OWNER_ID: '' }, { STRIPE_SECRET_KEY: 'dummy-stripe' }, { DATABASE_URL: 'postgresql://x:y@localhost/db' }]) {
    const loaded = { ...env, EMAIL_RESEND_API_KEY: 'dummy-staging-mail', RESEND_API_KEY: 'dummy-legacy-mail', EMAIL_FROM_EMAIL: 'sender@example.invalid', EMAIL_ALLOWED_RECIPIENTS: 'allowlisted@example.invalid', ...unsafe };
    const processEnvironment: Record<string, string | undefined> = {};
    let guardCalls = 0; let prismaConstructed = false;
    const dependencies: Record<string, unknown> = {
      'node:assert/strict': assert, 'node:crypto': crypto, 'node:path': path, 'node:url': url,
      'node:fs/promises': { readFile: () => { throw Error('Unexpected file read'); } },
      dotenv: { config: () => { Object.assign(processEnvironment, loaded); return { parsed: loaded }; } },
      '../src/lib/staging-guard': { assertStagingEnvironment: (current: Record<string, string | undefined>) => {
        guardCalls++;
        assert.equal(current.EMAIL_RESEND_API_KEY, '', 'Mail must be neutralized before staging guard');
        assert.equal(current.RESEND_API_KEY, '', 'Legacy mail must be neutralized before staging guard');
        assertStagingEnvironment(current);
      } },
      '../src/lib/effective-entitlement': {},
      '@prisma/client': { PrismaClient: class { constructor() { prismaConstructed = true; throw Error('Stopped before repository construction'); } } },
    };
    const exports: { runMain?: () => Promise<void> } = {};
    runInNewContext(`${code}\nexports.runMain = main;`, {
      exports, process: { env: processEnvironment, argv: [] }, URL,
      console: { log: () => {} },
      require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    });
    const valid = Object.keys(unsafe).length === 0;
    if (valid) await assert.rejects(exports.runMain!(), /Stopped before repository construction/);
    else await assert.rejects(exports.runMain!());
    assert.equal(prismaConstructed, valid, 'Unsafe staging/owner/Stripe configuration must still block construction');
    if (valid) assert.equal(guardCalls, 1);
    assert.deepEqual(processEnvironment, { ...loaded, EMAIL_RESEND_API_KEY: '', RESEND_API_KEY: '' });
    assert.equal(loaded.EMAIL_RESEND_API_KEY, 'dummy-staging-mail', 'Source dotenv values are unchanged');
    assert.equal(loaded.RESEND_API_KEY, 'dummy-legacy-mail');
  }
});
test('captured fixture cleanup rejects uncaptured same-domain IDs, changed identity and owner', () => {
  const fixtures = captureFixtures();
  assert.equal(new Set(fixtures.map(f => f.id)).size, 3);
  for (const f of fixtures) {
    assert.match(f.email, /@example\.invalid$/);
    assert.doesNotThrow(() => assertFixtureOwnership(fixtures, f, 'owner'));
    assert.throws(() => assertFixtureOwnership(fixtures, f, f.id));
    assert.throws(() => assertFixtureOwnership(fixtures, { ...f, email: 'other@example.invalid' }, 'owner'));
  }
  assert.throws(() => assertFixtureOwnership(fixtures, captureFixtures()[0], 'owner'));
});
test('rehearsal requires separate explicit current bounded approval window', () => {
  assert.doesNotThrow(() => assertRehearsalApproval(approval, now));
  for (const bad of [null, { ...approval, environment: 'production' }, { ...approval, approvalReference: '' }, { ...approval, startsAt: new Date(now + 1).toISOString() }, { ...approval, expiresAt: new Date(now).toISOString() }, { ...approval, expiresAt: new Date(now + 3600000).toISOString() }]) assert.throws(() => assertRehearsalApproval(bad, now));
});
test('restoration never overwrites a human version and increments the current version', async () => {
  const original: SettingsSnapshot = { version: 8, deadline: null, announcement: 'Original', announcementEnabled: true };
  let current = { ...original, version: 10, announcement: 'Human edit' };
  const compareAndSet = async (version: number, values: Omit<SettingsSnapshot, 'version'>) => {
    if (current.version !== version) return false;
    current = { ...values, version: version + 1 }; return true;
  };
  assert.equal(await restoreSettings(compareAndSet, original, 9), false);
  assert.equal(current.announcement, 'Human edit');
  assert.equal(await restoreSettings(compareAndSet, original, 10), true);
  assert.equal(current.version, 11);
  assert.equal(current.announcement, 'Original');
});
test('fixture failure cleans every precaptured ID; ordinary run never accesses global settings', async () => {
  const fixtures = captureFixtures();
  const cleaned: string[] = [];
  const repo: CheckRepository = {
    readOwner: async () => 'owner',
    create: async f => { if (f.kind === 'admin') throw Error('create failed'); },
    verify: async () => { throw Error('unreachable'); },
    cleanup: async f => { cleaned.push(f.id); },
  };
  await assert.rejects(runFixtureChecks(repo, fixtures, 'owner'), /create failed/);
  assert.deepEqual(cleaned.sort(), fixtures.map(f => f.id).sort());
});
test('cleanup continues after one refusal and owner mismatch prevents fixture writes', async () => {
  const fixtures = captureFixtures(); let writes = 0; let cleanups = 0;
  const repo: CheckRepository = { readOwner: async () => 'different-owner', create: async () => { writes++; }, verify: async () => {}, cleanup: async () => { cleanups++; throw Error('refused'); } };
  await assert.rejects(runFixtureChecks(repo, fixtures, 'owner'), /owner/i);
  assert.equal(writes, 0); assert.equal(cleanups, 0);
  repo.readOwner = async () => 'owner';
  await assert.rejects(runFixtureChecks(repo, fixtures, 'owner'), /cleanup/i);
  assert.equal(cleanups, 3);
});

test('failed or ambiguous start never restores over a human version; failed checks restore acknowledged start', async () => {
  const original: SettingsSnapshot = { version: 4, deadline: null, announcement: '', announcementEnabled: false };
  let calls = 0;
  for (const outcome of ['refused', 'ambiguous']) {
    calls = 0;
    await assert.rejects(withRehearsalRestoration(original, async () => { calls++; if (outcome === 'ambiguous') throw Error('uncertain commit'); return false; }, async () => { throw Error('must not execute'); }));
    assert.equal(calls, 1, 'A failed start gives no restoration authority');
  }
  const versions: number[] = [];
  await assert.rejects(withRehearsalRestoration(original, async version => { versions.push(version); return true; }, async () => { throw Error('browser check failed'); }), /browser check failed/);
  assert.deepEqual(versions, [4, 5]);
});

function delayedSettingsRepository(delayAt: 'read' | 'transaction' | 'owner' | 'lock', delay: number) {
  let time = now; let writes = 0; let locks = 0;
  const deadlines: (Date | null)[] = [];
  let current: SettingsSnapshot = { version: 4, deadline: null, announcement: 'Original', announcementEnabled: true };
  const pause = async (phase: string) => { if (phase === delayAt) time += delay; };
  const tx = {
    protectedOwner: { findUnique: async () => { await pause('owner'); return { userId: 'owner', user: { role: 'super_admin', isDemo: false, emailVerified: new Date(now), suspendedAt: null, deletingAt: null } }; } },
    $queryRaw: async () => { await pause('lock'); locks++; return [{ id: 1 }]; },
    siteSettings: { updateMany: async ({ where, data }: { where: { version: number }; data: Omit<SettingsSnapshot, 'version'> }) => {
      writes++; if (current.version !== where.version) return { count: 0 };
      deadlines.push(data.deadline); current = { ...data, version: current.version + 1 }; return { count: 1 };
    } },
    adminAudit: { create: async () => ({}) },
  };
  const db = {
    siteSettings: { findUniqueOrThrow: async () => { await pause('read'); return { ...current }; } },
    $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => { await pause('transaction'); return work(tx); },
  } as unknown as PrismaClient;
  return { db, clock: () => time, advance: (ms: number) => { time += ms; }, writes: () => writes, locks: () => locks, deadlines, current: () => current };
}
test('65-second preparatory read, transaction, owner or settings-lock delay refuses start without writes', async () => {
  const marker = { ...approval, expiresAt: new Date(now + 90_000).toISOString() };
  for (const phase of ['read', 'transaction', 'owner', 'lock'] as const) {
    const repo = delayedSettingsRepository(phase, 65_000);
    let exercised = false;
    await assert.rejects(rehearsal(repo.db, marker, 'owner', repo.clock, async () => { exercised = true; }), /ninety seconds/);
    assert.equal(repo.writes(), 0, phase);
    assert.equal(exercised, false, phase);
    assert.equal(repo.locks(), 1, 'Admission is checked only after the settings lock');
  }
});
test('start deadline uses locked fresh admission time and restoration works after approval expiry', async () => {
  const repo = delayedSettingsRepository('lock', 65_000);
  const marker = { ...approval, expiresAt: new Date(now + 155_000).toISOString() };
  await rehearsal(repo.db, marker, 'owner', repo.clock, async () => { repo.advance(100_000); });
  assert.equal(repo.deadlines[0]?.getTime(), now + 125_000);
  assert.equal(repo.deadlines[1], null);
  assert.equal(repo.current().version, 6);
  assert.equal(repo.writes(), 2);
  assert.equal(repo.locks(), 2);
});
