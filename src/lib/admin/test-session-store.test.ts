import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import * as core from './test-session';
import { credentialFingerprint, userCredentialSource } from '../credential-version';

function fixture() {
  const actor = { id: 'actor', role: 'super_admin', isDemo: false, emailVerified: new Date(), suspendedAt: null, deletingAt: null, passwordHash: 'hash', authVersion: 'v1', testContextVersion: 'epoch' };
  const credentialVersion = credentialFingerprint(userCredentialSource(actor), 'secret');
  const rows = [{ id: 'mine', actorId: actor.id, targetId: 'demo', credentialVersion, endedAt: null as Date | null }, { id: 'foreign', actorId: 'other', targetId: 'demo', credentialVersion, endedAt: null as Date | null }];
  const events: string[] = [];
  const audits: unknown[] = [];
  let inTransaction = false;
  let failAudit = false;
  let cleared = false;
  let cookiePresent = false;
  const db = {
    user: {
      findUnique: async () => { assert.ok(inTransaction); events.push('read-actor'); return actor; },
      update: async ({ where, data }: { where: { id: string }; data: { testContextVersion: string } }) => { assert.equal(where.id, actor.id); actor.testContextVersion = data.testContextVersion; events.push('epoch'); },
    },
    adminTestSession: {
      findMany: async ({ where }: { where: { actorId: string; endedAt: null } }) => {
        assert.equal(where.actorId, actor.id); assert.equal(where.endedAt, null); events.push('read-active');
        return rows.filter(row => row.actorId === where.actorId && !row.endedAt);
      },
      findUnique: async ({ where }: { where: { id: string } }) => rows.find(row => row.id === where.id),
      updateMany: async ({ where, data }: { where: { id: string; endedAt: null }; data: { endedAt: Date } }) => {
        assert.ok(inTransaction); assert.equal(where.endedAt, null); const row = rows.find(item => item.id === where.id && !item.endedAt);
        if (!row) return { count: 0 }; row.endedAt = data.endedAt; events.push('terminal'); return { count: 1 };
      },
    },
    $queryRaw: async (_sql: TemplateStringsArray, id: string) => { assert.equal(id, actor.id); assert.ok(inTransaction); events.push('lock'); },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const endings = rows.map(row => row.endedAt); const epoch = actor.testContextVersion; const auditLength = audits.length;
      inTransaction = true;
      try { return await work(db); } catch (error) { rows.forEach((row, i) => { row.endedAt = endings[i]; }); actor.testContextVersion = epoch; audits.length = auditLength; throw error; }
      finally { inTransaction = false; }
    },
  };
  const exports = {};
  const dependencies: Record<string, unknown> = {
    'server-only': {}, 'node:crypto': crypto, '@/lib/db': { prisma: db }, './test-session': core,
    '@/lib/raw-session': { getRequestSession: async () => ({ user: { id: actor.id, credentialVersion } }) },
    'next/headers': { cookies: async () => ({ get: () => cookiePresent ? { value: 'test-token' } : undefined, delete: () => { cleared = true; } }) },
    './audit': { appendAudit: async (tx: unknown, input: unknown) => { assert.equal(tx, db); assert.ok(inTransaction); if (failAudit) throw Error('audit unavailable'); audits.push(input); events.push('audit'); } },
  };
  const code = ts.transpileModule(readFileSync(new URL('./test-session-store.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, process: { env: { AUTH_SECRET: 'secret' } }, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { api: exports as typeof import('./test-session-store'), actor, rows, events, audits, cleared: () => cleared,
    setTestCookie: () => { cookiePresent = true; }, failAudit: () => { failAudit = true; } };
}

test('administrative routes reject an active Test-as cookie with a typed context error', async () => {
  const f = fixture(); f.setTestCookie();
  await assert.rejects(f.api.denyTestContext(), error => error instanceof core.TestContextError);
});

test('missing-cookie Stop locks exact authenticated User before terminating only their active rows', async () => {
  const f = fixture();
  await f.api.stopTestSession();
  assert.ok(f.rows[0].endedAt);
  assert.equal(f.rows[1].endedAt, null);
  assert.ok(f.events.indexOf('lock') < f.events.indexOf('read-active'));
  assert.notEqual(f.actor.testContextVersion, 'epoch');
  assert.equal(f.audits.length, 1);
  assert.equal(f.cleared(), true);
  await f.api.stopTestSession();
  assert.equal(f.audits.length, 1);
});
test('terminal transition and epoch roll back if recovery audit cannot be committed', async () => {
  const f = fixture(); f.failAudit();
  await assert.rejects(f.api.stopTestSession(), /audit unavailable/);
  assert.equal(f.rows[0].endedAt, null);
  assert.equal(f.actor.testContextVersion, 'epoch');
  assert.deepEqual(f.audits, []);
});
