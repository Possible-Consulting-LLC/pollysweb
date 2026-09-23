import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from './maintenance-policy';
function load(path: string, deps: Record<string, unknown>) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Response, Date, process: { env: {} }, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return exports as {
    GET: (r?: Request) => Promise<Response>;
  };
}
test('public status has no identity lookup, no-store, exact DTO, retryable outage', async () => {
  let outage = false;
  const state = { version: 7, deadline: new Date(0), announcementEnabled: true, announcement: 'Back soon', updatedBy: 'private-actor' };
  const api = load('../../app/api/site-status/route.ts', {
    '@/lib/admin/maintenance-state': {
      readMaintenanceState: async () => {
        if (outage)
          throw Error('db');
        return state;
      }
    }, '@/lib/admin/maintenance-policy': policy
  });
  const response = await api.GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.deepEqual(Object.keys(body).sort(), ['announcement', 'announcementEnabled', 'deadline', 'mode', 'serverTime']);
  assert.equal(body.mode, 'active');
  assert.equal(body.announcement, 'Back soon');
  outage = true;
  const failed = await api.GET();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('retry-after'), '60');
});
test('private context revalidates the server session and fails closed without adding bypass to public status', async () => {
  let valid = true;
  const api = load('../../app/api/site-status/context/route.ts', {
    '@/lib/admin/test-session-store': { resolveRequestIdentity: async () => valid ? { actorId: 'owner', effectiveUserId: 'demo', testSessionId: 'session', contextVersion: 'proof' } : null },
    '@/lib/admin/maintenance-access': { hasMaintenanceBypass: async (identity: { actorId: string }) => identity.actorId === 'owner' },
    '@/lib/admin/test-session': { TestContextError: class extends Error {} },
  });
  const response = await api.GET();
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
  assert.deepEqual(await response.json(), { bypass: true, testContextChanged: false });
  valid = false;
  assert.deepEqual(await (await api.GET()).json(), { bypass: false, testContextChanged: false });
});
