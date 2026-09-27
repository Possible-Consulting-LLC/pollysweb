import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as maintenancePolicy from './maintenance-policy';
import type * as actions from '../../app/admin/plans/actions';
import type * as plans from './plans';

type PlanRow = { id: string; name: string; description: string; planType: string;
  maxSpiders: number | null; active: boolean; public: boolean; sortOrder: number;
  createdAt: Date; updatedAt: Date };
type OptionRow = { id: string; planId: string; interval: string; basePriceCents: number;
  active: boolean; sortOrder: number; createdAt: Date; updatedAt: Date };
type TranslationRow = { id: string; planId: string; featureId: string; enabled: boolean;
  createdAt: Date; updatedAt: Date };
type SubscriptionRow = { id: string; userId: string; planId: string; planBillingOptionId: string;
  status: string; startedAt: Date; renewsAt: Date | null; expiresAt: Date | null;
  createdAt: Date; updatedAt: Date };
type SubSetup = SubscriptionRow[];

function load(relativePath: string, deps: Record<string, unknown>): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(name in deps, name); return deps[name];
  } });
  return exports;
}

/** Results returned from the sandbox live in another realm; JSON copies keep strict comparisons local. */
const jsonOf = (value: unknown) => JSON.parse(JSON.stringify(value));
/** Error instances from the vm sandbox live in another realm; tag check works cross-realm. */
const isFailure = (value: unknown) => Object.prototype.toString.call(value) === '[object Error]';

const PLAN: PlanRow = { id: 'plan-1', name: 'Standard', description: 'Baseline spood plan',
  planType: 'STANDARD', maxSpiders: 3, active: true, public: true, sortOrder: 0,
  createdAt: new Date(0), updatedAt: new Date(0) };
const MONTHLY: OptionRow = { id: 'opt-1', planId: 'plan-1', interval: 'MONTHLY', basePriceCents: 900,
  active: true, sortOrder: 0, createdAt: new Date(0), updatedAt: new Date(0) };

function fixture(role: 'admin' | 'super_admin', options: OptionRow[] = [MONTHLY],
  translations: TranslationRow[] = [], subscriptions: SubSetup = []) {
  type ActorFixture = { id: string; role: 'admin' | 'super_admin'; owner: boolean; suspended: boolean;
    credentialVersion: string; reauthenticatedAt: number };
  const actor: ActorFixture = { id: 'owner-1', role, owner: role === 'super_admin', suspended: false,
    credentialVersion: 'credential', reauthenticatedAt: Date.now() } as ActorFixture;
  const planStore = new Map<string, PlanRow>([[PLAN.id, { ...PLAN }]]);
  const optionStore = new Map<string, OptionRow>(options.map(option => [option.id, { ...option }]));
  const translationStore = new Map<string, TranslationRow>(
    translations.map(translation => [translation.id, { ...translation }]));
  const subscriptionStore = new Map<string, SubscriptionRow>(
    subscriptions.map(row => [row.id, { ...row }] as const));
  const audits: Array<{ action: string; targetId: string | null; reason: string;
    changes: Record<string, unknown> }> = [];
  const revalidated: string[] = [];
  const mutations: string[] = [];
  let nextId = 100;
  /** Mirrors real Prisma: relation fields appear only when the query includes them. */
  const billingOptionsFor = (row: PlanRow) => [...optionStore.values()]
    .filter(option => option.planId === row.id).map(option => ({ ...option }));
  const snapshot = (row: PlanRow, args?: { include?: { billingOptions?: unknown;
    featureTranslations?: unknown } }) => ({
    ...row,
    ...(args?.include?.billingOptions ? { billingOptions: billingOptionsFor(row) } : {}),
    ...(args?.include?.featureTranslations ? { featureTranslations:
      [...translationStore.values()].filter(translation => translation.planId === row.id)
        .map(translation => ({ ...translation })) } : {}),
  });
  const matches = (where: Record<string, unknown>, row: OptionRow) =>
    (where.planId === undefined || where.planId === row.planId) &&
    (where.interval === undefined || where.interval === row.interval) &&
    (where.active === undefined || where.active === row.active);
  const effective = (row: SubscriptionRow) =>
    ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(row.status) &&
    (row.expiresAt === null || row.expiresAt.getTime() > Date.now());
  const subscriptionWhere = (where: Record<string, unknown>, row: SubscriptionRow) =>
    (where.planId === undefined || where.planId === row.planId) && effective(row);
  const planQueries: Array<Record<string, unknown>> = [];
  const tx = {
    plan: {
      findUnique: async (args: { where: { id: string }; include?: Record<string, unknown> }) =>
        planStore.has(args.where.id) ? snapshot(planStore.get(args.where.id)!, args) : null,
      // Mirrors listPlans usage: name contains (case-insensitive), sort, offset paging.
      findMany: async (args?: { where?: { name?: { contains?: string; mode?: string } };
        include?: Record<string, unknown>; skip?: number; take?: number }) => {
        planQueries.push(args as Record<string, unknown>);
        let rows = [...planStore.values()];
        const contains = args?.where?.name?.contains;
        if (contains) {
          const needle = contains.toLowerCase();
          rows = rows.filter(row => (args?.where?.name?.mode === 'insensitive'
            ? row.name.toLowerCase().includes(needle)
            : row.name.includes(contains)));
        }
        rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        const start = args?.skip ?? 0;
        return rows.slice(start, args?.take === undefined ? undefined : start + args.take)
          .map(row => snapshot(row, args));
      },
      count: async (args?: { where?: { name?: { contains?: string } } }) => {
        const contains = args?.where?.name?.contains;
        if (!contains) return planStore.size;
        const needle = contains.toLowerCase();
        return [...planStore.values()].filter(row => row.name.toLowerCase().includes(needle)).length;
      },
      create: async ({ data }: { data: Omit<PlanRow, 'id'> }) => {
        const row: PlanRow = { ...data, id: `plan-${nextId++}` };
        planStore.set(row.id, row); return snapshot(row);
      },
      update: async (args: { where: { id: string }; data: Partial<PlanRow>;
        include?: Record<string, unknown> }) => {
        const row = planStore.get(args.where.id);
        if (!row) throw new Error('Row not found.');
        Object.assign(row, args.data); return snapshot(row, args);
      },
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        const row = planStore.get(id);
        if (!row) throw new Error('Row not found.');
        planStore.delete(id);
        for (const [key, option] of [...optionStore.entries()]) if (option.planId === id) optionStore.delete(key);
        for (const [key, translation] of [...translationStore.entries()])
          if (translation.planId === id) translationStore.delete(key);
        return snapshot(row);
      },
      aggregate: async () => ({ _max: { sortOrder: Math.max(-1,
        ...[...planStore.values()].map(row => row.sortOrder)) } }),
    },
    planBillingOption: {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        [...optionStore.values()].filter(option => matches(where, option)).map(option => ({ ...option })),
      findFirst: async ({ where }: { where: { id: string; planId: string } }) => {
        const row = optionStore.get(where.id);
        return row && row.planId === where.planId ? { ...row } : null;
      },
      create: async ({ data }: { data: Omit<OptionRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const row: OptionRow = { ...data, id: `opt-${nextId++}`, createdAt: new Date(0), updatedAt: new Date(0) };
        optionStore.set(row.id, row); return { ...row };
      },
      update: async ({ where: { id }, data }: { where: { id: string }; data: Partial<OptionRow> }) => {
        const row = optionStore.get(id);
        if (!row) throw new Error('Row not found.');
        Object.assign(row, data); return { ...row };
      },
    },
    featurePlanTranslation: {
      findMany: async ({ where = {} }: { where?: { planId?: string } } = {}) =>
        [...translationStore.values()]
          .filter(translation => where.planId === undefined || translation.planId === where.planId)
          .map(translation => ({ ...translation })),
      create: async ({ data }: { data: Omit<TranslationRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const row: TranslationRow = { ...data, id: `trans-${nextId++}`, createdAt: new Date(0), updatedAt: new Date(0) };
        translationStore.set(row.id, row); return { ...row };
      },
    },
    userSubscription: {
      findMany: async ({ where = {}, select }: { where?: Record<string, unknown>;
        select?: unknown } = {}) =>
        [...subscriptionStore.values()].filter(row => subscriptionWhere(where, row))
          .map(row => (select ? { planId: row.planId } : { ...row })),
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        [...subscriptionStore.values()].filter(row => subscriptionWhere(where, row)).length,
    },
    adminAudit: {
      create: async ({ data }: { data: { action: string; targetId: string | null; reason: string;
        changes: Record<string, unknown> } }) => {
        audits.push({ action: data.action, targetId: data.targetId, reason: data.reason,
          changes: JSON.parse(JSON.stringify(data.changes)) });
        return data;
      },
    },
  };
  const audit = load('./audit.ts', { 'server-only': {} });
  const plansModule = load('./plans.ts', { 'server-only': {}, './audit': audit }) as typeof plans;
  const registry = load('../features/registry.ts', {});
  const pricing = load('../features/pricing.ts', { './registry': registry });
  const planFeatures = load('./plan-features.ts', { 'server-only': {}, './audit': audit,
    './plans': plansModule, '../features/registry': registry, '../features/pricing': pricing });
  const api = load('../../app/admin/plans/actions.ts', {
    'next/cache': { revalidatePath: (path: string) => revalidated.push(path) },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, kind: unknown, action: string, work: () => Promise<unknown>) => {
      mutations.push(`${String(kind)}:${action}`); return work();
    } },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: ActorFixture) => Promise<unknown>) => {
      if (role !== 'super_admin') throw new Error('Administrator access denied.');
      return work(tx, actor);
    } },
    '@/lib/admin/audit': audit,
    '@/lib/admin/plans': plansModule,
    '@/lib/admin/plan-features': planFeatures,
    '@/lib/features/registry': registry,
  }) as typeof actions;
  return { api, plans: plansModule, tx: tx as never, planStore, optionStore, translationStore,
    subscriptionStore, audits, revalidated, mutations, planQueries };
}

test('validatePlanInput accepts a valid plan with null meaning unlimited spoods', () => {
  const f = fixture('super_admin');
  const accepted = f.plans.validatePlanInput({ name: 'Standard', description: 'Baseline spood plan',
    planType: 'STANDARD', maxSpiders: null, active: true, public: true });
  assert.ok(!isFailure(accepted));
  const limited = f.plans.validatePlanInput({ name: 'Standard', description: 'Baseline spood plan',
    planType: 'CUSTOM', maxSpiders: 12, active: false, public: false });
  assert.ok(!isFailure(limited));
});

test('validatePlanInput rejects empty or oversized names, bad plan types, and invalid maxSpiders', () => {
  const f = fixture('super_admin');
  const base = { description: 'Baseline spood plan', planType: 'STANDARD', maxSpiders: null,
    active: true, public: true };
  for (const name of ['', ' '.repeat(4), 'x'.repeat(81), 'Contact @support']) {
    const result = f.plans.validatePlanInput({ ...base, name });
    assert.ok(isFailure(result), JSON.stringify(name));
  }
  for (const planType of ['premium', '', 'STANDARD ']) {
    const result = f.plans.validatePlanInput({ ...base, name: 'Standard', planType });
    assert.ok(isFailure(result), planType);
  }
  for (const maxSpiders of [0, -1, 1.5, Number.NaN]) {
    const result = f.plans.validatePlanInput({ ...base, name: 'Standard', maxSpiders });
    assert.ok(isFailure(result), String(maxSpiders));
  }
});

test('validateBillingOptionInput rejects negative or fractional cents and unknown intervals', () => {
  const f = fixture('super_admin');
  assert.ok(!isFailure(f.plans.validateBillingOptionInput({ interval: 'MONTHLY', basePriceCents: 900, active: true })));
  for (const input of [{ interval: 'WEEKLY', basePriceCents: 900, active: true },
    { interval: 'MONTHLY', basePriceCents: -1, active: true },
    { interval: 'MONTHLY', basePriceCents: 10.5, active: true },
    { interval: 'MONTHLY', basePriceCents: 900, active: 'yes' }]) {
    assert.ok(isFailure(f.plans.validateBillingOptionInput(input as never)), JSON.stringify(input));
  }
});

test('a second active option of an existing interval is rejected; deactivating first is allowed', () => {
  const f = fixture('super_admin');
  const blocked = f.plans.validateBillingOptionInput({ interval: 'MONTHLY', basePriceCents: 1200, active: true },
    { activeIntervals: ['MONTHLY'] });
  assert.ok(isFailure(blocked));
  const reactivated = f.plans.validateBillingOptionInput({ interval: 'MONTHLY', basePriceCents: 1200, active: true },
    { activeIntervals: ['ANNUAL'] });
  assert.ok(!isFailure(reactivated));
  const inactive = f.plans.validateBillingOptionInput({ interval: 'MONTHLY', basePriceCents: 1200, active: false },
    { activeIntervals: ['MONTHLY'] });
  assert.ok(!isFailure(inactive));
});

test('duplicatePlan copies identity, billing options, and feature translations and audits', async () => {
  const translations = [
    { id: 'trans-1', planId: PLAN.id, featureId: 'feature-a', enabled: true, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'trans-2', planId: PLAN.id, featureId: 'feature-b', enabled: false, createdAt: new Date(0), updatedAt: new Date(0) },
  ];
  const f = fixture('super_admin', [MONTHLY], translations);
  const newId = await f.plans.duplicatePlan(f.tx, 'owner-1', PLAN.id, 'Create a variant plan');
  assert.equal(typeof newId, 'string');
  const copy = f.planStore.get(newId as string)!;
  assert.equal(copy.name, 'Standard (copy)');
  assert.equal(copy.active, false);
  assert.equal(copy.public, false);
  assert.equal(copy.planType, 'STANDARD');
  const copiedOptions = [...f.optionStore.values()].filter(option => option.planId === newId);
  assert.equal(copiedOptions.length, 1);
  assert.equal(copiedOptions[0].interval, 'MONTHLY');
  assert.equal(copiedOptions[0].basePriceCents, 900);
  // The duplicate is a starting point: identical featureId + enabled values.
  const copiedTranslations = [...f.translationStore.values()]
    .filter(translation => translation.planId === newId)
    .map(({ featureId, enabled }) => ({ featureId, enabled }))
    .sort((a, b) => a.featureId.localeCompare(b.featureId));
  assert.deepEqual(copiedTranslations, [
    { featureId: 'feature-a', enabled: true },
    { featureId: 'feature-b', enabled: false },
  ]);
  // The source plan's translation rows are untouched.
  assert.equal([...f.translationStore.values()].filter(t => t.planId === PLAN.id).length, 2);
  assert.deepEqual(f.audits, [{ action: 'plan.duplicate', targetId: newId, reason: 'Create a variant plan',
    changes: { planName: 'Standard (copy)' } }]);
});

test('deleteActionFor deletes with no history and only deactivates with history', () => {
  const f = fixture('super_admin');
  assert.equal(f.plans.deleteActionFor(0), 'deleted');
  assert.equal(f.plans.deleteActionFor(1), 'deactivated');
  assert.equal(f.plans.deleteActionFor(42), 'deactivated');
  assert.throws(() => f.plans.deleteActionFor(-1));
  assert.throws(() => f.plans.deleteActionFor(1.5));
});

test('planHistoryCount counts only effective subscriptions on the plan', async () => {
  const f = fixture('super_admin', [MONTHLY], [], [
    { id: 'sub-1', userId: 'user-1', planId: PLAN.id, planBillingOptionId: MONTHLY.id, status: 'ACTIVE',
      startedAt: new Date(0), renewsAt: null, expiresAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-2', userId: 'user-2', planId: PLAN.id, planBillingOptionId: MONTHLY.id, status: 'CANCELED',
      startedAt: new Date(0), renewsAt: null, expiresAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0) },
  ]);
  assert.equal(await f.plans.planHistoryCount(f.tx, PLAN.id), 1);
  assert.equal(await f.plans.planHistoryCount(f.tx, 'plan-other'), 0);
});

test('deletePlan with history deactivates without deleting rows and audits plan.delete', async () => {
  const f = fixture('super_admin');
  const result = await f.plans.deletePlanWithHistory(f.tx, 'owner-1', PLAN.id, 'Retire the plan', 4);
  assert.equal(result, 'deactivated');
  assert.equal(f.planStore.get(PLAN.id)!.active, false);
  assert.deepEqual(f.audits, [{ action: 'plan.delete', targetId: PLAN.id, reason: 'Retire the plan',
    changes: { planName: 'Standard', result: 'deactivated' } }]);
});

test('deletePlan with zero history deletes the plan and its options and audits plan.delete', async () => {
  const f = fixture('super_admin', []);
  const result = await f.plans.deletePlan(f.tx, 'owner-1', PLAN.id, 'Remove the draft plan');
  assert.equal(result, 'deleted');
  assert.equal(f.planStore.size, 0);
  assert.deepEqual(f.audits, [{ action: 'plan.delete', targetId: PLAN.id, reason: 'Remove the draft plan',
    changes: { planName: 'Standard', result: 'deleted' } }]);
});

test('listPlans counts billing options, real enabled translations, and real effective subscriptions', async () => {
  const subscriptions: SubSetup = [
    { id: 'sub-1', userId: 'user-1', planId: PLAN.id, planBillingOptionId: MONTHLY.id, status: 'ACTIVE',
      startedAt: new Date(0), renewsAt: null, expiresAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-2', userId: 'user-2', planId: PLAN.id, planBillingOptionId: MONTHLY.id, status: 'EXPIRED',
      startedAt: new Date(0), renewsAt: null, expiresAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
  ];
  const f = fixture('super_admin', [MONTHLY], [
    { id: 'trans-1', planId: PLAN.id, featureId: 'feature-a', enabled: true, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'trans-2', planId: PLAN.id, featureId: 'feature-b', enabled: true, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'trans-3', planId: PLAN.id, featureId: 'feature-c', enabled: false, createdAt: new Date(0), updatedAt: new Date(0) },
  ], subscriptions);
  const { plans: summaries, total } = jsonOf(
    await f.plans.listPlans(f.tx, { page: 1, pageSize: 20 }));
  assert.equal(total, 1);
  assert.equal(summaries.length, 1);
  const summary = summaries[0];
  assert.equal(summary.name, 'Standard');
  assert.equal(summary.billingOptionCount, 1);
  assert.equal(summary.enabledFeatureCount, 2);
  // Only the effective ACTIVE row counts; the EXPIRED row does not.
  assert.equal(summary.subscriptionCount, 1);
  assert.deepEqual(summary.billingOptions, [{ id: MONTHLY.id, interval: 'MONTHLY', basePriceCents: 900, active: true }]);
});

test('validatePlanInput accepts an empty description and stores it as empty', () => {
  const f = fixture('super_admin');
  const base = { name: 'Draft plan', planType: 'STANDARD', maxSpiders: null, active: false, public: false };
  for (const description of ['', '   ']) {
    const accepted = f.plans.validatePlanInput({ ...base, description });
    assert.ok(!isFailure(accepted), JSON.stringify(description));
    assert.equal((accepted as { description: string }).description, '');
  }
  // Other description rules are unchanged: length cap and the audit text rules.
  for (const description of ['x'.repeat(501), 'Reach me @home']) {
    assert.ok(isFailure(f.plans.validatePlanInput({ ...base, description })), JSON.stringify(description));
  }
});

test('listPlans filters by name contains case-insensitively and totals the filtered set', async () => {
  const f = fixture('super_admin');
  f.planStore.set('plan-2', { ...PLAN, id: 'plan-2', name: 'Deluxe Bundle', sortOrder: 1 });
  f.planStore.set('plan-3', { ...PLAN, id: 'plan-3', name: 'internal audit', planType: 'INTERNAL', sortOrder: 2 });
  const result = jsonOf(await f.plans.listPlans(f.tx, { search: 'DELUX', page: 1, pageSize: 20 }));
  assert.equal(result.total, 1);
  assert.deepEqual(result.plans.map((plan: { name: string }) => plan.name), ['Deluxe Bundle']);
  // The insensitive flag must reach Prisma so database collation matches the test.
  const where = f.planQueries[0].where as { name: { mode?: string } };
  assert.equal(where.name.mode, 'insensitive');
  const empty = jsonOf(await f.plans.listPlans(f.tx, { search: 'no such plan', page: 1, pageSize: 20 }));
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.plans, []);
});

test('listPlans with an empty search returns every plan', async () => {
  const f = fixture('super_admin');
  f.planStore.set('plan-2', { ...PLAN, id: 'plan-2', name: 'Deluxe Bundle', sortOrder: 1 });
  const forUndefined = jsonOf(await f.plans.listPlans(f.tx, { page: 1, pageSize: 20 } as never));
  const forEmpty = jsonOf(await f.plans.listPlans(f.tx, { search: '  ', page: 1, pageSize: 20 }));
  assert.equal(forUndefined.total, 2);
  assert.equal(forEmpty.total, 2);
  assert.deepEqual(forUndefined.plans.map((plan: { id: string }) => plan.id), ['plan-1', 'plan-2']);
  // No name filter reaches Prisma when the search is blank.
  assert.equal((f.planQueries[0].where as Record<string, unknown> | undefined)?.name, undefined);
});

test('listPlans paginates by page and pageSize with offset math', async () => {
  const f = fixture('super_admin');
  for (let index = 2; index <= 25; index++)
    f.planStore.set(`plan-${index}`, { ...PLAN, id: `plan-${index}`, name: `Plan ${index}`, sortOrder: index - 1 });
  const page1 = jsonOf(await f.plans.listPlans(f.tx, { page: 1, pageSize: 20 }));
  assert.equal(page1.total, 25);
  assert.deepEqual(page1.plans.map((plan: { id: string }) => plan.id),
    Array.from({ length: 20 }, (_, index) => `plan-${index + 1}`));
  const page2 = jsonOf(await f.plans.listPlans(f.tx, { page: 2, pageSize: 20 }));
  assert.deepEqual(page2.plans.map((plan: { id: string }) => plan.id),
    ['plan-21', 'plan-22', 'plan-23', 'plan-24', 'plan-25']);
  const beyond = jsonOf(await f.plans.listPlans(f.tx, { page: 9, pageSize: 20 }));
  assert.equal(beyond.total, 25);
  assert.deepEqual(beyond.plans, []);
});

test('duplicate still works against a filtered, paginated listPlans call', async () => {
  const f = fixture('super_admin');
  f.planStore.set('plan-2', { ...PLAN, id: 'plan-2', name: 'Deluxe Bundle', sortOrder: 1 });
  const filtered = jsonOf(await f.plans.listPlans(f.tx, { search: 'delux', page: 1, pageSize: 20 }));
  assert.deepEqual(filtered.plans.map((plan: { id: string }) => plan.id), ['plan-2']);
  const newId = await f.plans.duplicatePlan(f.tx, 'owner-1', 'plan-2', 'Duplicate from the filtered list');
  assert.equal(typeof newId, 'string');
  assert.equal(f.planStore.get(newId as string)!.name, 'Deluxe Bundle (copy)');
});

test('non-super-admin plan mutations are denied without writes, audits, or revalidation', async () => {
  const f = fixture('admin');
  const form = new FormData();
  form.set('name', 'Sneaky'); form.set('description', 'Nope'); form.set('planType', 'STANDARD');
  form.set('maxSpiders', ''); form.set('active', 'true'); form.set('public', 'true');
  assert.ok((await f.api.createPlanAction(form)).error);
  assert.deepEqual(f.mutations.sort(), ['admin:createplan']);
  assert.equal(f.audits.length, 0);
  assert.equal(f.revalidated.length, 0);
  assert.equal(f.planStore.size, 1);
});

test('a super administrator creates a plan through the mutation boundary and audits plan.create', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('name', 'Deluxe'); form.set('description', 'More spoods'); form.set('planType', 'CUSTOM');
  form.set('maxSpiders', '10'); form.set('active', 'true'); form.set('public', 'true');
  assert.deepEqual(jsonOf(await f.api.createPlanAction(form)), { success: true });
  assert.deepEqual(f.mutations, ['admin:createplan']);
  assert.deepEqual(f.revalidated, ['/admin/plans']);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].action, 'plan.create');
  assert.equal(f.audits[0].reason, 'Created plan Deluxe (CUSTOM, public)');
  assert.equal(f.audits[0].changes.planName, 'Deluxe');
  assert.equal([...f.planStore.values()].filter(row => row.name === 'Deluxe').length, 1);
});

test('a public-visibility change audits public and previousPublic without leaking description text', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('planId', PLAN.id); form.set('name', PLAN.name); form.set('description', PLAN.description);
  form.set('planType', 'STANDARD'); form.set('maxSpiders', '3'); form.set('active', 'true');
  form.set('public', 'false');
  assert.deepEqual(jsonOf(await f.api.updatePlanAction(form)), { success: true });
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].action, 'plan.update');
  assert.equal(f.audits[0].reason, 'Updated plan Standard');
  assert.equal(f.audits[0].changes.public, false);
  assert.equal(f.audits[0].changes.previousPublic, true);
  assert.ok(!JSON.stringify(f.audits).includes('Baseline spood plan'));
});

test('a second active billing option for an existing interval fails closed through the action', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('planId', PLAN.id); form.set('interval', 'MONTHLY'); form.set('basePriceCents', '1200');
  form.set('active', 'true');
  assert.ok((await f.api.saveBillingOptionAction(form)).error);
  assert.equal(f.audits.length, 0);
  assert.equal([...f.optionStore.values()].filter(option => option.planId === PLAN.id && option.interval === 'MONTHLY').length, 1);
});

test('duplicate, reorder, delete, and billing-option-toggle actions derive their audit reasons', async () => {
  const f = fixture('super_admin', [MONTHLY, { ...MONTHLY, id: 'opt-2', interval: 'ANNUAL', active: false }]);
  const duplicateForm = new FormData();
  duplicateForm.set('planId', PLAN.id);
  const duplicateId = jsonOf(await f.api.duplicatePlanAction(duplicateForm));
  assert.ok(duplicateId.success, JSON.stringify(duplicateId));
  assert.equal(f.audits.at(-1)!.reason, 'Duplicated plan Standard');
  const toggleForm = new FormData();
  toggleForm.set('planId', PLAN.id); toggleForm.set('optionId', 'opt-2'); toggleForm.set('active', 'true');
  assert.deepEqual(jsonOf(await f.api.setBillingOptionActiveAction(toggleForm)), { success: true });
  assert.equal(f.audits.at(-1)!.reason, 'Updated billing option ANNUAL for plan Standard');
  const optionForm = new FormData();
  optionForm.set('planId', PLAN.id); optionForm.set('interval', 'MONTHLY');
  optionForm.set('basePriceCents', '1200'); optionForm.set('active', 'false');
  assert.deepEqual(jsonOf(await f.api.saveBillingOptionAction(optionForm)), { success: true });
  assert.equal(f.audits.at(-1)!.reason, 'Updated billing option MONTHLY for plan Standard');
  const reorderForm = new FormData();
  reorderForm.set('planId', PLAN.id); reorderForm.set('direction', 'down');
  assert.deepEqual(jsonOf(await f.api.reorderPlanAction(reorderForm)), { success: true });
  assert.equal(f.audits.at(-1)!.reason, 'Reordered plan Standard');
  const deleteForm = new FormData();
  deleteForm.set('planId', PLAN.id);
  assert.deepEqual(jsonOf(await f.api.deletePlanAction(deleteForm)), { success: true });
  assert.equal(f.audits.at(-1)!.reason, 'Deleted plan Standard');
});

test('a delete with subscription history derives the Deactivated plan reason', async () => {
  const f = fixture('super_admin', [MONTHLY], [], [
    { id: 'sub-1', userId: 'user-1', planId: PLAN.id, planBillingOptionId: MONTHLY.id, status: 'ACTIVE',
      startedAt: new Date(0), renewsAt: null, expiresAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
  ]);
  const deleteForm = new FormData();
  deleteForm.set('planId', PLAN.id);
  assert.deepEqual(jsonOf(await f.api.deletePlanAction(deleteForm)), { success: true });
  assert.equal(f.audits.at(-1)!.action, 'plan.delete');
  assert.equal(f.audits.at(-1)!.reason, 'Deactivated plan Standard');
  assert.equal(f.planStore.get(PLAN.id)!.active, false);
  assert.equal(f.planStore.size, 1);
});
