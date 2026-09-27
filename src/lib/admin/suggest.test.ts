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
 * truthful counter requires.
 *
 * S13 — narrowed rows are full citizens: the features/plans services return
 * the COMMITTED pages' own row shapes (detail-rich, one grouped query per
 * debounced pause, page-clamped — the committed page's own query cost), so the
 * accordions render narrowed rows through the same renderer as committed rows
 * and can expand/edit them in place. users/assignable-plans stay lean for the
 * pickers (id/title/subtitle/disabled only). */

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
let listPlansCalls: Captured[] = [];
let translationCalls: Captured[] = [];
let counts: Record<string, number> = {};

/** A committed PlanSummary fixture (plans.ts's own row shape). */
let planSummaryFixture: Record<string, unknown> = {};
/** Feature page rows the feature findMany stub serves. */
let featureFixtures: Array<Record<string, unknown>> = [];

const reset = () => {
  planCalls = []; featureCalls = []; userCalls = []; subCalls = [];
  listPlansCalls = []; translationCalls = [];
  counts = { plan: 42, feature: 34, user: 7, userSubscription: 12 };
  planSummaryFixture = {
    id: 'plan-1', name: 'Basic', description: 'Essential care for one spood',
    planType: 'STANDARD', maxSpiders: 1, active: true, public: true, sortOrder: 3,
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    billingOptionCount: 2, enabledFeatureCount: 8, subscriptionCount: 36,
    billingOptions: [
      { id: 'opt-1', interval: 'MONTHLY', basePriceCents: 199, active: true },
      { id: 'opt-2', interval: 'ANNUAL', basePriceCents: 1999, active: true },
    ],
  };
  featureFixtures = [{ id: 'feature-1', key: 'care.feed.log', name: 'Log feeding',
    description: 'Feeding records for a spood', category: 'care', active: true }];
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
      return featureFixtures.map(row => ({ ...row }));
    },
    count: async () => counts.feature,
  },
  featurePlanTranslation: {
    findMany: async (args: Captured) => {
      translationCalls.push(args);
      return [{ featureId: 'feature-1', enabled: true, plan: { name: 'Basic' } }];
    },
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

stubs['@/lib/admin/plans'] = {
  // narrowPlans REUSES the committed page's own query (S13): the narrowed rows
  // are exactly the PlanSummary rows /admin/plans renders.
  listPlans: async (tx: unknown, query: Record<string, unknown>) => {
    assert.equal(tx, prisma, 'the narrowing query runs through the passed tx');
    listPlansCalls.push(query);
    return { plans: [planSummaryFixture], total: counts.plan };
  },
};
stubs['@/lib/features/registry'] = {
  // The registry is code-owned; the stub mirrors a registry where every key is
  // registered except legacy ones.
  isRegisteredFeatureKey: (key: string) => !key.startsWith('legacy.'),
};

const suggest = loadSuggest();

test('narrowRows(plans) serves the committed PlanSummary row shape via the page\'s own query', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'plans', 'bas', 2, 20);
  // One grouped call per debounced pause: narrowPlans IS the committed page's
  // query (listPlans) — never a per-keystroke beyond what /admin/plans costs.
  assert.deepEqual(plain(listPlansCalls), [{ search: 'bas', page: 2, pageSize: 20 }]);
  assert.equal(planCalls.length + subCalls.length, 0,
    'no duplicate raw queries beside the reused committed query');
  assert.equal(result.total, 42);
  assert.deepEqual(plain(result.rows), [{
    id: 'plan-1', title: 'Basic', subtitle: 'STANDARD',
    name: 'Basic', description: 'Essential care for one spood', planType: 'STANDARD',
    maxSpiders: 1, active: true, public: true, sortOrder: 3,
    updatedAt: '2026-09-01T00:00:00.000Z',
    billingOptionCount: 2, enabledFeatureCount: 8, subscriptionCount: 36,
    billingOptions: [
      { id: 'opt-1', interval: 'MONTHLY', basePriceCents: 199, active: true },
      { id: 'opt-2', interval: 'ANNUAL', basePriceCents: 1999, active: true },
    ],
  }], 'the narrowed plan row carries the committed row shape (billingOptions + counts)');
});

test('narrowRows(features) returns the committed FeatureRowView shape via one grouped pass', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'features', 'feed', 1, 10);
  assert.equal(featureCalls.length, 1);
  const query = featureCalls[0] as { where: unknown; take: number; skip: number;
    select: Record<string, unknown>; orderBy: unknown };
  assert.deepEqual(plain(query.where), { OR: [
    { name: { contains: 'feed', mode: 'insensitive' } },
    { key: { contains: 'feed', mode: 'insensitive' } },
  ] });
  assert.deepEqual(plain(query.orderBy), { key: 'asc' });
  assert.deepEqual(Object.keys(query.select).sort(),
    ['active', 'category', 'description', 'id', 'key', 'name']);
  // One grouped assignments query for the page's features + one plan count —
  // the features page's own pattern, never per-row.
  assert.equal(translationCalls.length, 1);
  assert.deepEqual(plain(translationCalls[0]), {
    where: { featureId: { in: ['feature-1'] }, enabled: true },
    select: { featureId: true, plan: { select: { name: true } } },
  });
  assert.equal(planCalls.length, 0);
  assert.equal(featureCalls.length, 1, 'no second feature pass');
  // The features surface selects by feature KEY, so the narrowed row id IS the
  // key — picks carry display data and feed the same selection map.
  assert.deepEqual(plain(result.rows), [{
    id: 'care.feed.log', title: 'Log feeding', subtitle: 'care.feed.log',
    featureId: 'feature-1', key: 'care.feed.log', name: 'Log feeding',
    description: 'Feeding records for a spood', category: 'care', active: true,
    orphan: false, assignedPlans: ['Basic'], totalPlans: 42,
  }], 'orphan/assignedPlans/totalPlans ride the narrowed row (committed row shape)');
  assert.equal(result.total, 34);
});

test('narrowRows(features) derives orphan from the code registry at query time', async () => {
  reset();
  featureFixtures = [{ id: 'feature-9', key: 'legacy.bulk_import', name: 'Old import',
    description: 'Legacy path', category: 'legacy', active: true }];
  const result = await suggest.narrowRows(prisma, 'features', 'imp', 1, 10);
  assert.equal((result.rows[0] as { orphan: boolean }).orphan, true,
    'a key absent from the registry arrives flagged, like the committed page derives it');
  assert.equal(translationCalls.length, 1, 'orphans still resolve their assignments');
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

test('narrowRows(assignable-plans) narrows over active plans only, lean for the picker', async () => {
  reset();
  const result = await suggest.narrowRows(prisma, 'assignable-plans', 'bas', 1, 10);
  const query = planCalls[0] as { where: unknown; select: Record<string, unknown> };
  assert.deepEqual(plain(query.where), { active: true,
    name: { contains: 'bas', mode: 'insensitive' } });
  // Picker entities stay lean (S13): id/title/subtitle/disabled only.
  assert.deepEqual(Object.keys(query.select).sort(), ['id', 'name', 'planType']);
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
  assert.equal(planCalls.length + featureCalls.length + userCalls.length + subCalls.length +
    listPlansCalls.length + translationCalls.length, 0);
});

test('page and pageSize are clamped to sane bounds', async () => {
  reset();
  await suggest.narrowRows(prisma, 'plans', 'bas', -3, 0);
  assert.deepEqual(plain(listPlansCalls[0]),
    { search: 'bas', page: 1, pageSize: suggest.NARROW_DEFAULT_PAGE_SIZE });
  await suggest.narrowRows(prisma, 'plans', 'bas', 2, 10_000);
  assert.equal((listPlansCalls[1] as { pageSize: number }).pageSize,
    suggest.NARROW_MAX_PAGE_SIZE);
});

test('an unknown entity is rejected (fail closed)', async () => {
  await assert.rejects(() => suggest.narrowRows(prisma, 'accounts', 'x', 1, 10));
});
