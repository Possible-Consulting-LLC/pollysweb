import assert from 'node:assert/strict';
import test from 'node:test';
import type { Actor, Target } from './policy';
import { AccountInputError, AccountVersionError, accountPatchFromForm, createAccountAdminService, type AccountPatch } from './accounts';

const actor: Actor = { id: 'admin-1', role: 'admin', owner: false, suspended: false,
  credentialVersion: 'credential', reauthenticatedAt: Date.now() };

function fixture(options: { targetRole?: Target['role']; owner?: boolean; deliveryFails?: boolean } = {}) {
  const target: Target = { id: 'keeper-1', role: options.targetRole ?? 'user', owner: options.owner ?? false, demo: false };
  const row = { id: target.id, accountVersion: 3, email: 'old@example.test', emailVerified: new Date(), name: 'Facebook name' as string | null,
    image: 'https://facebook.example/avatar' as string | null,
    timezone: 'UTC', dateFormat: 'MMM d, yyyy', measurement: 'imperial', theme: 'cosmic', feedDefaultDays: 3,
    mistDefaultDays: 1, cleanDefaultDays: 14, passwordHash: 'hash' as string | null, authVersion: 'auth-1', emailChangeVersion: null as string | null,
    adminVersion: null as string | null, suspendedAt: null as Date | null, role: target.role, isDemo: false };
  const audits: Array<{ action: string; changes: Record<string, unknown> }> = [];
  const challenges: Array<{ tokenHash: string; userId: string; email: string }> = [];
  const providers = [{ provider: 'facebook' }, { provider: 'google' }];
  const request = { id: 'request-1', userId: row.id, status: 'pending_review', completedAt: null as Date | null };
  const requests = new Map([[request.id, request]]);
  const deliveryFails = Boolean(options.deliveryFails);
  let cleanupFails = false, cleanupNoop = false, swappedTarget = false, auditFails = false;
  let liveActor = actor;
  const tx = {
    $queryRaw: async () => [],
    user: {
      findUnique: async () => ({ ...row }),
      updateMany: async ({ where, data }: { where: { id: string; accountVersion?: number }; data: Record<string, unknown> }) => {
        if (where.id !== row.id || (where.accountVersion !== undefined && where.accountVersion !== row.accountVersion)) return { count: 0 };
        const increment = (data.accountVersion as { increment?: number } | undefined)?.increment ?? 0;
        Object.assign(row, data, { accountVersion: row.accountVersion + increment }); return { count: 1 };
      },
    },
    pendingEmailVerification: {
      deleteMany: async ({ where }: { where: { tokenHash?: string; userId?: string } }) => { const before = challenges.length;
        for (let i = challenges.length - 1; i >= 0; i--) if (!where.tokenHash || challenges[i].tokenHash === where.tokenHash) challenges.splice(i, 1);
        if (where.userId === row.id) row.accountVersion += before - challenges.length;
        return { count: before - challenges.length }; },
      create: async ({ data }: { data: { tokenHash: string; userId: string; email: string } }) => { challenges.push(data); return data; },
    },
    adminReauth: { deleteMany: async () => ({ count: 0 }) },
    account: {
      findMany: async () => [...providers],
      deleteMany: async ({ where }: { where: { provider: string } }) => { if (cleanupFails) throw new Error('provider cleanup failed');
        if (cleanupNoop) return { count: 0 };
        const before = providers.length; for (let i = providers.length - 1; i >= 0; i--) if (providers[i].provider === where.provider) providers.splice(i, 1);
        // block_deleting_owned_write increments the owning User once per deleted Account.
        row.accountVersion += before - providers.length;
        return { count: before - providers.length }; },
    },
    facebookDeletionRequest: {
      findUnique: async ({ where }: { where: { id: string } }) => requests.get(where.id) ?? null,
      updateMany: async ({ where }: { where: { id: string; userId: string } }) => { const receipt = requests.get(where.id);
        if (!receipt || receipt.userId !== where.userId || receipt.status === 'completed') return { count: 0 };
        receipt.status = 'completed'; receipt.completedAt = new Date(); return { count: 1 }; },
    },
  };
  const service = createAccountAdminService({
    withMutation: async (_targetId, _operation, work) => {
      const before = structuredClone({ row, providers, request, challenges, audits });
      try { return await work(tx as never, liveActor, swappedTarget ? { ...target, id: 'other' } : target); }
      catch (error) {
        Object.assign(row, before.row); Object.assign(request, before.request);
        providers.splice(0, providers.length, ...before.providers);
        challenges.splice(0, challenges.length, ...before.challenges);
        audits.splice(0, audits.length, ...before.audits);
        throw error;
      }
    },
    appendAudit: async (_tx, input) => { if (auditFails) throw Error('audit failed'); audits.push({ action: input.action, changes: input.changes }); },
    prepareEmailChange: async (db, input) => {
      const account = await (db as unknown as typeof tx).user.findUnique();
      if (input.email === account.email.toLowerCase()) return { status: 'same' as const };
      if (input.email === 'taken@example.test') return { status: 'unavailable' as const };
      const challenge = { tokenHash: 'token-hash', userId: input.userId, email: input.email };
      await (db as unknown as typeof tx).pendingEmailVerification.create({ data: challenge });
      return { status: 'prepared' as const, token: 'token', tokenHash: challenge.tokenHash, previousEmail: account.email,
        previousEmailVerified: Boolean(account.emailVerified) };
    },
    deliverEmailChange: async () => { if (deliveryFails) throw new Error('delivery failed'); },
    cleanupEmailChange: async tokenHash => { await tx.pendingEmailVerification.deleteMany({ where: { tokenHash } }); },
    randomId: () => 'rotated', now: () => new Date('2026-09-20T12:00:00Z'), configuredProviders: () => ['facebook', 'google'],
  });
  return { service, row, target, audits, challenges, providers, request, swapTarget: () => { swappedTarget = true; },
    failAudit: () => { auditFails = true; },
    asSuper: () => { liveActor = { ...actor, role: 'super_admin' }; }, failCleanup: () => { cleanupFails = true; }, noopCleanup: () => { cleanupNoop = true; },
    disconnectFacebook: () => { for (let i = providers.length - 1; i >= 0; i--) if (providers[i].provider === 'facebook') providers.splice(i, 1); },
    addRequest: (id: string) => { const next = { id, userId: row.id, status: 'pending_review', completedAt: null as Date | null }; requests.set(id, next); return next; },
    removeFallbacks: () => { row.passwordHash = null; row.emailVerified = null as unknown as Date;
      for (let i = providers.length - 1; i >= 0; i--) if (providers[i].provider !== 'facebook') providers.splice(i, 1); } };
}

test('account patch accepts only profile and preference fields', async () => {
  const f = fixture();
  await f.service.updateAccount(actor, f.target.id, 3, { name: 'Keeper', timezone: 'America/Los_Angeles' }, 'Correct profile');
  assert.equal(f.row.name, 'Keeper'); assert.equal(f.row.timezone, 'America/Los_Angeles'); assert.equal(f.row.accountVersion, 4);
  assert.deepEqual(f.audits[0], { action: 'account.profile.updated', changes: { fieldsChanged: 'name,timezone', version: 4 } });
  for (const key of ['plan', 'emailVerified', 'passwordHash', 'role'] as const) {
    await assert.rejects(f.service.updateAccount(actor, f.target.id, 4, { [key]: 'forged' } as unknown as AccountPatch, 'Attempt forbidden field'), AccountInputError);
  }
});

test('Facebook completion audit includes version increments from invalidated email challenges', async () => {
  const f = fixture();
  f.challenges.push({ tokenHash: 'pending', userId: f.target.id, email: 'requested@example.test' });
  await f.service.completeFacebookDeletion(actor, f.target.id, 3, 'request-1',
    { name: 'independent', image: 'independent', email: 'independent_verified' }, 'Reviewed provenance');
  assert.equal(f.challenges.length, 0); assert.equal(f.row.accountVersion, 6);
  assert.equal(f.audits[0].changes.version, 6);
});

test('Facebook completion accepts its own per-link trigger increments and audits the final version', async () => {
  const review = { name: 'independent' as const, image: 'independent' as const, email: 'independent_verified' as const };
  for (const links of [1, 2]) {
    const f = fixture();
    if (links === 2) f.providers.push({ provider: 'facebook' });
    await f.service.completeFacebookDeletion(actor, f.target.id, 3, 'request-1', review, 'Reviewed provenance');
    assert.deepEqual(f.providers, [{ provider: 'google' }]);
    assert.equal(f.row.accountVersion, links === 1 ? 5 : 6);
    assert.equal(f.audits[0].changes.version, links === 1 ? 5 : 6);
    assert.equal(f.row.authVersion, 'rotated'); assert.equal(f.row.emailChangeVersion, 'rotated');
    assert.equal(f.row.name, 'Facebook name'); assert.equal(f.request.status, 'completed');
    await f.service.completeFacebookDeletion(actor, f.target.id, 3, 'request-1', review, 'Repeat');
    assert.equal(f.audits.length, 1);
  }
});

test('Facebook stale preview is rejected before deletion and audit failure rolls back all cleanup', async () => {
  const review = { name: 'remove' as const, image: 'remove' as const, email: 'independent_verified' as const };
  const stale = fixture();
  await assert.rejects(stale.service.completeFacebookDeletion(actor, stale.target.id, 2, 'request-1', review, 'Stale'), AccountVersionError);
  assert.equal(stale.row.accountVersion, 3); assert.equal(stale.providers.length, 2);
  const failed = fixture(); failed.failAudit();
  await assert.rejects(failed.service.completeFacebookDeletion(actor, failed.target.id, 3, 'request-1', review, 'Reviewed'), /audit failed/);
  assert.equal(failed.row.accountVersion, 3); assert.equal(failed.row.authVersion, 'auth-1');
  assert.equal(failed.row.name, 'Facebook name'); assert.equal(failed.providers.length, 2);
  assert.equal(failed.request.status, 'pending_review'); assert.equal(failed.audits.length, 0);
});

test('full profile form preserves an unset timezone while invalid nonempty zones remain rejected', async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: 'Correct name', timezone: '', dateFormat: 'MMM d, yyyy', measurement: 'imperial',
    theme: 'cosmic', feedDefaultDays: '3', mistDefaultDays: '1', cleanDefaultDays: '14' })) form.set(key, value);
  const patch = accountPatchFromForm(form);
  assert.equal(patch.timezone, '');
  const f = fixture();
  await f.service.updateAccount(actor, f.target.id, 3, patch, 'Correct display name');
  assert.equal(f.row.name, 'Correct name'); assert.equal(f.row.timezone, '');
  await assert.rejects(f.service.updateAccount(actor, f.target.id, 4, { timezone: 'Not/A_Real_Zone' }, 'Invalid timezone'), /Invalid timezone/);
});

test('target swaps, stale versions, admins editing admins, and owner identity edits are denied', async () => {
  const swapped = fixture(); swapped.swapTarget();
  await assert.rejects(swapped.service.updateAccount(actor, swapped.target.id, 3, { name: 'Wrong target' }, 'Edit'), /target/i);
  await assert.rejects(fixture().service.updateAccount(actor, 'keeper-1', 2, { name: 'Stale' }, 'Edit'), AccountVersionError);
  await assert.rejects(fixture({ targetRole: 'admin' }).service.updateAccount(actor, 'keeper-1', 3, { name: 'Denied' }, 'Edit'));
  await assert.rejects(fixture({ targetRole: 'super_admin', owner: true }).service.requestAdminEmailChange(actor, 'keeper-1', 'new@example.test', 'Identity correction'));
});

test('failed admin email delivery keeps old identity and removes its pending challenge', async () => {
  const f = fixture({ deliveryFails: true });
  await assert.rejects(f.service.requestAdminEmailChange(actor, f.target.id, 'new@example.test', 'Keeper requested change'), /delivery failed/);
  assert.equal(f.row.email, 'old@example.test'); assert.ok(f.row.emailVerified); assert.equal(f.challenges.length, 0);
  await assert.rejects(f.service.requestAdminEmailChange(actor, f.target.id, 'taken@example.test', 'Keeper requested change'), AccountInputError);
});

test('suspension and role changes are dedicated versioned commands that revoke credentials', async () => {
  const f = fixture(); await f.service.setSuspended(actor, f.target.id, 3, true, 'Abuse review');
  assert.equal(f.row.suspendedAt?.toISOString(), '2026-09-20T12:00:00.000Z'); assert.equal(f.row.authVersion, 'rotated'); assert.equal(f.row.accountVersion, 4);
  const promoted = fixture(); promoted.asSuper(); await promoted.service.setRole({ ...actor, role: 'super_admin' }, promoted.target.id, 3, 'admin', 'Delegated support');
  assert.equal(promoted.row.role, 'admin'); assert.equal(promoted.row.accountVersion, 4);
});

test('Facebook completion marks completed only after reviewed provider cleanup succeeds', async () => {
  const review = { name: 'independent' as const, image: 'remove' as const, email: 'independent_verified' as const };
  const failed = fixture(); failed.failCleanup();
  await assert.rejects(failed.service.completeFacebookDeletion(actor, failed.target.id, 3, 'request-1', review, 'Reviewed provenance'), /cleanup failed/);
  assert.equal(failed.request.status, 'pending_review'); assert.equal(failed.providers.some(item => item.provider === 'facebook'), true);
  const unchanged = fixture(); unchanged.noopCleanup();
  await assert.rejects(unchanged.service.completeFacebookDeletion(actor, unchanged.target.id, 3, 'request-1', review, 'Reviewed provenance'), /did not complete/);
  assert.equal(unchanged.request.status, 'pending_review');
  const ok = fixture(); await ok.service.completeFacebookDeletion(actor, ok.target.id, 3, 'request-1', review, 'Reviewed provenance');
  assert.equal(ok.providers.some(item => item.provider === 'facebook'), false); assert.equal(ok.request.status, 'completed');
  await ok.service.completeFacebookDeletion(actor, ok.target.id, 3, 'request-1', review, 'Repeated submission');
  assert.equal(ok.request.status, 'completed');
  const noFallback = fixture(); noFallback.removeFallbacks();
  await assert.rejects(noFallback.service.completeFacebookDeletion(actor, noFallback.target.id, 3, 'request-1', review, 'Reviewed provenance'), /different usable sign-in method/);
  assert.equal(noFallback.request.status, 'pending_review');
});

test('Facebook completion cleans residual fields after keeper disconnect and permits a later distinct receipt', async () => {
  const f = fixture(); f.disconnectFacebook();
  const remove = { name: 'remove' as const, image: 'remove' as const, email: 'independent_verified' as const };
  await f.service.completeFacebookDeletion(actor, f.target.id, 3, 'request-1', remove, 'Reviewed residual provider fields');
  assert.equal(f.row.name, null); assert.equal(f.row.image, null); assert.equal(f.request.status, 'completed');
  const later = f.addRequest('request-2');
  const reviewed = { name: 'independent' as const, image: 'independent' as const, email: 'independent_verified' as const };
  await f.service.completeFacebookDeletion(actor, f.target.id, 4, 'request-2', reviewed, 'Reviewed later receipt');
  assert.equal(later.status, 'completed');
});
