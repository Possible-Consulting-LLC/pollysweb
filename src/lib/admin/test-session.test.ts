import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestSessionService, assertMutationContext, TestContextError, type TestSessionRow } from './test-session';
import { credentialFingerprint, userCredentialSource } from '../credential-version';
const secret = 'test-secret';
function fixture() {
  const make = (id: string, role = 'user') => ({ id, role, isDemo: false, emailVerified: new Date(), suspendedAt: null as Date | null, deletingAt: null as Date | null, passwordHash: 'hash', authVersion: 'v1', adminVersion: null as string | null, testContextVersion: 'v1', name: id, demoPlan: null as string | null });
  const actor = make('actor', 'super_admin'), target = make('demo'), owner = make('owner', 'super_admin');
  target.isDemo = true;
  target.demoPlan = 'pro';
  const users = new Map([actor, target, owner].map(x => [x.id, x]));
  const rows = new Map<string, TestSessionRow>();
  const audits: string[] = [];
  let now = 1000, token: string | undefined;
  const session = { id: actor.id, credentialVersion: credentialFingerprint(userCredentialSource(actor), secret) };
  const service = createTestSessionService({ secret, ownerId: 'owner', now: () => now, readSession: async () => session, readToken: async () => token,
    readUser: async (id) => users.get(id) ?? null, readOwner: async () => users.get('owner') ?? null,
    readActiveTests: async (actorId: string) => [...rows.values()].filter(row => row.actorId === actorId && !row.endedAt),
    readTest: async (hash) => rows.get(hash) ?? null, insertTest: async (row) => {
      if ([...rows.values()].some(existing => existing.actorId === row.actorId && !existing.endedAt)) throw Error("unique active actor constraint");
      rows.set(row.tokenHash, row);
    },
    endTest: async (id, reason) => {
      const row = [...rows.values()].find(x => x.id === id);
      if (row && !row.endedAt) {
        row.endedAt = new Date(now);
        audits.push(reason);
      }
    },
    rotateContext: async (id) => {
      users.get(id)!.testContextVersion = String(now++);
    },
    writeToken: async (value) => {
      token = value;
    }, audit: async (action) => {
      audits.push(action);
    } });
  return { ...service, actor, target, owner, users, rows, audits, session, token: () => token, setToken: (v: string | undefined) => {
      token = v;
    }, time: (v: number) => {
      now = v;
    } };
}
test('test session preserves real actor and scopes data to demo with opaque hashed token', async () => {
  const f = fixture();
  const original = await f.resolve();
  await f.start('actor', 'demo');
  const i = await f.resolve();
  assert.equal(i?.actorId, 'actor');
  assert.equal(i?.effectiveUserId, 'demo');
  assert.ok(i?.testSessionId);
  assert.notEqual([...f.rows.keys()][0], f.token());
  assert.equal(f.session.id, 'actor');
  assert.throws(() => assertMutationContext(i!, original!.contextVersion));
  assert.doesNotMatch(i!.contextVersion, /actor|demo/);
});
test('stale demo forms after stop and restart never resolve to actor writes', async () => {
  const f = fixture();
  await f.start('actor', 'demo');
  const i = (await f.resolve())!;
  await f.stop();
  const real = (await f.resolve())!;
  assert.throws(() => assertMutationContext(real, i.contextVersion));
  await f.start('actor', 'demo');
  assert.notEqual((await f.resolve())!.contextVersion, i.contextVersion);
});
for (const invalid of ['non-demo', 'privileged', 'suspended', 'deleted', 'unverified', 'actor', 'owner', 'nested'] as const)
  test(`start rejects ${invalid}`, async () => {
    const f = fixture();
    if (invalid === 'non-demo')
      f.target.isDemo = false;
    if (invalid === 'privileged')
      f.target.role = 'admin';
    if (invalid === 'suspended')
      f.target.suspendedAt = new Date();
    if (invalid === 'deleted')
      f.users.delete('demo');
    if (invalid === 'unverified')
      f.target.emailVerified = null!;
    if (invalid === 'actor')
      f.actor.role = 'admin';
    if (invalid === 'owner')
      f.owner.role = 'user';
    if (invalid === 'nested')
      await f.start('actor', 'demo');
    await assert.rejects(f.start('actor', 'demo'));
  });
for (const invalid of ['untag', 'suspend', 'delete', 'actor-role', 'actor-credential', 'owner', 'expiry', 'forgery', 'logout'] as const)
  test(`live ${invalid} fails closed, never falls back`, async () => {
    const f = fixture();
    await f.start('actor', 'demo');
    if (invalid === 'untag')
      f.target.isDemo = false;
    if (invalid === 'suspend')
      f.target.suspendedAt = new Date();
    if (invalid === 'delete')
      f.users.delete('demo');
    if (invalid === 'actor-role')
      f.actor.role = 'admin';
    if (invalid === 'actor-credential')
      f.actor.adminVersion = 'changed';
    if (invalid === 'owner')
      f.owner.role = 'user';
    if (invalid === 'expiry')
      f.time(3601000);
    if (invalid === 'forgery')
      f.setToken('fake');
    if (invalid === 'logout')
      f.session.id = '';
    await assert.rejects(f.resolve());
    if (!['forgery', 'logout'].includes(invalid))
      assert.ok(f.audits.includes(invalid === 'expiry' ? 'expired' : 'revoked'));
  });
test('direct dedicated demo login has no test or admin identity', async () => {
  const f = fixture();
  f.session.id = 'demo';
  const i = (await f.resolve())!;
  assert.equal(i.actorId, 'demo');
  assert.equal(i.effectiveUserId, 'demo');
  assert.equal(i.testSessionId, null);
});
test('request revocation records terminal state and unauthenticated Stop clears cookie', async () => {
  const f = fixture();
  await f.start('actor', 'demo');
  f.actor.adminVersion = 'changed';
  await assert.rejects(f.resolve());
  await f.stop();
  assert.equal(f.token(), undefined);
  assert.ok([...f.rows.values()][0].endedAt);
  assert.ok(f.audits.includes('revoked'));
});

test('authenticated Stop recovers a missing cookie at the unique-active-session boundary', async () => {
  const f = fixture();
  await f.start('actor', 'demo');
  const before = f.actor.testContextVersion;
  const original = [...f.rows.values()][0];
  f.setToken(undefined);
  await f.stop();
  assert.ok(original.endedAt);
  assert.notEqual(f.actor.testContextVersion, before);
  assert.equal(f.audits.filter(event => event === 'ended').length, 1);
  await f.start('actor', 'demo');
  assert.equal([...f.rows.values()].filter(row => !row.endedAt).length, 1);
});
test('Stop selects authenticated actor sessions and never a foreign cookie actor', async () => {
  const f = fixture();
  f.users.set('other', { ...f.actor, id: 'other' });
  await f.start('actor', 'demo');
  const foreignCookie = f.token();
  const foreign = [...f.rows.values()][0];
  const foreignEpoch = f.actor.testContextVersion;
  f.session.id = 'other';
  f.setToken(undefined);
  await f.start('other', 'demo');
  f.setToken(foreignCookie);
  await f.stop();
  assert.equal(foreign.endedAt, null);
  assert.equal(f.actor.testContextVersion, foreignEpoch);
  assert.ok([...f.rows.values()].find(row => row.actorId === 'other')!.endedAt);
  assert.equal(f.token(), undefined);
});
test('unauthenticated Stop clears browser testing state without cookie-authorized termination', async () => {
  const f = fixture();
  await f.start('actor', 'demo');
  const before = f.actor.testContextVersion;
  f.session.id = '';
  await f.stop();
  assert.equal(f.token(), undefined);
  assert.equal([...f.rows.values()][0].endedAt, null);
  assert.equal(f.actor.testContextVersion, before);
});

test('Start with a lost cookie returns a recoverable context error before unique-active insertion', async () => {
  const f = fixture();
  await f.start('actor', 'demo');
  f.setToken(undefined);
  await assert.rejects(f.start('actor', 'demo'), TestContextError);
  assert.equal([...f.rows.values()].filter(row => !row.endedAt).length, 1);
});
