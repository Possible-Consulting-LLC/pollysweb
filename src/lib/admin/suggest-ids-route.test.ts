import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

/** Route-level contract for the S13c select-all ids endpoint
 * (`/admin/suggest/[entity]/ids`): super_admin-gated (403), fail-closed on
 * anything but the multi-select surfaces (404 — single-mode pickers are
 * excluded by the owner's rule), never cached, and a lean `{ rows }` body of
 * display triples. Fired on CLICK only — one count-free query per click. */

/** Values crossing the vm realm carry a foreign prototype; normalize before
 * structural comparison. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

type JsonResponse = { status: number; headers: Record<string, string>; body: unknown };

function loadRoute() {
  const code = ts.transpileModule(
    readFileSync(new URL('../../app/admin/suggest/[entity]/ids/route.ts', import.meta.url), 'utf8'),
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
let servedRows: Array<{ id: string; title: string; subtitle: string }> = [];
let called: Array<{ entity: string; q: string }> = [];

const deps: Record<string, unknown> = {
  // ts.transpileModule applies no esModuleInterop; NextResponse is stubbed to
  // a plain record so the status/headers contract is directly assertable.
  'next/server': { NextResponse: { json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
    ({ status: init?.status ?? 200, headers: init?.headers ?? {}, body }) } },
  '@/lib/admin/actor': { requireAdminActor: async () => {
    if (actorError) throw actorError;
    return { id: 'actor-1', role: 'super_admin' };
  } },
  '@/lib/db': { prisma: { tagged: 'prisma' } },
  '@/lib/admin/suggest': { SELECTABLE_ENTITIES: ['features', 'plans'],
    selectableRows: async (tx: unknown, entity: string, q: string) => {
      assert.equal(tx, (deps['@/lib/db'] as { prisma: unknown }).prisma,
        'the route queries through the app prisma');
      called.push({ entity, q });
      return servedRows;
    } },
};

const GET = loadRoute();

const call = (entity: string, qs = 'q=bas') =>
  GET({ url: `http://localhost/admin/suggest/${entity}/ids?${qs}` },
    { params: Promise.resolve({ entity }) });

test('a super_admin gets the happy path: a lean { rows } body with no-store caching', async () => {
  actorError = null;
  servedRows = [{ id: 'care.feed.log', title: 'Log feeding', subtitle: 'care.feed.log' }];
  called = [];
  const response = await call('features', 'q=ca%20re');
  assert.equal(response.status, 200);
  assert.deepEqual(plain(response.body as { rows: unknown[] }),
    { rows: [{ id: 'care.feed.log', title: 'Log feeding', subtitle: 'care.feed.log' }] });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(called, [{ entity: 'features', q: 'ca re' }]);
});

test('a missing q is passed through as an empty query (select all with no filter)', async () => {
  actorError = null; servedRows = []; called = [];
  const response = await GET({ url: 'http://localhost/admin/suggest/plans/ids' },
    { params: Promise.resolve({ entity: 'plans' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(called, [{ entity: 'plans', q: '' }]);
});

test('a non-super-admin is denied with 403 and no ids query runs', async () => {
  actorError = new Error('Administrator access denied.');
  called = [];
  const response = await call('plans');
  assert.equal(response.status, 403);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(called.length, 0);
});

test('single-mode picker entities and unknown names fail closed with 404', async () => {
  actorError = null; called = [];
  for (const entity of ['users', 'assignable-plans', 'subscriptions', 'accounts']) {
    const response = await call(entity);
    assert.equal(response.status, 404, `${entity} must not be selectable`);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
  assert.equal(called.length, 0);
});