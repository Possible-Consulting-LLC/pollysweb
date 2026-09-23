import * as maintenancePolicy from './maintenance-policy';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { AccountInputError, AccountVersionError, accountPatchFromForm } from './accounts';
import type * as actions from '../../app/actions/admin-accounts';

function fixture() {
  const actor = { id: 'admin-1', role: 'admin' };
  let profile: unknown;
  let facebook: unknown;
  const dependencies: Record<string, unknown> = {
    '@/lib/admin/maintenance-policy':maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/admin/actor': { AdminAccessError: class AdminAccessError extends Error {}, requireAdminActor: async () => actor },
    '@/lib/admin/accounts': {
      AccountInputError, AccountVersionError, accountPatchFromForm,
      updateAccount: async (...args: unknown[]) => { profile = args; },
      requestAdminEmailChange: async () => {}, setAccountRole: async () => {}, setAccountSuspended: async () => {},
      completeFacebookDeletion: async (...args: unknown[]) => { facebook = args; },
    },
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../../app/actions/admin-accounts.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, console, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { api: exports as typeof actions, profile: () => profile as unknown[], facebook: () => facebook as unknown[] };
}

test('profile action preserves the full form schema defaults including an unset timezone', async () => {
  const f = fixture();
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: 'Correct name', timezone: '', dateFormat: 'MMM d, yyyy', measurement: 'imperial',
    theme: 'cosmic', feedDefaultDays: '3', mistDefaultDays: '1', cleanDefaultDays: '14', reason: 'Correct display name' })) form.set(key, value);
  assert.equal((await f.api.updateAccountAction('keeper-1', 3, form)).success, true);
  const [resolvedActor, targetId, version, patch, reason] = f.profile();
  assert.deepEqual(resolvedActor, { id: 'admin-1', role: 'admin' });
  assert.equal(targetId, 'keeper-1'); assert.equal(version, 3); assert.equal(reason, 'Correct display name');
  assert.equal((patch as { timezone: string }).timezone, '');
});

test('Facebook action keeps bound target and receipt while passing explicit residual provenance', async () => {
  const f = fixture();
  const form = new FormData();
  form.set('targetId', 'forged-target'); form.set('requestId', 'forged-request');
  form.set('confirmation', 'COMPLETE FACEBOOK DELETION'); form.set('nameProvenance', 'remove');
  form.set('imageProvenance', 'remove'); form.set('emailProvenance', 'independent_verified'); form.set('reason', 'Reviewed residual fields');
  assert.equal((await f.api.completeFacebookDeletionAction('keeper-1', 4, 'receipt-2', form)).success, true);
  const [, targetId, version, requestId, review, reason] = f.facebook();
  assert.equal(targetId, 'keeper-1'); assert.equal(version, 4); assert.equal(requestId, 'receipt-2');
  assert.equal((review as { name: string }).name, 'remove'); assert.equal((review as { image: string }).image, 'remove');
  assert.equal((review as { email: string }).email, 'independent_verified');
  assert.equal(reason, 'Reviewed residual fields');
});
