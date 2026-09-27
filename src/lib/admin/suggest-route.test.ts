import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

/** Route-level contract for the live-search narrowing endpoint
 * (`/admin/suggest/[entity]`): super_admin-gated (403), fail-closed on unknown
 * entities (404), never cached, and a plain `{ rows, total }` body — matches
 * span all rows with a truthful total and paging over the matches. */

/** Values crossing the vm realm carry a foreign prototype; normalize before
 * structural comparison. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

type JsonResponse = { status: number; headers: Record<string, string>; body: unknown };

function loadRoute() {
  const code = ts.transpileModule(
    readFileSync(new URL('../../app/admin/suggest/[entity]/route.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    URL,
    URLSearchParams,
    Promise,
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports.GET as (request: { url: string },
    context: { params: Promise<{ entity: string }> }) => Promise<JsonResponse>;
}

let actorError: Error | null = null;
let servedResult: { rows: unknown[]; total: number } = { rows: [], total: 0 };
let called: Array<{ entity: string; q: string; page?: string; pageSize?: string }> = [];

const deps: Record<string, unknown> = {
  // ts.transpileModule applies no esModuleInterop; NextResponse is stubbed to
  // a plain record so the status/headers contract is directly assertable.
  'next/server': { NextResponse: { json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
    ({ status: init?.status ?? 200, headers: init?.headers ?? {}, body }) } },
  'react/jsx-runtime': jsx,
  '@/lib/admin/actor': { requireAdminActor: async () => {
    if (actorError) throw actorError;
    return { id: 'actor-1', role: 'super_admin' };
  } },
  '@/lib/db': { prisma: { tagged: 'prisma' } },
  '@/lib/admin/suggest': { NARROW_ENTITIES: ['plans', 'features', 'users', 'assignable-plans', 'subscriptions'],
    narrowRows: async (tx: unknown, entity: string, q: string, page: number, pageSize: number) => {
    assert.equal(tx, (deps['@/lib/db'] as { prisma: unknown }).prisma,
      'the route queries through the app prisma');
    called.push({ entity, q, page: String(page), pageSize: String(pageSize) });
    return servedResult;
  } },
};

const GET = loadRoute();

const call = (entity: string, qs = 'q=bas') =>
  GET({ url: `http://localhost/admin/suggest/${entity}?${qs}` },
    { params: Promise.resolve({ entity }) });

test('a super_admin gets the happy path: { rows, total } with no-store caching', async () => {
  actorError = null;
  servedResult = { rows: [{ id: 'p-1', title: 'Basic', subtitle: 'STANDARD' }], total: 42 };
  called = [];
  const response = await call('plans', 'q=ba%20sic&page=2&pageSize=20');
  assert.equal(response.status, 200);
  assert.deepEqual(plain(response.body as { rows: unknown[]; total: number }), {
    rows: [{ id: 'p-1', title: 'Basic', subtitle: 'STANDARD' }], total: 42 });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(called,
    [{ entity: 'plans', q: 'ba sic', page: '2', pageSize: '20' }]);
});

test('missing page/pageSize fall back to the first page of the default page size', async () => {
  actorError = null; servedResult = { rows: [], total: 0 }; called = [];
  await call('features', '');
  assert.deepEqual(called, [{ entity: 'features', q: '', page: '1', pageSize: '10' }]);
});

test('a non-super-admin is denied with 403 and no narrowing query runs', async () => {
  actorError = new Error('Administrator access denied.');
  called = [];
  const response = await call('plans');
  assert.equal(response.status, 403);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(called.length, 0);
});

test('an unknown entity fails closed with 404', async () => {
  actorError = null; called = [];
  const response = await call('accounts');
  assert.equal(response.status, 404);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(called.length, 0);
});

test('a missing q is passed through as an empty query (the service returns nothing)', async () => {
  actorError = null; servedResult = { rows: [], total: 0 }; called = [];
  const response = await GET({ url: 'http://localhost/admin/suggest/features' },
    { params: Promise.resolve({ entity: 'features' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(called, [{ entity: 'features', q: '', page: '1', pageSize: '10' }]);
});
