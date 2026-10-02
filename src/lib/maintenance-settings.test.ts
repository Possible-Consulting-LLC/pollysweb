import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { mutationIdentity } from './mutation-context';
import * as policy from './admin/maintenance-policy';
import * as failure from './mutation-failure';
import * as context from './admin/test-session';

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, FormData, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return exports as T;
}
function fixture() {
  let active = false;
  let writes = 0;
  const redirects: string[] = [];
  class Redirect extends Error {}
  const navigation = { redirect: (url: string) => { redirects.push(url); throw new Redirect(url); } };
  const identity = { actorId: 'keeper', effectiveUserId: 'keeper', testSessionId: null, contextVersion: 'a'.repeat(64) };
  const access = { guardMaintenance: async () => { if (active) throw new policy.MaintenanceError(); } };
  const store = { resolveRequestIdentity: async () => identity, auditTestMutation: async () => { active = true; }, anonymousMutationContext: () => '' };
  const boundary = load<typeof import('./mutation-boundary')>('./mutation-boundary.ts', {
    'server-only': {}, './admin/maintenance-access': access, './admin/maintenance-policy': policy,
    './mutation-failure': failure, './mutation-context': { mutationIdentity }, './admin/test-session': context, './admin/test-session-store': store,
  });
  const session = load<typeof import('./session')>('./session.ts', {
    './admin/maintenance-access': access, './admin/maintenance-policy': policy, react: { cache: (fn: unknown) => fn },
    'next/dist/client/components/redirect-error': { isRedirectError: (error: unknown) => error instanceof Redirect },
    '@/lib/auth': {}, '@/lib/raw-session': {}, '@/lib/admin/test-session-store': store,
    '@/lib/admin/test-session': context, '@/lib/mutation-context': { mutationIdentity }, '@/lib/db': {}, 'next/navigation': navigation,
  });
  const actions = load<typeof import('../app/actions/auth')>('../app/actions/auth.ts', {
    '@/lib/admin/maintenance-policy': policy, '@/lib/maintenance-write': { maintenanceTransaction: async () => { writes++; } },
    '@/lib/admin/maintenance-access': {}, '@/lib/mutation-boundary': boundary, '@/lib/rate-limit': {}, '@/lib/password-policy': {},
    '@/lib/utils': {}, 'next-auth': {}, 'next/navigation': navigation, '@/lib/registration-validation': {}, '@/lib/auth': {}, '@/lib/db': {},
    '@/lib/session': session, '@/lib/constants': {}, '@/lib/uploads': {}, '@/lib/spider-slots': {}, '@/lib/write-validation': {},
    '@/lib/features/gate': { withFeatureGate: async (_key: string, work: () => Promise<unknown>) => work() },
    'next/cache': {}, 'next/dist/client/components/redirect-error': {}, zod: { z }, '@/lib/email-delivery': {}, '@/lib/email-challenge': {},
  });
  return { actions, session, redirects, writes: () => writes, close: () => { active = true; }, identity, Redirect };
}
test('Settings cutoff after mutation admission returns inline failure without navigating or writing', async () => {
  const f = fixture();
  const form = new FormData();
  form.set('mutationContext', f.identity.contextVersion);
  form.set('name', 'Unsaved keeper');
  assert.deepEqual(await f.actions.updateSettingsAction(form), policy.maintenanceFailure());
  assert.deepEqual(f.redirects, []);
  assert.equal(f.writes(), 0);
  assert.equal(form.get('name'), 'Unsaved keeper');
});
test('direct page reads still redirect to the maintenance fallback', async () => {
  const f = fixture(); f.close();
  await assert.rejects(f.session.getSessionUser(), f.Redirect);
  assert.deepEqual(f.redirects, ['/maintenance']);
});
