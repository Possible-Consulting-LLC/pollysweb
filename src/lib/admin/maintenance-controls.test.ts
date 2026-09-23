import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('maintenance control binds each operation to its exact confirmation phrase', async () => {
  const changes: string[] = [];
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../../app/actions/admin-maintenance.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, _kind: unknown, _name: unknown, work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'owner' }) },
    '@/lib/admin/maintenance-state': { setMaintenance: async (_actor: unknown, _version: number, operation: string) => changes.push(operation), setAnnouncement: async () => {} },
    '@/lib/admin/maintenance-policy': { MaintenanceError: class extends Error {} },
    '@/lib/rate-limit': { allowAction: async () => true, RATE_LIMIT_MESSAGE: 'wait' },
  };
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const action = exports.setMaintenanceAction as (operation: 'start' | 'cancel' | 'reopen', form: FormData) => Promise<{ error?: string; success?: boolean }>;
  const form = new FormData(); form.set('version', '3');
  assert.ok((await action('start', form)).error);
  assert.deepEqual(changes, []);
  form.set('confirmation', 'START MAINTENANCE'); assert.equal((await action('start', form)).success, true);
  assert.ok((await action('cancel', form)).error);
  form.set('confirmation', 'CANCEL MAINTENANCE'); assert.equal((await action('cancel', form)).success, true);
  assert.ok((await action('reopen', form)).error);
  form.set('confirmation', 'REOPEN SITE'); assert.equal((await action('reopen', form)).success, true);
  assert.deepEqual(changes, ['start', 'cancel', 'reopen']);
});
