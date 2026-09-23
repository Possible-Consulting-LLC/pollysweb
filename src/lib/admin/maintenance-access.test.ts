import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from './maintenance-policy';
import * as credential from '../credential-version';
import { mutationIdentity } from '../mutation-context';
function fixture() {
  const user = { id: 'owner', role: 'super_admin', isDemo: false, emailVerified: new Date(), suspendedAt: null, deletingAt: null, passwordHash: 'hash', authVersion: 'v', adminVersion: null };
  const owner = { ...user };
  const session = { user: { id: 'owner', credentialVersion: credential.credentialFingerprint('hash', 'secret') } };
  const state = { version: 0, deadline: new Date(1), announcementEnabled: false, announcement: '' };
  const stateConnections: unknown[] = [];
  let sessionReads = 0;
  let outage = false;
  let testEnded = false;
  let now = 2;
  const db = {
    $queryRaw: async () => [], user: {
      findUnique: async ({ where }: {
        where: {
          id: string;
        };
      }) => where.id === 'demo' ? { ...user, id: 'demo', role: 'user', isDemo: true } : user
    }, protectedOwner: { findUnique: async () => ({ userId: 'owner', user: owner }) }, adminTestSession: { findUnique: async () => ({ id: 'test', actorId: 'owner', targetId: 'demo', credentialVersion: session.user.credentialVersion, endedAt: testEnded ? new Date() : null, createdAt: new Date(0), expiresAt: new Date(1000) }) }
  };
  const deps: Record<string, unknown> = {
    'server-only': {}, '@/lib/db': { prisma: db }, '@/lib/raw-session': { getRequestSession: async () => { sessionReads++; return session; } }, '../mutation-context': { mutationIdentity }, '../credential-version': credential, './maintenance-policy': policy, './maintenance-state': {
      readMaintenanceState: async (connection: unknown) => {
        stateConnections.push(connection);
        if (outage)
          throw Error('offline');
        return state;
      }
    }
  };
  const exports = {};
  const clock = class extends Date {
    constructor(value?: string | number | Date) { super(value === undefined ? now : value); }
    static now() { return now; }
  };
  runInNewContext(ts.transpileModule(readFileSync(new URL('./maintenance-access.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date: clock, process: { env: { ADMIN_OWNER_ID: 'owner', AUTH_SECRET: 'secret' } }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return { api: exports as typeof import('./maintenance-access'), stateConnections, sessionReads: () => sessionReads, user, state, session, db, outage: () => outage = true, end: () => testEnded = true, time: (t: number) => now = t };
}
const identity = { actorId: 'owner', effectiveUserId: 'demo', testSessionId: 'test', contextVersion: 'a'.repeat(64) };
test('private UI bypass reflects live actor and test-session revocation', async () => {
  const f = fixture();
  assert.equal(await f.api.hasMaintenanceBypass(identity), true);
  f.end();
  assert.equal(await f.api.hasMaintenanceBypass(identity), false);
  const g = fixture();
  g.user.role = 'admin';
  assert.equal(await g.api.hasMaintenanceBypass(identity), false);
});
test('live bypass revalidates actor role and credentials and never changes effective identity', async () => {
  const f = fixture();
  await f.api.guardMaintenance('write', identity);
  assert.equal(identity.effectiveUserId, 'demo');
  f.user.role = 'admin';
  await assert.rejects(f.api.guardMaintenance('write', identity), policy.MaintenanceError);
  f.user.role = 'super_admin';
  f.user.adminVersion = 'revoked' as never;
  await assert.rejects(f.api.guardMaintenance('write', identity), policy.MaintenanceError);
});
test('active test bypass rejects ended and expired contexts; direct demo denied', async () => {
  const f = fixture();
  f.end();
  await assert.rejects(f.api.guardMaintenance('write', identity), policy.MaintenanceError);
  const g = fixture();
  g.time(1000);
  await assert.rejects(g.api.guardMaintenance('write', identity), policy.MaintenanceError);
  const h = fixture();
  h.user.isDemo = true;
  await assert.rejects(h.api.guardMaintenance('read', { ...identity, testSessionId: null }), policy.MaintenanceError);
});
test('missing maintenance or auth database cannot bypass even for owner', async () => {
  const f = fixture();
  f.outage();
  await assert.rejects(f.api.guardMaintenance('read', identity), policy.MaintenanceError);
});
test('only a same-transaction locked self credential change can finish during maintenance', async () => {
  const f = fixture();
  const db = f.db as unknown as Parameters<typeof f.api.prepareCredentialChange>[0];
  await f.api.prepareCredentialChange(db, 'owner');
  f.user.adminVersion = 'self-rotation' as never;
  await f.api.guardMaintenanceAfterWrite(db);
  await assert.rejects(f.api.guardMaintenance('write', null, db), policy.MaintenanceError);
  const stale = fixture();
  stale.user.adminVersion = 'revoked-before-lock' as never;
  await assert.rejects(stale.api.prepareCredentialChange(stale.db as never, 'owner'), policy.MaintenanceError);
});

for (const reason of ['ended', 'expired', 'revoked'] as const) {
  test('fresh read-derived write checks captured Test-as identity when ' + reason, async () => {
    const f = fixture();
    let writes = 0;
    const dependencies: Record<string, unknown> = {
      'server-only': {}, './db': { prisma: f.db }, './mutation-context': { mutationIdentity },
      './admin/maintenance-access': f.api,
      './admin/test-session-store': { auditTestMutation: async () => {}, resolveRequestIdentity: async () => identity },
      './admin/test-session': {},
      './spider-write-policy': { assertSpiderWritableInTransaction: async () => {} },
    };
    function load<T>(path: string): T {
      const exports = {};
      runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
      });
      return exports as T;
    }
    dependencies['./maintenance-write'] = load('../maintenance-write.ts');
    const derived = load<typeof import('../derived-mutation')>('../derived-mutation.ts');
    const captured = await derived.derivedMutationIdentity('demo');
    if (reason === 'ended') f.end();
    if (reason === 'expired') f.time(1000);
    if (reason === 'revoked') f.user.adminVersion = 'revoked' as never;
    assert.equal(mutationIdentity.getStore(), undefined);
    await assert.rejects(derived.recordDerivedChange(f.db as never, captured, async () => { writes++; }), policy.MaintenanceError);
    assert.equal(writes, 0);
    assert.equal(captured.effectiveUserId, 'demo');
  });
}

test('Auth.js login policy reads the supplied transaction without resolving a session', async () => {
  const f = fixture();
  let userReads = 0;
  const tx = { ...f.db, user: { findUnique: async () => { userReads++; return f.user; } } };
  assert.equal(await f.api.allowMaintenanceLogin('owner', tx as never), true);
  assert.equal(f.stateConnections[0], tx);
  assert.equal(userReads, 1);
  assert.equal(f.sessionReads(), 0);
  f.user.role = 'user';
  assert.equal(await f.api.allowMaintenanceLogin('owner', tx as never), false);
});
