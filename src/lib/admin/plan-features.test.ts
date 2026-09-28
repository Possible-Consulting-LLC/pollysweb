import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as maintenancePolicy from './maintenance-policy';
import { FEATURE_REGISTRY } from '../features/registry';
import type * as actions from '../../app/admin/plans/actions';
import type * as planFeatures from './plan-features';

type PlanRow = { id: string; name: string; description: string; planType: string;
  maxSpiders: number | null; active: boolean; public: boolean; sortOrder: number;
  createdAt: Date; updatedAt: Date };
type FeatureRow = { id: string; key: string; name: string; description: string;
  category: string; active: boolean };
type TranslationRow = { id: string; planId: string; featureId: string; enabled: boolean;
  createdAt: Date; updatedAt: Date };
type OptionRow = { id: string; planId: string; interval: string; basePriceCents: number;
  active: boolean; sortOrder: number; createdAt: Date; updatedAt: Date };
type Actor = { id: string; role: 'admin' | 'super_admin'; owner: boolean; suspended: boolean;
  credentialVersion: string; reauthenticatedAt: number };

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

type MatrixSetup = { subscribers?: number; translations?: Array<{ key: string; enabled: boolean }>;
  orphanFeatures?: string[]; missingKeys?: string[] };

function fixture(role: Actor['role'], setup: MatrixSetup = {}) {
  const { subscribers = 0, translations = [], orphanFeatures = [], missingKeys = [] } = setup;
  const actor: Actor = { id: 'owner-1', role, owner: role === 'super_admin', suspended: false,
    credentialVersion: 'credential', reauthenticatedAt: Date.now() };
  const planStore = new Map<string, PlanRow>([[PLAN.id, { ...PLAN }]]);
  const optionStore = new Map<string, OptionRow>([[MONTHLY.id, { ...MONTHLY }]]);
  const featureStore = new Map<string, FeatureRow>();
  FEATURE_REGISTRY.forEach((definition, index) => {
    if (missingKeys.includes(definition.key)) return;
    featureStore.set(definition.key, { id: `feature-${index}`, key: definition.key,
      name: definition.name, description: definition.description, category: definition.category, active: false });
  });
  orphanFeatures.forEach((key, index) => featureStore.set(key, { id: `orphan-${index}`, key,
    name: 'Legacy import', description: 'Legacy row left for review', category: 'legacy', active: true }));
  // Keyed by feature key: a translation is 1:1 with its feature row.
  const translationStore = new Map<string, TranslationRow>();
  let nextId = 100;
  translations.forEach((entry, index) => {
    const feature = featureStore.get(entry.key);
    assert.ok(feature, `fixture translation references unknown key ${entry.key}`);
    translationStore.set(entry.key, { id: `trans-${index}`, planId: PLAN.id, featureId: feature.id,
      enabled: entry.enabled, createdAt: new Date(0), updatedAt: new Date(0) });
  });
  const writes = { updates: [] as Array<{ id: string; data: Record<string, unknown> }>,
    creates: [] as Array<{ data: Record<string, unknown> }> };
  const audits: Array<{ action: string; targetId: string | null; reason: string;
    changes: Record<string, unknown> }> = [];
  const revalidated: string[] = [];
  const mutations: string[] = [];
  const tx = {
    plan: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        planStore.has(id) ? { ...planStore.get(id)!, billingOptions: [...optionStore.values()]
          .filter(option => option.planId === id).map(option => ({ ...option })) } : null,
    },
    feature: {
      findMany: async ({ where }: { where?: { key?: { in?: string[] } } } = {}) =>
        [...featureStore.values()]
          .filter(row => !where?.key?.in || (where.key.in as string[]).includes(row.key))
          .map(row => ({ ...row })),
    },
    // Deliberately no delete/deleteMany delegates: a matrix save must never remove rows.
    featurePlanTranslation: {
      findMany: async ({ where = {} }: { where?: { planId?: string } } = {}) =>
        [...translationStore.values()]
          .filter(row => where.planId === undefined || row.planId === where.planId)
          .map(row => ({ ...row })),
      create: async ({ data }: { data: { planId: string; featureId: string; enabled: boolean } }) => {
        const feature = [...featureStore.values()].find(row => row.id === data.featureId);
        assert.ok(feature, 'fixture create for unknown featureId');
        if (translationStore.has(feature.key)) throw new Error('Unique constraint violated.');
        const row: TranslationRow = { id: `trans-${nextId++}`, ...data, createdAt: new Date(0), updatedAt: new Date(0) };
        translationStore.set(feature.key, row);
        writes.creates.push({ data: { ...data } });
        return { ...row };
      },
      update: async ({ where: { id }, data }: { where: { id: string }; data: { enabled: boolean } }) => {
        const entry = [...translationStore.entries()].find(([, row]) => row.id === id);
        if (!entry) throw new Error('Row not found.');
        entry[1].enabled = data.enabled;
        writes.updates.push({ id, data: { ...data } });
        return { ...entry[1] };
      },
    },
    adminAudit: {
      create: async ({ data }: { data: { action: string; targetId: string | null; reason: string;
        changes: Record<string, unknown> } }) => {
        audits.push({ action: data.action, targetId: data.targetId, reason: data.reason,
          changes: JSON.parse(JSON.stringify(data.changes)) });
        return data;
      },
    },
    // Real planHistoryCount reads UserSubscription; the fixture stubs it via
    // wiredPlans when subscribers > 0, otherwise this reports no subscribers.
    userSubscription: {
      findMany: async () => [],
      count: async () => 0,
    },
  };
  const registry = load('../features/registry.ts', {});
  const pricing = load('../features/pricing.ts', { './registry': registry });
  const audit = load('./audit.ts', { 'server-only': {} });
  const legacyModule = load('./legacy-entitlements.ts', {});
  const plansModule = load('./plans.ts', { 'server-only': {}, './audit': audit,
    './legacy-entitlements': legacyModule });
  // planHistoryCount is the Task 3 seam that Task 5 wires to the real count; the
  // stub stands in for a plan with effective subscribers so the removal warning
  // path is exercised before subscriptions exist.
  const wiredPlans = subscribers > 0 ? { ...plansModule, planHistoryCount: async () => subscribers } : plansModule;
  const planFeaturesModule = load('./plan-features.ts', { 'server-only': {}, './audit': audit,
    './plans': wiredPlans, '../features/registry': registry, '../features/pricing': pricing }) as typeof planFeatures;
  const api = load('../../app/admin/plans/actions.ts', {
    'next/cache': { revalidatePath: (path: string) => revalidated.push(path) },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, kind: unknown, action: string, work: () => Promise<unknown>) => {
      mutations.push(`${String(kind)}:${action}`); return work();
    } },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: Actor) => Promise<unknown>) => {
      if (role !== 'super_admin') throw new Error('Administrator access denied.');
      return work(tx, actor);
    } },
    '@/lib/admin/audit': audit,
    '@/lib/admin/plans': wiredPlans,
    '@/lib/admin/plan-features': planFeaturesModule,
    '@/lib/features/registry': registry,
  }) as typeof actions;
  return { api, planFeatures: planFeaturesModule, tx: tx as never, featureStore, translationStore,
    writes, audits, revalidated, mutations };
}

test('validateFeatureMatrix accepts a full registry matrix and preserves the entries', () => {
  const f = fixture('super_admin');
  const entries = FEATURE_REGISTRY.map((definition, index) =>
    ({ key: definition.key, enabled: index % 2 === 0 }));
  const accepted = f.planFeatures.validateFeatureMatrix(entries);
  assert.ok(!isFailure(accepted));
  const matrix = jsonOf(accepted) as { entries: Array<{ key: string; enabled: boolean }> };
  assert.equal(matrix.entries.length, FEATURE_REGISTRY.length);
  assert.deepEqual(matrix.entries[0], { key: FEATURE_REGISTRY[0].key, enabled: true });
  assert.deepEqual(matrix.entries[1], { key: FEATURE_REGISTRY[1].key, enabled: false });
});

test('validateFeatureMatrix rejects unknown, orphaned, and duplicate keys and non-boolean states', () => {
  const f = fixture('super_admin', { orphanFeatures: ['legacy.bulk_import'] });
  const base = FEATURE_REGISTRY.map(definition => ({ key: definition.key, enabled: false }));
  const matrixWith = (extra: Array<{ key: string; enabled: boolean }>) =>
    f.planFeatures.validateFeatureMatrix([...base, ...extra]);
  assert.ok(isFailure(matrixWith([{ key: 'spood.limit', enabled: true }])), 'unknown key');
  assert.ok(isFailure(matrixWith([{ key: 'legacy.bulk_import', enabled: true }])), 'orphaned db key');
  assert.ok(isFailure(matrixWith([{ key: base[0].key, enabled: true }])), 'duplicate key');
  assert.ok(isFailure(matrixWith([{ key: '', enabled: true }])), 'empty key');
  assert.ok(isFailure(f.planFeatures.validateFeatureMatrix([{ key: base[0].key, enabled: 'yes' } as never])),
    'non-boolean state');
  assert.ok(isFailure(f.planFeatures.validateFeatureMatrix('matrix' as never)), 'non-array input');
  const empty = f.planFeatures.validateFeatureMatrix([]);
  assert.ok(!isFailure(empty), 'an empty matrix is a valid input');
});

test('applyFeatureMatrix upserts enabled values, never deletes rows, and skips unchanged entries', async () => {
  const f = fixture('super_admin', { translations: [
    { key: 'spood.create', enabled: true }, { key: 'care.feed.log', enabled: true }] });
  const entries = FEATURE_REGISTRY.map(definition =>
    ({ key: definition.key, enabled: definition.key === 'spood.create' || definition.key === 'photo.upload' }));
  const result = await f.planFeatures.applyFeatureMatrix(f.tx, 'owner-1', PLAN.id, { entries }, 'Enable the gallery');
  assert.ok(!isFailure(result));
  assert.deepEqual(jsonOf(result), { enabledCount: 2, previousEnabledCount: 2, removedAccess: [] });
  assert.equal(f.translationStore.get('spood.create')!.enabled, true);
  // Disabling keeps the row with enabled: false — the spec's safe restoration.
  assert.equal(f.translationStore.get('care.feed.log')!.enabled, false);
  assert.equal(f.translationStore.get('photo.upload')!.enabled, true);
  // Only the true→false flip was rewritten; the identical row was left untouched.
  assert.equal(f.writes.updates.length, 1);
  assert.equal(f.writes.creates.length, 1);
});

test('applyFeatureMatrix lists removed access only when the plan has effective subscribers', async () => {
  const entries = FEATURE_REGISTRY.map(definition =>
    ({ key: definition.key, enabled: definition.key === 'care.feed.log' }));
  const withSubscribers = fixture('super_admin', { subscribers: 3,
    translations: [{ key: 'spood.create', enabled: true }, { key: 'care.feed.log', enabled: true }] });
  const warned = await withSubscribers.planFeatures.applyFeatureMatrix(withSubscribers.tx, 'owner-1', PLAN.id,
    { entries }, 'Drop spood creation');
  assert.ok(!isFailure(warned));
  assert.deepEqual(jsonOf(warned), { enabledCount: 1, previousEnabledCount: 2, removedAccess: ['spood.create'] });

  const withoutSubscribers = fixture('super_admin', { translations: [{ key: 'spood.create', enabled: true }] });
  const silent = await withoutSubscribers.planFeatures.applyFeatureMatrix(withoutSubscribers.tx, 'owner-1', PLAN.id,
    { entries }, 'Same change without subscribers');
  assert.ok(!isFailure(silent));
  assert.deepEqual(jsonOf(silent), { enabledCount: 1, previousEnabledCount: 1, removedAccess: [] });
});

test('applyFeatureMatrix audits plan.features with planName and the matrix counts', async () => {
  const f = fixture('super_admin', { translations: [{ key: 'spood.create', enabled: true }] });
  const entries = FEATURE_REGISTRY.map(definition =>
    ({ key: definition.key, enabled: definition.key === 'photo.upload' }));
  const result = await f.planFeatures.applyFeatureMatrix(f.tx, 'owner-1', PLAN.id, { entries }, 'Swap the enabled feature');
  assert.ok(!isFailure(result));
  assert.deepEqual(f.audits, [{ action: 'plan.features', targetId: PLAN.id, reason: 'Swap the enabled feature',
    changes: { planName: 'Standard', featureCount: FEATURE_REGISTRY.length, enabledCount: 1, previousEnabledCount: 1 } }]);
});

test('applyFeatureMatrix rejects an unchanged matrix without writes or audits', async () => {
  const f = fixture('super_admin', { translations: [{ key: 'spood.create', enabled: true }] });
  const entries = FEATURE_REGISTRY.map(definition =>
    ({ key: definition.key, enabled: definition.key === 'spood.create' }));
  const result = await f.planFeatures.applyFeatureMatrix(f.tx, 'owner-1', PLAN.id, { entries }, 'Accidental resave');
  assert.ok(isFailure(result));
  assert.equal(f.writes.updates.length + f.writes.creates.length, 0);
  assert.equal(f.audits.length, 0);
});

test('applyFeatureMatrix fails closed on missing feature rows, unknown plans, and invalid matrices', async () => {
  const partial = fixture('super_admin', { missingKeys: ['photo.upload'] });
  const base = FEATURE_REGISTRY.map(definition => ({ key: definition.key, enabled: false }));
  const withGap = base.map(entry => (entry.key === 'photo.upload' ? { ...entry, enabled: true } : entry));
  const gap = await partial.planFeatures.applyFeatureMatrix(partial.tx, 'owner-1', PLAN.id,
    { entries: withGap }, 'Enable without sync');
  assert.ok(isFailure(gap));
  assert.match((gap as Error).message, /registry sync/);
  assert.equal(partial.writes.updates.length + partial.writes.creates.length, 0);

  const orphan = fixture('super_admin', { orphanFeatures: ['legacy.bulk_import'] });
  const orphanSave = await orphan.planFeatures.applyFeatureMatrix(orphan.tx, 'owner-1', PLAN.id,
    { entries: [{ key: 'legacy.bulk_import', enabled: true }] }, 'Assign an orphan');
  assert.ok(isFailure(orphanSave));
  assert.equal(orphan.audits.length, 0);

  const f = fixture('super_admin');
  assert.ok(isFailure(await f.planFeatures.applyFeatureMatrix(f.tx, 'owner-1', 'plan-missing',
    { entries: base }, 'Ghost plan')));
  assert.ok(isFailure(await f.planFeatures.applyFeatureMatrix(f.tx, 'owner-1', PLAN.id,
    { entries: [{ key: base[0].key, enabled: true }, { key: base[0].key, enabled: false }] }, 'Duplicate keys')));
  assert.equal(f.audits.length, 0);
});

test('summarizePlanForPricing is pure: active option prices and registry-resolved enabled features', () => {
  const f = fixture('super_admin');
  const options = [
    { planId: PLAN.id, interval: 'MONTHLY', basePriceCents: 900, active: true },
    { planId: PLAN.id, interval: 'ANNUAL', basePriceCents: 9000, active: false },
    { planId: 'plan-other', interval: 'ANNUAL', basePriceCents: 1, active: true },
  ];
  const translations = [
    { key: 'care.feed.log', enabled: true },
    { key: 'care.feed.log', enabled: true },
    { key: 'spood.create', enabled: false },
    { key: 'photo.upload', enabled: true },
    { key: 'legacy.bulk_import', enabled: true },
  ];
  const summary = jsonOf(f.planFeatures.summarizePlanForPricing({ id: PLAN.id }, options, translations));
  assert.deepEqual(summary, {
    monthlyCents: 900,
    annualCents: null,
    enabledFeatures: [
      { key: 'care.feed.log', name: 'Log feeding', category: 'care' },
      { key: 'photo.upload', name: 'Upload photos', category: 'photos' },
    ],
  });
  assert.deepEqual(jsonOf(f.planFeatures.summarizePlanForPricing({ id: PLAN.id }, [], [])),
    { monthlyCents: null, annualCents: null, enabledFeatures: [] });
});

test('non-super-admin matrix saves are denied without writes, audits, or revalidation', async () => {
  const f = fixture('admin');
  const form = new FormData();
  form.set('planId', PLAN.id); form.set('feature', 'spood.create');
  assert.ok((await f.api.saveFeatureMatrixAction(form)).error);
  assert.deepEqual(f.mutations, ['admin:savefeaturematrix']);
  assert.equal(f.audits.length, 0);
  assert.equal(f.revalidated.length, 0);
  assert.equal(f.writes.updates.length + f.writes.creates.length, 0);
});

test('a super administrator saves the matrix through the mutation boundary and audits plan.features', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('planId', PLAN.id);
  form.append('feature', 'spood.create'); form.append('feature', 'photo.upload');
  assert.deepEqual(jsonOf(await f.api.saveFeatureMatrixAction(form)), { success: true });
  assert.deepEqual(f.mutations, ['admin:savefeaturematrix']);
  assert.deepEqual(f.revalidated, ['/admin/plans']);
  assert.equal(f.audits.length, 1);
  assert.equal(f.audits[0].action, 'plan.features');
  assert.equal(f.audits[0].reason,
    `Saved feature matrix for plan Standard (2 of ${FEATURE_REGISTRY.length} enabled)`);
  assert.equal(f.audits[0].changes.enabledCount, 2);
  assert.equal(f.audits[0].changes.previousEnabledCount, 0);
  assert.equal(f.translationStore.get('spood.create')!.enabled, true);
  assert.equal(f.translationStore.get('photo.upload')!.enabled, true);
  assert.equal(f.translationStore.size, 2);
});

test('a matrix save that removes access from subscribers succeeds with a warning and keeps rows', async () => {
  const f = fixture('super_admin', { subscribers: 2, translations: [{ key: 'spood.create', enabled: true }] });
  const form = new FormData();
  form.set('planId', PLAN.id);
  const result = jsonOf(await f.api.saveFeatureMatrixAction(form)) as { success?: boolean; warning?: string };
  assert.equal(result.success, true);
  assert.match(result.warning ?? '', /spood\.create/);
  // The save proceeds and the row is kept with enabled: false.
  assert.equal(f.translationStore.get('spood.create')!.enabled, false);
  assert.equal(f.writes.updates.length, 1);
  assert.equal(f.audits[0].changes.enabledCount, 0);
});
