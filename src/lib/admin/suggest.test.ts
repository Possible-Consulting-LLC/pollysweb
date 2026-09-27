import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

/** Live-search suggestion services: ONE lightweight, indexed `contains` query
 * per debounced typing pause, spanning ALL rows — no pagination math, no count
 * aggregation, no joins, for EVERY entity (plans, features, users,
 * assignable-plans) — and capped at SUGGESTION_LIMIT results. */

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
    SUGGESTION_LIMIT: number;
    suggestPlans: (tx: unknown, search: string) => Promise<unknown[]>;
    suggestFeatures: (tx: unknown, search: string) => Promise<unknown[]>;
    suggestionsFor: (tx: unknown, entity: string, search: string) => Promise<unknown[]>;
  };
}

type Captured = Record<string, unknown>;
let planCalls: Captured[] = [];
let featureCalls: Captured[] = [];
let userCalls: Captured[] = [];

const reset = () => {
  planCalls = []; featureCalls = []; userCalls = [];
};

const stubs: Record<string, unknown> = {};

const prisma = {
  plan: {
    findMany: async (args: Captured) => {
      planCalls.push(args);
      return [{ id: 'plan-1', name: 'Basic', planType: 'STANDARD' }];
    },
    count: async () => { throw new Error('suggestions must never run a count aggregation'); },
  },
  feature: {
    findMany: async (args: Captured) => {
      featureCalls.push(args);
      return [{ id: 'feature-1', key: 'care.feed.log', name: 'Log feeding' }];
    },
    count: async () => { throw new Error('suggestions must never run a count aggregation'); },
  },
  user: {
    findMany: async (args: Captured) => {
      userCalls.push(args);
      return [
        { id: 'u-1', name: 'Ada Keeper', email: 'ada@example.com' },
        { id: 'u-2', name: null, email: 'ada2@example.com' },
      ];
    },
    count: async () => { throw new Error('suggestions must never run a count aggregation'); },
  },
};

const suggest = loadSuggest();

test('suggestPlans runs one indexed name-contains query capped at the suggestion limit', async () => {
  reset();
  const suggestions = await suggest.suggestPlans(prisma, 'bas');
  assert.equal(planCalls.length, 1, 'exactly one findMany — no counts, no joins');
  const query = planCalls[0] as { where: unknown; take: number;
    select: Record<string, unknown>; orderBy: unknown };
  assert.deepEqual(plain(query.where), { name: { contains: 'bas', mode: 'insensitive' } });
  assert.equal(query.take, suggest.SUGGESTION_LIMIT);
  // Selecting only suggestion columns keeps the payload light (no joins).
  assert.deepEqual(Object.keys(query.select).sort(), ['id', 'name', 'planType']);
  assert.deepEqual(plain(suggestions), [{ id: 'plan-1', title: 'Basic', subtitle: 'STANDARD' }]);
});

test('suggestFeatures matches name OR key, case-insensitive, capped, ordered by key', async () => {
  reset();
  const suggestions = await suggest.suggestFeatures(prisma, 'feed');
  assert.equal(featureCalls.length, 1);
  const query = featureCalls[0] as { where: unknown; take: number;
    select: Record<string, unknown>; orderBy: unknown };
  assert.deepEqual(plain(query.where), { OR: [
    { name: { contains: 'feed', mode: 'insensitive' } },
    { key: { contains: 'feed', mode: 'insensitive' } },
  ] });
  assert.equal(query.take, suggest.SUGGESTION_LIMIT);
  assert.deepEqual(Object.keys(query.select).sort(), ['id', 'key', 'name']);
  assert.deepEqual(plain(suggestions), [{ id: 'feature-1', title: 'Log feeding', subtitle: 'care.feed.log' }]);
});

test('suggestionsFor users runs one count-free query over non-deleting users (name or email)', async () => {
  reset();
  const suggestions = await suggest.suggestionsFor(prisma, 'users', 'ada');
  assert.equal(userCalls.length, 1);
  const query = userCalls[0] as { where: unknown; take: number;
    select: Record<string, unknown>; orderBy: unknown };
  // Same keeper-validity rule as searchUsers, minus the discarded count.
  assert.deepEqual(plain(query.where), { deletingAt: null, OR: [
    { name: { contains: 'ada', mode: 'insensitive' } },
    { email: { contains: 'ada', mode: 'insensitive' } },
  ] });
  assert.equal(query.take, suggest.SUGGESTION_LIMIT);
  assert.deepEqual(Object.keys(query.select).sort(), ['email', 'id', 'name']);
  assert.deepEqual(plain(query.orderBy), [{ name: 'asc' }, { id: 'asc' }]);
  // Title falls back to the email when the name is missing (searchUsers parity).
  assert.deepEqual(plain(suggestions), [
    { id: 'u-1', title: 'Ada Keeper', subtitle: 'ada@example.com' },
    { id: 'u-2', title: 'ada2@example.com', subtitle: 'ada2@example.com' },
  ]);
});

test('suggestionsFor assignable-plans runs one count-free query over active plans', async () => {
  reset();
  const suggestions = await suggest.suggestionsFor(prisma, 'assignable-plans', 'bas');
  assert.equal(planCalls.length, 1);
  const query = planCalls[0] as { where: unknown; take: number };
  assert.deepEqual(plain(query.where), { active: true,
    name: { contains: 'bas', mode: 'insensitive' } });
  assert.equal(query.take, suggest.SUGGESTION_LIMIT);
  assert.deepEqual(plain(suggestions), [{ id: 'plan-1', title: 'Basic', subtitle: 'STANDARD' }]);
});

test('a blank query suggests nothing and queries nothing', async () => {
  reset();
  for (const entity of ['plans', 'features', 'users', 'assignable-plans'])
    assert.deepEqual(plain(await suggest.suggestionsFor(prisma, entity, '   ')), []);
  assert.equal(planCalls.length + featureCalls.length + userCalls.length, 0);
});

test('an unknown entity is rejected (fail closed)', async () => {
  await assert.rejects(() => suggest.suggestionsFor(prisma, 'accounts', 'x'));
});

test('the suggestion cap matches the ratified 8–10 band', () => {
  assert.equal(suggest.SUGGESTION_LIMIT, 10);
});