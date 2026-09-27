import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

/** Live-search narrowing services (UX Task 8 fix round 1, ruling 1+3): typing
 * must narrow the RENDERED LIST to matches spanning ALL rows with a TRUTHFUL
 * total and paging over the matches. Each service therefore runs exactly TWO
 * lightweight indexed queries per debounced typing pause — one count (the
 * truthful display total) and one capped page select; no joins beyond the
 * subscription display columns, never per-keystroke waste beyond what the
 * truthful counter requires. */

/** Values crossing the vm realm carry a foreign prototype; normalize before
 * structural comparison. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function loadSuggest() {
  const code = ts.transpileModule(
    readFileSync(new URL('./suggest.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in stubs, `unexpected dependency ${name}`);
      return stubs[name];
    },
  });
  return exports as {
    NARROW_DEFAULT_PAGE_SIZE: number;
    NARROW_MAX_PAGE_SIZE: number;
    narrowRows: (tx: unknown, entity: string, search: string, page: number,
      pageSize: number) => Promise<{ rows: unknown[]; total: number }>;
  };
}

type Captured = Record<string, unknown>;
let planCalls: Captured[] = [];
let featureCalls: Captured[] = [];
let userCalls: Captured[] = [];
let subCalls: Captured[] = [];
let counts: Record<string, number> = {};

const reset = () => {
  planCalls = []; featureCalls = []; userCalls = []; subCalls = [];
  counts = { plan: 42, feature: 34, user: 7, userSubscription: 12 };
};

const stubs: Record<string, unknown> = {};

const prisma = {
  plan: {
    findMany: async (args: Captured) => {
      planCalls.push(args);
      return [{ id: 'plan-1', name: 'Basic', planType: 'STANDARD' }];
    },
    count: async () => counts.plan,
  },
  feature: {
    findMany: async (args: Captured) => {
      featureCalls.push(args);
      return [{ id: 'feature-1', key: 'care.feed.log', name: 'Log feeding' }];
    },
    count: async () => counts.feature,
  },
  user: {
    findMany: async (args: Captured) => {
      userCalls.push(args);
      return [
        { id: 'u-1', name: 'Ada Keeper', email: 'ada@example.com' },
        { id: 'u-2', name: null, email: 'ada2@example.com' },
        { id: 'u-3', name: 'Adaline Gone', email: 'gone@example.com', deletingAt: new Date('2026-01-01') },
      ];
    },
    count: async () => counts.user,
  },
  userSubscription: {
    findMany: async (args: Captured) => {
      subCalls.push(args);
      return [{ id: 'sub-1', user: { name: 'Ada Keeper', email: 'ada@example.com' },
        plan: { name: 'Basic' }, billingOption: { interval: 'MONTHLY' }, status: 'ACTIVE' }];
    },
    count: async () => counts.userSubscription,
  },
};

const suggest = loadSuggest();

test('narrowRows(plans) runs one count + one page query and reports the truthful total', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'plans', 'bas', 2, 20);
  assert.equal(planCalls.length, 1, 'one page select — no joins');
  const query = planCalls[0] as { where: unknown; take: number; skip: number;
    select: Record<string, unknown> };
  assert.deepEqual(plain(query.where), { name: { contains: 'bas', mode: 'insensitive' } });
  assert.equal(query.take, 20, 'page select honors the requested page size');
  assert.equal(query.skip, 20, 'page select offsets by the requested page');
  assert.deepEqual(Object.keys(query.select).sort(), ['id', 'name', 'planType']);
  assert.deepEqual(plain(result), {
    rows: [{ id: 'plan-1', title: 'Basic', subtitle: 'STANDARD' }], total: 42 });
});

test('narrowRows(features) matches name OR key and keys the rows by feature key', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'features', 'feed', 1, 10);
  assert.equal(featureCalls.length, 1);
  const query = featureCalls[0] as { where: unknown; take: number;
    select: Record<string, unknown>; orderBy: unknown };
  assert.deepEqual(plain(query.where), { OR: [
    { name: { contains: 'feed', mode: 'insensitive' } },
    { key: { contains: 'feed', mode: 'insensitive' } },
  ] });
  assert.deepEqual(plain(query.orderBy), { key: 'asc' });
  assert.deepEqual(Object.keys(query.select).sort(), ['id', 'key', 'name']);
  // The features surface selects by feature KEY, so the narrowed row id IS the
  // key — picks carry display data and feed the same selection map.
  assert.deepEqual(plain(result), {
    rows: [{ id: 'care.feed.log', title: 'Log feeding', subtitle: 'care.feed.log' }],
    total: 34 });
});

test('narrowRows(users) includes deleting accounts flagged; the picker greys them', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'users', 'ada', 1, 10);
  assert.equal(userCalls.length, 1);
  const query = userCalls[0] as { where: unknown; take: number;
    select: Record<string, unknown>; orderBy: unknown };
  // No deletingAt filter — deleting accounts stay visible (mockup: greyed,
  // unselectable) in the narrowed view exactly like the committed one.
  assert.deepEqual(plain(query.where), { OR: [
    { name: { contains: 'ada', mode: 'insensitive' } },
    { email: { contains: 'ada', mode: 'insensitive' } },
  ] });
  assert.deepEqual(plain(query.orderBy), [{ name: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(Object.keys(query.select).sort(), ['deletingAt', 'email', 'id', 'name']);
  assert.deepEqual(plain(result), {
    rows: [
      { id: 'u-1', title: 'Ada Keeper', subtitle: 'ada@example.com', disabled: false },
      { id: 'u-2', title: 'ada2@example.com', subtitle: 'ada2@example.com', disabled: false },
      { id: 'u-3', title: 'Adaline Gone', subtitle: 'gone@example.com', disabled: true },
    ], total: 7 });
});

test('narrowRows(assignable-plans) narrows over active plans only', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'assignable-plans', 'bas', 1, 10);
  const query = planCalls[0] as { where: unknown };
  assert.deepEqual(plain(query.where), { active: true,
    name: { contains: 'bas', mode: 'insensitive' } });
  assert.deepEqual(plain(result), {
    rows: [{ id: 'plan-1', title: 'Basic', subtitle: 'STANDARD' }], total: 42 });
});

test('narrowRows(subscriptions) narrows effective rows over keeper, plan, and status', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'subscriptions', 'ada', 1, 20);
  assert.equal(subCalls.length, 1);
  const query = subCalls[0] as { where: unknown; select: Record<string, unknown> };
  assert.ok(query.where, 'the query narrows over the subscription join');
  assert.deepEqual(Object.keys(query.select).sort(),
    ['billingOption', 'id', 'plan', 'status', 'user']);
  assert.deepEqual(plain(result), {
    rows: [{ id: 'sub-1', title: 'Ada Keeper', subtitle: 'Basic · MONTHLY' }], total: 12 });
});

test('a blank query narrows to nothing and queries nothing (committed view stays)', async () => {
  reset();
  for (const entity of ['plans', 'features', 'users', 'assignable-plans', 'subscriptions'])
    assert.deepEqual(plain(await suggest.narrowRows(prisma, entity, '   ', 1, 10)),
      { rows: [], total: 0 });
  assert.equal(planCalls.length + featureCalls.length + userCalls.length + subCalls.length, 0);
});

test('page and pageSize are clamped to sane bounds', async () => {
  reset();
  await suggest.narrowRows(prisma, 'plans', 'bas', -3, 0);
  assert.equal((planCalls[0] as { skip: number; take: number }).skip, 0);
  assert.equal((planCalls[0] as { skip: number; take: number }).take,
    suggest.NARROW_DEFAULT_PAGE_SIZE);
  await suggest.narrowRows(prisma, 'plans', 'bas', 2, 10_000);
  assert.equal((planCalls[1] as { take: number }).take, suggest.NARROW_MAX_PAGE_SIZE);
});

test('an unknown entity is rejected (fail closed)', async () => {
  await assert.rejects(() => suggest.narrowRows(prisma, 'accounts', 'x', 1, 10));
});
