import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import * as policy from './reauth';
import * as credentials from '../credential-version';
import type * as store from './reauth-store';
function fixture() {
  const secret = 'test-secret'; const token = 'a'.repeat(64); const now = Date.now();
  const user = { id: 'actor', role: 'admin', isDemo: false, emailVerified: new Date(), suspendedAt: null, deletingAt: null, passwordHash: 'hash', authVersion: 'v1', adminVersion: null as string | null };
  const cookieValues = new Map([['__Host-admin-reauth-pending', token]]);
  const version = credentials.credentialFingerprint(credentials.userCredentialSource(user), secret);
  const challenge = { tokenHash: crypto.createHash('sha256').update(token).digest('hex'), actorId: user.id,
    credentialVersion: version, provider: 'google', providerAccountId: 'linked', verifiedAt: null as Date | null,
    createdAt: new Date(now - 100), expiresAt: new Date(now + 299900) };
  let linkedUserId = user.id; let onLock = () => {}; const auditActions: string[] = []; let auditCount = 0; let revoked = false; let cookieMaxAge: number | undefined;
  const db = { user: { findUnique: async () => user },
    account: { findUnique: async ({ where }: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } } }) => {
      return where.provider_providerAccountId.provider === 'google' && where.provider_providerAccountId.providerAccountId === 'linked' ? { userId: linkedUserId, user } : null;
    } },
    adminReauth: { findUnique: async ({ where }: { where: { tokenHash: string } }) => where.tokenHash === challenge.tokenHash && !revoked ? challenge : null,
      deleteMany: async ({ where }: { where: { verifiedAt?: null } }) => { if (where.verifiedAt === null && challenge.verifiedAt !== null) return { count: 0 }; revoked = true; return { count: 1 }; },
      updateMany: async () => { if (challenge.verifiedAt) return { count: 0 }; challenge.verifiedAt = new Date(); return { count: 1 }; } },
    $queryRaw: async () => { onLock(); }, $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db) };
  const dependencies: Record<string, unknown> = { 'server-only': {}, 'node:crypto': crypto,
    'next/headers': { cookies: async () => ({ get: (name: string) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined, set: (name: string, value: string, options: { maxAge: number }) => { cookieMaxAge = options.maxAge; if (options.maxAge === 0) cookieValues.delete(name); else cookieValues.set(name, value); } }) }, '@/lib/db': { prisma: db },
    '../credential-version': credentials, './reauth': policy, './audit': { appendAudit: async (_tx: unknown, input: { action: string }) => { auditCount++; auditActions.push(input.action); } } };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('./reauth-store.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, URL, process: { env: { AUTH_SECRET: secret, AUTH_URL: 'https://example.test' } },
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const request = new Request('https://example.test/api/auth/callback/google', { headers: { cookie: `__Host-admin-reauth-pending=${token}` } });
  return { api: exports as typeof store, db, request, token, cookieValues, challenge, user, version, account: { provider: 'google', providerAccountId: 'linked' },
    changeLink: () => { linkedUserId = 'other'; }, onLock: (fn: () => void) => { onLock = fn; }, auditActions, audits: () => auditCount, cookieMaxAge: () => cookieMaxAge };
}
test('OAuth proof rejects unlinked identity and another actor before linking, completes once only', async () => {
  const f = fixture();
  assert.equal(await f.api.authorizeAdminSocialReauth(f.request, { provider: 'google', providerAccountId: 'new-link' }), false);
  assert.equal(await f.api.authorizeAdminSocialReauth(f.request, f.account), true);
  assert.equal(await f.api.completeAdminSocialReauth(f.request, f.account, 'other', f.version), false);
  assert.equal(await f.api.completeAdminSocialReauth(f.request, f.account, 'actor', f.version), true);
  assert.equal(f.auditActions.filter(action => action === 'reauth.success').length, 1);
  assert.equal(await f.api.completeAdminSocialReauth(f.request, f.account, 'actor', f.version), false);
  assert.equal(await f.api.authorizeAdminSocialReauth(f.request, f.account), false);
});
test('OAuth completion rechecks credential changes under lock and existing link ownership', async () => {
  const f = fixture(); f.onLock(() => { f.user.adminVersion = 'rotated'; });
  assert.equal(await f.api.completeAdminSocialReauth(f.request, f.account, 'actor', f.version), false);
  assert.equal(f.auditActions.includes('reauth.success'), false);
  const g = fixture(); g.changeLink();
  assert.equal(await g.api.authorizeAdminSocialReauth(g.request, g.account), false);
  assert.equal(await g.api.completeAdminSocialReauth(g.request, g.account, 'actor', g.version), false);
});
test('OAuth invalid/future/expired challenges fail closed while ordinary OAuth needs no proof', async () => {
  for (const time of ['future', 'expired'] as const) {
    const f = fixture();
    if (time === 'future') f.challenge.createdAt = new Date(Date.now() + 10000);
    else f.challenge.expiresAt = new Date(Date.now() - 1);
    assert.equal(await f.api.authorizeAdminSocialReauth(f.request, f.account), false);
  }
  const f = fixture();
  assert.equal(await f.api.authorizeAdminSocialReauth(new Request('https://example.test'), f.account), true);
  for (const token of ['forged', '']) assert.equal(await f.api.authorizeAdminSocialReauth(new Request('https://example.test', { headers: { cookie: '__Host-admin-reauth-pending=' + token } }), f.account), false);
});

test('logout revokes the stored proof and clears its cookie before a new normal social sign-in', async () => {
  const f = fixture();
  await f.api.revokeAdminProof();
  assert.equal(f.cookieMaxAge(), 0);
  assert.equal(await f.api.authorizeAdminSocialReauth(f.request, f.account), false);
  assert.equal(await f.api.authorizeAdminSocialReauth(new Request('https://example.test'), f.account), true);
});

test('rejected known OAuth attempts record a separate safe failure result', async () => {
  const f = fixture();
  assert.equal(await f.api.authorizeAdminSocialReauth(f.request, { provider: 'google', providerAccountId: 'different' }), false);
  assert.deepEqual(f.auditActions, ['reauth.failure']);
});

test('verified password or social admin proof does not intercept ordinary Settings OAuth callbacks', async () => {
  for (const method of ['password', 'social']) {
    const f = fixture(); f.challenge.verifiedAt = new Date();
    if (method === 'password') { f.challenge.provider = null as unknown as string; f.challenge.providerAccountId = null as unknown as string; }
    const request = new Request('https://example.test/api/auth/callback/google', { headers: { cookie: '__Host-admin-reauth=' + f.token } });
    assert.equal(await f.api.authorizeAdminSocialReauth(request, { provider: 'google', providerAccountId: 'new-settings-link' }), true);
    assert.equal(await f.api.completeAdminSocialReauth(request, f.account, 'actor', f.version), true);
    assert.equal(f.audits(), 0);
  }
});
test('successful social confirmation promotes proof, removes pending cookie and preserves replay rejection', async () => {
  const f = fixture();
  assert.equal(await f.api.completeAdminSocialReauth(f.request, f.account, 'actor', f.version), true);
  assert.equal(f.cookieValues.get('__Host-admin-reauth'), f.token);
  assert.equal(f.cookieValues.has('__Host-admin-reauth-pending'), false);
  assert.equal(await f.api.readAdminProof(f.db as never, { id: 'actor', credentialVersion: f.version } as never), f.challenge.verifiedAt!.getTime());
  assert.equal(await f.api.authorizeAdminSocialReauth(f.request, f.account), false);
});
test('starting ordinary Settings OAuth discards canceled pending challenge without revoking completed proof', async () => {
  const f = fixture();
  await f.api.clearAdminSocialChallenge();
  assert.equal(f.cookieValues.has('__Host-admin-reauth-pending'), false);
  assert.equal(await f.api.authorizeAdminSocialReauth(f.request, f.account), false);
  assert.equal(await f.api.authorizeAdminSocialReauth(new Request('https://example.test'), f.account), true);
});
