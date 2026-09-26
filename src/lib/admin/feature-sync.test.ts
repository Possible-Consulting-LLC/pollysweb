import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { FEATURE_REGISTRY } from '../features/registry';

type FeatureRow = { id: string; key: string; name: string; description: string; category: string; active: boolean };

function registryModule() {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../features/registry.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports });
  return exports;
}

function seedAll(active: Record<string, boolean> = {}): FeatureRow[] {
  return FEATURE_REGISTRY.map((definition, index) => ({ id: `feature-${index + 1}`, key: definition.key,
    name: definition.name, description: definition.description, category: definition.category,
    active: active[definition.key] ?? false }));
}

function fixture(seed: FeatureRow[]) {
  const rows = new Map(seed.map(row => [row.key, { ...row }]));
  let sequence = 0;
  const created: FeatureRow[] = [];
  const forbidden: string[] = [];
  const tx = {
    feature: {
      findMany: async () => [...rows.values()].map(row => ({ ...row })),
      create: async (args: { data: Omit<FeatureRow, 'id'> }) => {
        if (rows.has(args.data.key)) throw new Error('Unique constraint violated.');
        const row: FeatureRow = { id: `created-${++sequence}`, ...args.data };
        rows.set(row.key, row); created.push({ ...row }); return { ...row };
      },
      update: async () => { forbidden.push('update'); throw new Error('Sync must never update existing rows.'); },
      upsert: async () => { forbidden.push('upsert'); throw new Error('Sync must not rely on upserts.'); },
      delete: async () => { forbidden.push('delete'); throw new Error('Sync must never delete rows.'); },
    },
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('./feature-sync.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(['server-only', '../features/registry'].includes(name), name);
    return name === 'server-only' ? {} : registryModule();
  } });
  const api = exports as { syncFeatureRegistry: (tx: unknown, actorId: string, reason: string) =>
    Promise<{ created: string[]; unchanged: number; orphaned: string[] }> };
  return { api, tx, rows, created, forbidden };
}

test('first sync creates every registry feature inactive with verbatim metadata', async () => {
  const f = fixture([]);
  const report = JSON.parse(JSON.stringify(await f.api.syncFeatureRegistry(f.tx, 'owner-1', 'Initial feature catalog provisioning')));
  assert.deepEqual(report, { created: FEATURE_REGISTRY.map(definition => definition.key), unchanged: 0, orphaned: [] });
  assert.equal(f.rows.size, FEATURE_REGISTRY.length);
  for (const definition of FEATURE_REGISTRY) {
    const row = f.rows.get(definition.key)!;
    assert.equal(row.active, false, definition.key);
    assert.equal(row.name, definition.name);
    assert.equal(row.description, definition.description);
    assert.equal(row.category, definition.category);
  }
  assert.ok(FEATURE_REGISTRY.some(definition => definition.description.includes('`')));
});

test('re-sync creates nothing, leaves release state and every row untouched, and reports all unchanged', async () => {
  const f = fixture(seedAll({ 'journey.check_in': true, 'spood.create': true }));
  const before = [...f.rows.values()].map(row => ({ ...row }));
  const report = JSON.parse(JSON.stringify(await f.api.syncFeatureRegistry(f.tx, 'owner-1', 'Scheduled registry re-check')));
  assert.deepEqual(report, { created: [], unchanged: FEATURE_REGISTRY.length, orphaned: [] });
  assert.equal(f.created.length, 0);
  assert.equal(f.forbidden.length, 0);
  assert.deepEqual([...f.rows.values()].map(row => row.active), before.map(row => row.active));
  assert.deepEqual([...f.rows.values()].map(row => row.name), before.map(row => row.name));
});

test('a registry key missing from the database is created inactive while existing rows stay untouched', async () => {
  const missing = 'care.molt.log';
  const f = fixture(seedAll({ 'spood.create': true }).filter(row => row.key !== missing));
  const report = JSON.parse(JSON.stringify(await f.api.syncFeatureRegistry(f.tx, 'owner-1', 'Registry gained a feature')));
  assert.deepEqual(report, { created: [missing], unchanged: FEATURE_REGISTRY.length - 1, orphaned: [] });
  assert.equal(f.rows.get(missing)!.active, false);
  assert.equal(f.forbidden.length, 0);
  assert.equal(f.rows.get('spood.create')!.active, true);
});

test('database keys absent from the registry are reported orphaned, sorted, and never modified', async () => {
  const f = fixture([...seedAll({ 'spood.create': true }),
    { id: 'legacy-1', key: 'legacy.bulk_import', name: 'Old name', description: 'Old description', category: 'legacy', active: true },
    { id: 'legacy-2', key: 'another.old_key', name: 'Older', description: 'Older description', category: 'legacy', active: false }]);
  const report = JSON.parse(JSON.stringify(await f.api.syncFeatureRegistry(f.tx, 'owner-1', 'Registry dropped retired keys')));
  assert.deepEqual(report, { created: [], unchanged: FEATURE_REGISTRY.length, orphaned: ['another.old_key', 'legacy.bulk_import'] });
  assert.equal(f.forbidden.length, 0);
  assert.equal(f.rows.get('legacy.bulk_import')!.active, true);
  assert.equal(f.rows.get('legacy.bulk_import')!.name, 'Old name');
  assert.equal(f.rows.get('another.old_key')!.active, false);
});

test('sync fails closed without an actor, or without a short reason', async () => {
  const f = fixture(seedAll());
  await assert.rejects(f.api.syncFeatureRegistry(f.tx, '', 'Provisioning'));
  await assert.rejects(f.api.syncFeatureRegistry(f.tx, 'owner-1', '   '));
  await assert.rejects(f.api.syncFeatureRegistry(f.tx, 'owner-1', 'r'.repeat(501)));
  assert.equal(f.created.length, 0);
});
