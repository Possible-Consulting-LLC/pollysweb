import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as maintenancePolicy from './maintenance-policy';
import { FEATURE_REGISTRY } from '../features/registry';
import type * as actions from '../../app/admin/features/actions';

type FeatureRow = { id: string; key: string; name: string; description: string; category: string; active: boolean };
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

const REGISTERED: FeatureRow = { id: 'feature-1', key: 'spood.create', name: 'Add a spood',
  description: 'Create a new active spood (subject to the plan\'s `maxSpiders` allowance).',
  category: 'spoods', active: false };
const ORPHANED: FeatureRow = { id: 'feature-9', key: 'legacy.bulk_import', name: 'Old import',
  description: 'Legacy description', category: 'legacy', active: true };

function fixture(role: Actor['role']) {
  const actor: Actor = { id: 'owner-1', role, owner: role === 'super_admin', suspended: false,
    credentialVersion: 'credential', reauthenticatedAt: Date.now() };
  const store = new Map<string, FeatureRow>([[REGISTERED.key, { ...REGISTERED }], [ORPHANED.key, { ...ORPHANED }]]);
  const updates: Array<{ where: { key: string }; data: Record<string, unknown> }> = [];
  const audits: Array<{ action: string; targetId: string | null; reason: string; changes: Record<string, unknown> }> = [];
  const revalidated: string[] = [];
  const mutations: string[] = [];
  const syncCalls: Array<{ actorId: string; reason: string }> = [];
  const tx = {
    feature: {
      findUnique: async (args: { where: { key: string } }) => {
        const row = store.get(args.where.key); return row ? { ...row } : null;
      },
      update: async (args: { where: { key: string }; data: Partial<FeatureRow> }) => {
        const row = store.get(args.where.key);
        if (!row) throw new Error('Row not found.');
        Object.assign(row, args.data);
        // Copy into this realm: the caller runs inside a vm sandbox.
        updates.push({ where: { key: args.where.key }, data: { ...args.data } });
        return { ...row };
      },
      findMany: async () => [...store.values()].map(row => ({ ...row })),
      create: async (args: { data: Omit<FeatureRow, 'id' | 'active'> & { active?: boolean } }) => {
        if (store.has(args.data.key)) throw new Error('Unique constraint violated.');
        const row: FeatureRow = { id: `created-${store.size + 1}`, active: false, ...args.data };
        store.set(row.key, row); return { ...row };
      },
    },
    adminAudit: {
      create: async (args: { data: { action: string; targetId: string | null; reason: string;
        changes: Record<string, unknown> } }) => {
        audits.push({ action: args.data.action, targetId: args.data.targetId, reason: args.data.reason,
          changes: JSON.parse(JSON.stringify(args.data.changes)) });
        return args.data;
      },
    },
  };
  const registry = load('../features/registry.ts', {});
  const audit = load('./audit.ts', { 'server-only': {} });
  const featureSync = load('./feature-sync.ts', { 'server-only': {}, '../features/registry': registry });
  const api = load('../../app/admin/features/actions.ts', {
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
    '@/lib/admin/feature-sync': { ...featureSync, syncFeatureRegistry: async (syncTx: unknown, actorId: string, reason: string) => {
      syncCalls.push({ actorId, reason });
      return (featureSync as { syncFeatureRegistry: (tx: unknown, actorId: string, reason: string) => Promise<unknown> })
        .syncFeatureRegistry(syncTx, actorId, reason);
    } },
    '@/lib/features/registry': registry,
  }) as typeof actions;
  return { api, store, updates, audits, revalidated, mutations, syncCalls };
}

test('non-super-admin calls are denied for every catalog mutation without touching rows or audit', async () => {
  const f = fixture('admin');
  const release = new FormData();
  release.set('key', REGISTERED.key); release.set('active', 'true');
  assert.ok((await f.api.setFeatureReleaseAction(release)).error);
  const metadata = new FormData();
  metadata.set('key', REGISTERED.key); metadata.set('name', 'Renamed'); metadata.set('category', 'spoods');
  metadata.set('description', 'New description');
  assert.ok((await f.api.saveFeatureMetadataAction(metadata)).error);
  assert.ok((await f.api.syncRegistryAction(new FormData())).error);
  assert.deepEqual(f.mutations.sort(), ['admin:savefeaturemetadata', 'admin:setfeaturerelease', 'admin:syncregistry']);
  assert.equal(f.updates.length, 0);
  assert.equal(f.audits.length, 0);
  assert.equal(f.revalidated.length, 0);
});

test('release toggle runs in the admin boundary and audits feature.release with previousActive and active', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('key', REGISTERED.key); form.set('active', 'true');
  assert.deepEqual(jsonOf(await f.api.setFeatureReleaseAction(form)), { success: true });
  assert.deepEqual(f.updates, [{ where: { key: REGISTERED.key }, data: { active: true } }]);
  assert.deepEqual(f.audits, [{ action: 'feature.release', targetId: REGISTERED.id,
    reason: `Toggled feature ${REGISTERED.key} release`,
    changes: { featureKey: REGISTERED.key, previousActive: false, active: true } }]);
  assert.deepEqual(f.revalidated, ['/admin/features', '/pricing']);
});

test('metadata save audits feature.metadata with featureKey and changed fields, never description text', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('key', REGISTERED.key); form.set('name', 'Add a spood!'); form.set('category', 'spoods');
  form.set('description', 'Rewritten description text');
  assert.deepEqual(jsonOf(await f.api.saveFeatureMetadataAction(form)), { success: true });
  assert.deepEqual(f.updates, [{ where: { key: REGISTERED.key },
    data: { name: 'Add a spood!', description: 'Rewritten description text', category: 'spoods' } }]);
  assert.deepEqual(f.audits, [{ action: 'feature.metadata', targetId: REGISTERED.id,
    reason: `Updated feature metadata for ${REGISTERED.key}`,
    changes: { featureKey: REGISTERED.key, fieldsChanged: 'name,description', name: 'Add a spood!' } }]);
  assert.ok(!JSON.stringify(f.audits).includes('Rewritten description text'));
});

test('no-change metadata save is rejected without a write or an audit event', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('key', REGISTERED.key); form.set('name', REGISTERED.name); form.set('category', REGISTERED.category);
  form.set('description', REGISTERED.description);
  assert.ok((await f.api.saveFeatureMetadataAction(form)).error);
  assert.equal(f.updates.length, 0); assert.equal(f.audits.length, 0);
});

test('orphaned and unknown keys fail closed for release and metadata edits', async () => {
  const f = fixture('super_admin');
  for (const key of [ORPHANED.key, 'ghost.key']) {
    const release = new FormData();
    release.set('key', key); release.set('active', 'true');
    assert.ok((await f.api.setFeatureReleaseAction(release)).error, key);
    const metadata = new FormData();
    metadata.set('key', key); metadata.set('name', 'Renamed'); metadata.set('category', 'legacy');
    metadata.set('description', 'New description');
    assert.ok((await f.api.saveFeatureMetadataAction(metadata)).error, key);
  }
  assert.equal(f.updates.length, 0); assert.equal(f.audits.length, 0); assert.equal(f.revalidated.length, 0);
  assert.equal(f.store.get(ORPHANED.key)!.active, true);
});

test('sync action delegates to the real registry sync inside the admin boundary', async () => {
  const f = fixture('super_admin');
  assert.deepEqual(jsonOf(await f.api.syncRegistryAction(new FormData())), { success: true });
  assert.deepEqual(f.syncCalls, [{ actorId: 'owner-1', reason: 'Sync the feature registry from code' }]);
  assert.deepEqual(f.revalidated, ['/admin/features', '/pricing']);
  assert.equal(f.store.size, FEATURE_REGISTRY.length + 1);
  for (const definition of FEATURE_REGISTRY) assert.equal(f.store.get(definition.key)!.active, false, definition.key);
  assert.equal(f.store.get(ORPHANED.key)!.active, true);
  assert.equal(f.audits.length, 0);
});

test('bulk release audits one feature.release mutation per selected feature', async () => {
  const f = fixture('super_admin');
  await f.api.syncRegistryAction(new FormData());
  f.audits.length = 0; f.updates.length = 0; f.revalidated.length = 0;
  // spood.create is released first so the second call covers both the flip
  // and the already-in-state branch.
  const warmup = new FormData();
  warmup.append('key', 'spood.create'); warmup.set('active', 'true');
  assert.deepEqual(jsonOf(await f.api.bulkSetFeatureReleaseAction(warmup)), { success: true });
  f.audits.length = 0; f.updates.length = 0; f.revalidated.length = 0; f.mutations.length = 0;
  const form = new FormData();
  form.append('key', 'spood.create'); form.append('key', 'care.feed.log');
  form.set('active', 'true');
  assert.deepEqual(jsonOf(await f.api.bulkSetFeatureReleaseAction(form)), { success: true });
  assert.deepEqual(f.mutations, ['admin:bulksetfeaturerelease']);
  assert.deepEqual(f.revalidated, ['/admin/features', '/pricing']);
  assert.equal(f.audits.length, 2);
  const flip = f.audits.find(audit => audit.changes.featureKey === 'care.feed.log');
  assert.equal(flip!.action, 'feature.release');
  assert.equal(flip!.reason, 'Toggled feature care.feed.log release');
  assert.deepEqual(flip!.changes, { featureKey: 'care.feed.log', previousActive: false, active: true });
  // A feature already in the requested state is still audited, with no change.
  assert.deepEqual(f.audits.find(audit => audit.changes.featureKey === 'spood.create')!.changes,
    { featureKey: 'spood.create', fieldsChanged: 'none' });
  assert.equal(f.updates.filter(update => update.data.active === true).length, 1);
  // Orphaned keys fail closed, consistent with the single-feature action.
  const orphanForm = new FormData();
  orphanForm.append('key', ORPHANED.key); orphanForm.set('active', 'true');
  assert.ok((await f.api.bulkSetFeatureReleaseAction(orphanForm)).error);
  assert.equal(f.store.get(ORPHANED.key)!.active, true);
});

test('bulk unrelease flips active features down with the same derived reason', async () => {
  const f = fixture('super_admin');
  await f.api.syncRegistryAction(new FormData());
  const release = new FormData();
  release.append('key', 'spood.create'); release.set('active', 'true');
  await f.api.bulkSetFeatureReleaseAction(release);
  f.audits.length = 0; f.updates.length = 0; f.revalidated.length = 0;
  const form = new FormData();
  form.append('key', 'spood.create'); form.set('active', 'false');
  assert.deepEqual(jsonOf(await f.api.bulkSetFeatureReleaseAction(form)), { success: true });
  assert.deepEqual(f.updates, [{ where: { key: 'spood.create' }, data: { active: false } }]);
  assert.deepEqual(f.audits[0].changes, { featureKey: 'spood.create', previousActive: true, active: false });
  assert.equal(f.audits[0].reason, 'Toggled feature spood.create release');
});

test('a mixed batch with an orphan key fails closed before any write', async () => {
  const f = fixture('super_admin');
  await f.api.syncRegistryAction(new FormData());
  f.audits.length = 0; f.updates.length = 0; f.revalidated.length = 0; f.mutations.length = 0;
  const form = new FormData();
  form.append('key', 'spood.create'); form.append('key', ORPHANED.key);
  form.set('active', 'true');
  assert.ok((await f.api.bulkSetFeatureReleaseAction(form)).error);
  assert.equal(f.updates.length, 0, 'the valid key must not be written when a sibling is orphaned');
  assert.equal(f.audits.length, 0);
  assert.equal(f.revalidated.length, 0);
  assert.equal(f.store.get('spood.create')!.active, false);
  assert.equal(f.store.get(ORPHANED.key)!.active, true);
});

test('bulk release is denied for non-super-admins and fails closed on empty or unknown selections', async () => {
  const denied = fixture('admin');
  const form = new FormData();
  form.append('key', 'spood.create'); form.set('active', 'true');
  assert.ok((await denied.api.bulkSetFeatureReleaseAction(form)).error);
  assert.equal(denied.updates.length, 0);
  assert.equal(denied.audits.length, 0);

  const f = fixture('super_admin');
  await f.api.syncRegistryAction(new FormData());
  f.audits.length = 0; f.updates.length = 0; f.revalidated.length = 0;
  assert.ok((await f.api.bulkSetFeatureReleaseAction(new FormData())).error, 'empty selection');
  const ghost = new FormData();
  ghost.append('key', 'ghost.key'); ghost.set('active', 'true');
  assert.ok((await f.api.bulkSetFeatureReleaseAction(ghost)).error, 'unknown key');
  const badState = new FormData();
  badState.append('key', 'spood.create'); badState.set('active', 'maybe');
  assert.ok((await f.api.bulkSetFeatureReleaseAction(badState)).error, 'invalid state');
  assert.equal(f.updates.length, 0);
  assert.equal(f.audits.length, 0);
  assert.equal(f.revalidated.length, 0);
});
