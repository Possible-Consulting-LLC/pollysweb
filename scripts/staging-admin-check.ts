/** Authored for a separately approved staging checkpoint. Importing this module
 * does not load environment files, construct Prisma, connect, or run fixtures.
 * This infrastructure check is NOT browser/request authorization acceptance. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import type { PrismaClient, Prisma } from '@prisma/client';
import { assertStagingEnvironment } from '../src/lib/staging-guard';
import { effectivePro } from '../src/lib/effective-entitlement';

export type Fixture = Readonly<{ id: string; email: string; kind: 'ordinary' | 'admin' | 'demo' }>;
export type SettingsSnapshot = { version: number; deadline: Date | null; announcement: string; announcementEnabled: boolean };
export type Approval = { purpose: string; environment: string; projectRef: string; approvedBy: string; approvalReference: string; startsAt: string; expiresAt: string };
export type CheckRepository = {
  readOwner(): Promise<string>;
  create(fixture: Fixture): Promise<void>;
  verify(fixtures: readonly Fixture[]): Promise<void>;
  cleanup(fixture: Fixture): Promise<void>;
};
export function captureFixtures(): readonly Fixture[] {
  const run = randomUUID();
  return Object.freeze((['ordinary', 'admin', 'demo'] as const).map(kind => {
    const id = `admin-check-${run}-${kind}-${randomUUID()}`;
    return Object.freeze({ id, kind, email: `${id}@example.invalid` });
  }));
}
export function assertCheckEnvironment(env: Record<string, string | undefined>) {
  assert.equal(env.SPOODLY_ENV, 'staging', 'SPOODLY_ENV must explicitly be staging');
  assertStagingEnvironment(env);
  assert.ok(env.ADMIN_OWNER_ID, 'Verified ADMIN_OWNER_ID is required');
  // No mail clients are used. Require process-local mail to be disabled; CLI
  // startup neutralizes the loaded app credentials before reaching this guard.
  assert.ok(!env.EMAIL_RESEND_API_KEY?.trim() && !env.RESEND_API_KEY?.trim(), 'Mail must be disabled for this check');
}
export function assertFixtureOwnership(fixtures: readonly Fixture[], row: { id: string; email: string }, ownerId: string) {
  const fixture = fixtures.find(f => f.id === row.id);
  assert.ok(fixture && fixture.email === row.email && row.id !== ownerId, 'Refusing uncaptured or owner fixture');
  assert.match(row.email, /^admin-check-[a-z0-9-]+@example\.invalid$/);
}
export function assertRehearsalApproval(value: unknown, now = Date.now()): asserts value is Approval {
  assert.ok(value && typeof value === 'object', 'Separate approval marker is required');
  const marker = value as Approval;
  assert.equal(marker.purpose, 'staging-admin-maintenance-rehearsal');
  assert.equal(marker.environment, 'staging');
  assert.equal(marker.projectRef, 'nfdecdylxcmuypxodppe');
  assert.ok(typeof marker.approvedBy === 'string' && marker.approvedBy.trim());
  assert.ok(typeof marker.approvalReference === 'string' && marker.approvalReference.trim());
  const start = Date.parse(marker.startsAt); const end = Date.parse(marker.expiresAt);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end && end - start <= 15 * 60_000,
    'Approval window must be current and no longer than fifteen minutes');
}
export async function restoreSettings(
  compareAndSet: (version: number, values: Omit<SettingsSnapshot, 'version'>) => Promise<boolean>,
  original: SettingsSnapshot, testVersion: number,
) {
  const { deadline, announcement, announcementEnabled } = original;
  // Never restore the old version number or overwrite an intervening human edit.
  return compareAndSet(testVersion, { deadline, announcement, announcementEnabled });
}
export async function withRehearsalRestoration(
  original: SettingsSnapshot,
  compareAndSet: (version: number, values: Omit<SettingsSnapshot, 'version'>, starting?: boolean) => Promise<boolean>,
  during: () => Promise<void>,
) {
  // A thrown/ambiguous start has no acknowledged ownership of the next version.
  // In that case report failure for operator inspection, never guess and restore.
  const changed = await compareAndSet(original.version, {
    // Start derives its deadline only after the repository holds the row lock.
    deadline: original.deadline, announcement: original.announcement, announcementEnabled: original.announcementEnabled,
  }, true);
  assert.ok(changed, 'Concurrent settings change');
  try { await during(); }
  finally {
    if (!await restoreSettings(compareAndSet, original, original.version + 1)) {
      throw Error('Maintenance restoration refused: settings changed. Operator must inspect and explicitly reopen if appropriate.');
    }
  }
}
export async function runFixtureChecks(repo: CheckRepository, fixtures: readonly Fixture[], configuredOwner: string) {
  const owner = await repo.readOwner();
  assert.equal(owner, configuredOwner, 'Protected owner binding mismatch');
  for (const fixture of fixtures) assertFixtureOwnership(fixtures, fixture, owner);
  const failures: unknown[] = [];
  try {
    for (const fixture of fixtures) await repo.create(fixture);
    await repo.verify(fixtures);
  } catch (error) { failures.push(error); }
  finally {
    // All IDs were captured before the first write, including ambiguous creates.
    for (const fixture of [...fixtures].reverse()) {
      try { await repo.cleanup(fixture); } catch { failures.push(new Error(`Fixture cleanup requires review: ${fixture.id}`)); }
    }
  }
  if (failures.length) throw new AggregateError(failures, `Fixture check or cleanup failed: ${failures.map(error => error instanceof Error ? error.message : 'failure').join('; ')}`);
}
async function readOwner(db: Pick<Prisma.TransactionClient, 'protectedOwner'>, expected: string) {
  const binding = await db.protectedOwner.findUnique({ where: { id: 1 }, select: { userId: true, user: { select: { role: true, isDemo: true, emailVerified: true, suspendedAt: true, deletingAt: true } } } });
  assert.ok(binding && binding.userId === expected, 'Protected owner binding mismatch');
  assert.ok(binding.user.role === 'super_admin' && !binding.user.isDemo && binding.user.emailVerified && !binding.user.suspendedAt && !binding.user.deletingAt, 'Owner is not eligible');
  return binding.userId;
}
function fixtureRepository(db: PrismaClient, fixtures: readonly Fixture[], ownerId: string): CheckRepository {
  return {
    readOwner: () => readOwner(db, ownerId),
    async create(f) {
      assertFixtureOwnership(fixtures, f, ownerId);
      await db.user.create({ data: { id: f.id, email: f.email, emailVerified: new Date(), name: 'Disposable admin check', role: f.kind === 'admin' ? 'admin' : 'user', isDemo: f.kind === 'demo', demoPlan: f.kind === 'demo' ? 'free' : null, demoLabel: f.kind === 'demo' ? 'Disposable staging check' : null } });
    },
    async verify(captured) {
      for (const f of captured) await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${f.id} FOR UPDATE`;
        const before = await tx.user.findUniqueOrThrow({ where: { id: f.id } });
        assertFixtureOwnership(fixtures, before, await readOwner(tx, ownerId));
        const changed = await tx.user.updateMany({ where: { id: f.id, accountVersion: before.accountVersion }, data: { timezone: 'America/Los_Angeles' } });
        assert.equal(changed.count, 1);
        const after = await tx.user.findUniqueOrThrow({ where: { id: f.id } });
        assert.ok(after.accountVersion > before.accountVersion, 'Trigger must version scoped preference edits');
        assert.equal((await tx.user.updateMany({ where: { id: f.id, accountVersion: before.accountVersion }, data: { name: 'Stale edit' } })).count, 0);
        if (f.kind === 'demo') {
          assert.equal(effectivePro(after), false);
          const pro = await tx.user.update({ where: { id: f.id }, data: { demoPlan: 'pro' } });
          assert.equal(effectivePro(pro), true);
          assert.equal(pro.stripeSubscriptionId, null);
          const ordinary = await tx.user.update({ where: { id: f.id }, data: { isDemo: false, demoPlan: null, demoLabel: null } });
          assert.equal(effectivePro(ordinary), false);
        }
      });
    },
    async cleanup(f) {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${f.id} FOR UPDATE`;
        const owner = await readOwner(tx, ownerId);
        assertFixtureOwnership(fixtures, f, owner);
        const row = await tx.user.findUnique({ where: { id: f.id }, include: { _count: { select: { spiders: true, reminders: true, careDays: true, careCheckins: true, celebratedRewards: true, accounts: true, facebookDeletionRequests: true } }, billingCheckoutIntent: true } });
        if (!row) return;
        assertFixtureOwnership(fixtures, row, owner);
        // This script creates no uploads, subscriptions, sign-ins or care records.
        // Refuse surprising associations; never call Stripe/Storage, fabricate a
        // successful cleanup of external state, or cascade somebody else's data.
        assert.ok(!row.stripeCustomerId && !row.stripeSubscriptionId && !row.stripePriceId && !row.subscriptionStatus && !row.image && !row.billingCheckoutIntent && !row.deletingAt, 'Fixture acquired billing/photo/deletion state; use reviewed recovery');
        assert.ok(Object.values(row._count).every(count => count === 0), 'Fixture acquired owned records; use application deletion');
        const extras = await Promise.all([
          tx.ownedUpload.count({ where: { userId: f.id } }), tx.adminReauth.count({ where: { actorId: f.id } }),
          tx.adminTestSession.count({ where: { OR: [{ actorId: f.id }, { targetId: f.id }] } }),
          tx.pendingEmailVerification.count({ where: { userId: f.id } }), tx.accountDeletionOperation.count({ where: { targetId: f.id } }),
        ]);
        assert.ok(extras.every(count => count === 0), 'Fixture acquired external/recovery state; manual review required');
        // Narrow infrastructure adapter for proven empty fixtures: follows the
        // same deletion receipt/block/checkpoint/transaction-local exact-ID guard.
        const operationId = randomUUID();
        await tx.accountDeletionOperation.create({ data: { id: operationId, targetId: f.id, targetRole: row.role, manifest: [], spiderCount: 0, eventCount: 0, photoCount: 0, subscriptionPresent: false } });
        await tx.user.update({ where: { id: f.id }, data: { deletingAt: new Date(), authVersion: randomUUID(), emailChangeVersion: randomUUID() } });
        await tx.accountDeletionOperation.update({ where: { id: operationId }, data: { stage: 'billing_canceled' } });
        await tx.accountDeletionOperation.update({ where: { id: operationId }, data: { stage: 'photos_removed' } });
        await tx.$queryRaw`SELECT set_config('app.account_deletion_target', ${f.id}, true)`;
        await tx.user.delete({ where: { id: f.id } });
        await tx.accountDeletionOperation.update({ where: { id: operationId }, data: { stage: 'completed', completedAt: new Date() } });
        await tx.adminAudit.create({ data: { actorId: 'staging-admin-check', targetId: f.id, action: 'account.deletion.completed', reason: 'Captured empty staging fixture cleanup', changes: { operationId, status: 'completed' } } });
      });
    },
  };
}

export async function rehearsal(db: PrismaClient, marker: Approval, ownerId: string, clock = Date.now, during = async () => {
  // Human browser checks occur during this explicit bounded window. Automatic
  // time passing is not evidence that reads/writes/bypass worked; record those separately.
  console.log('Approved countdown running; perform separate browser acceptance. Automatic restoration in 70 seconds.');
  await new Promise(resolve => setTimeout(resolve, 35_000));
  console.log('Rehearsal is still bounded by the original server deadline.');
  await new Promise(resolve => setTimeout(resolve, 35_000));
}) {
  assertRehearsalApproval(marker, clock());
  assert.ok(Date.parse(marker.expiresAt) - clock() >= 90_000, 'At least ninety seconds must remain in the approved window');
  const original = await db.siteSettings.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(original.deadline, null, 'Refusing to disturb existing countdown or active maintenance');
  const compareAndSet = async (version: number, values: Omit<SettingsSnapshot, 'version'>, starting = false) => db.$transaction(async tx => {
    await readOwner(tx, ownerId);
    await tx.$queryRaw`SELECT "id" FROM "SiteSettings" WHERE "id" = 1 FOR UPDATE`;
    if (starting) {
      // Transaction admission, owner lookup and settings lock may all wait.
      // Revalidate the entire window here, with no further preparatory awaits.
      const admittedAt = clock();
      assertRehearsalApproval(marker, admittedAt);
      assert.ok(Date.parse(marker.expiresAt) - admittedAt >= 90_000, 'At least ninety seconds must remain in the approved window');
      values = { ...values, deadline: new Date(admittedAt + 60_000) };
    }
    // Restoring our acknowledged version is permitted even after marker expiry.
    const result = await tx.siteSettings.updateMany({ where: { id: 1, version }, data: { ...values, version: { increment: 1 }, updatedAt: new Date(), updatedBy: 'staging-admin-check' } });
    if (result.count) await tx.adminAudit.create({ data: { actorId: 'staging-admin-check', targetId: null, action: 'maintenance.rehearsal', reason: 'Separately approved staging check window', changes: { version: version + 1, maintenanceDeadline: values.deadline?.toISOString() ?? null, announcementEnabled: values.announcementEnabled } } });
    return result.count === 1;
  });
  await withRehearsalRestoration(original, compareAndSet, during);
}

async function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const loaded = dotenv.config({ path: resolve(root, '.env.local'), override: true, quiet: true });
  // Disable delivery only in this CLI process; never alter the app's env file.
  process.env.EMAIL_RESEND_API_KEY = '';
  process.env.RESEND_API_KEY = '';
  assert.ok(!loaded.error, 'Could not read staging .env.local');
  assertCheckEnvironment(process.env);
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => arg === '--maintenance-rehearsal'), 'Unknown argument');
  let marker: Approval | undefined;
  if (args.includes('--maintenance-rehearsal')) {
    assert.ok(process.env.STAGING_ADMIN_MAINTENANCE_APPROVAL_FILE, 'Separate approval marker file is required');
    const value: unknown = JSON.parse(await readFile(process.env.STAGING_ADMIN_MAINTENANCE_APPROVAL_FILE, 'utf8'));
    assertRehearsalApproval(value); marker = value;
  }
  const fixtures = captureFixtures();
  // Persist stdout with the run's evidence before any ambiguous database write.
  console.log('Captured disposable fixtures:', JSON.stringify(fixtures));
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    await runFixtureChecks(fixtureRepository(db, fixtures, process.env.ADMIN_OWNER_ID!), fixtures, process.env.ADMIN_OWNER_ID!);
    if (marker) await rehearsal(db, marker, process.env.ADMIN_OWNER_ID!);
    console.log('Fixture database checks and exact-ID cleanup passed; browser/remote acceptance remains separate.');
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => { console.error('Staging admin check failed. Inspect captured fixture IDs and settings version; do not retry broad cleanup.'); process.exitCode = 1; });
}
