import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from './maintenance-policy';
import { servePrivatePhoto } from '../photo-media-route';
import * as photoMedia from '../photo-media';
import * as photoCleanup from '../photo-cleanup';
import * as crypto from 'node:crypto';
function load<T>(path: string, deps: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Response, Date, console: { error() { }, warn() { } }, process: { env: {} }, ...globals, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return exports as T;
}
test('signed Stripe webhook validates signatures before maintenance deferral and never acknowledges skipped work', async () => {
  let calls = 0;
  const api = load<typeof import('../../app/api/stripe/webhook/route')>('../../app/api/stripe/webhook/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/staging-guard': { isStaging: () => false },
    '@/lib/admin/maintenance-access': { guardServiceMaintenance: async () => { throw new policy.MaintenanceError(); } }, '@/lib/admin/maintenance-policy': policy,
    '@/lib/billing-service': { reconcileStripeCustomer: async () => calls++ }, '@/lib/stripe': {
      getStripe: () => ({
        webhooks: {
          constructEvent: (_body: string, signature: string) => {
            if (signature !== 'valid')
              throw Error();
            return { type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'customer' } } };
          }
        }
      })
    },
  }, { process: { env: { STRIPE_WEBHOOK_SECRET: 'test', STRIPE_SECRET_KEY: 'test' } } });
  const request = (signature: string) => new Request('https://example.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': signature }, body: 'signed' });
  assert.equal((await api.POST(request('forged'))).status, 400);
  const response = await api.POST(request('valid'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(calls, 0);
  assert.equal('received' in await response.json(), false);
});
test('photos fail closed without download when maintenance starts after ownership read', async () => {
  let checks = 0, downloads = 0;
  const api = load<typeof import('../../app/api/photos/route')>('../../app/api/photos/route.ts', {
    '@/lib/admin/maintenance-access': {
      guardMaintenance: async () => {
        if (++checks > 1)
          throw new policy.MaintenanceError();
      }
    }, '@/lib/admin/maintenance-policy': policy,
    '@/lib/admin/test-session-store': { resolveRequestIdentity: async () => ({ effectiveUserId: 'demo' }) }, '@/lib/db': { prisma: { photo: { findFirst: async () => ({ id: 'photo' }) } } },
    '@/lib/photo-reference-owner': { ownsPhotoReference: async () => true }, '@/lib/features/gate': { resolveUserFeatureGate: async () => 'entitled' },
    '@/lib/supabase': { getSupabaseAdmin: () => { downloads++; throw Error(); } }, '@/lib/photo-media-route': { servePrivatePhoto }, '@/lib/photo-media': photoMedia,
  }, { URL });
  const response = await api.GET(new Request('https://example.test/api/photos?ref=' + encodeURIComponent('spood-storage:demo/image.png')));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(downloads, 0);
});
function cleanupFixture({ settled = true, attached = false, offline = false, removeFails = false } = {}) {
  let removed = 0, deleted = 0;
  const tx = { $queryRaw: async () => [], ownedUpload: { findUnique: async () => ({ key: 'keeper/photo.png', userId: 'keeper', settled }), deleteMany: async () => { deleted++; return { count: 1 }; } }, spider: { findFirst: async () => attached ? { id: 'spider' } : null } };
  const api = load<typeof import('../uploads')>('../uploads.ts', {
    './admin/maintenance-access': {}, './admin/maintenance-policy': policy, 'fs/promises': {}, './db': {
      prisma: {
        $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
          if (offline)
            throw Error();
          return work(tx);
        }
      }
    }, './upload-admission': {}, path: {}, 'node:crypto': crypto, './session': {}, './rate-limit': {}, './upload-validation': {}, './upload-limits': {}, './photo-media': photoMedia, './photo-cleanup': photoCleanup,
    '@/lib/supabase': { isSupabaseConfigured: () => true, getSupabaseAdmin: () => ({ storage: { from: () => ({ remove: async () => { removed++; return { error: removeFails ? Error() : null }; } }) } }) },
  });
  return { api, counts: () => ({ removed, deleted }) };
}
test('strict rejected-upload cleanup retains unsettled, attached, failed-provider and outage ledgers', async () => {
  for (const options of [{ settled: false }, { attached: true }, { offline: true }]) {
    const f = cleanupFixture(options);
    await f.api.cleanupUnattachedUpload('spood-storage:keeper/photo.png', 'keeper');
    assert.deepEqual(f.counts(), { removed: 0, deleted: 0 });
  }
  const failed = cleanupFixture({ removeFails: true });
  await failed.api.cleanupUnattachedUpload('spood-storage:keeper/photo.png', 'keeper');
  assert.deepEqual(failed.counts(), { removed: 1, deleted: 0 });
  const success = cleanupFixture();
  await success.api.cleanupUnattachedUpload('spood-storage:keeper/photo.png', 'keeper');
  assert.deepEqual(success.counts(), { removed: 1, deleted: 1 });
});
test('photo action whose remote upload finishes after cutoff returns typed failure, attaches nothing and cleans owned object', async () => {
  const { mutationIdentity } = await import('../mutation-context');
  const session = await import('./test-session');
  const failure = await import('../mutation-failure');
  let active = false, attachments = 0, cleaned = 0;
  const guard = async () => {
    if (active)
      throw new policy.MaintenanceError();
  };
  const writes = load<typeof import('../maintenance-write')>('../maintenance-write.ts', { 'server-only': {}, './mutation-context': { mutationIdentity }, './admin/maintenance-access': { guardMaintenance: guard, guardMaintenanceAfterWrite: guard }, './spider-write-policy': { assertSpiderWritableInTransaction: async () => {} }, './db': { prisma: { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ photo: { create: async () => attachments++ } }) } } });
  const boundary = load<typeof import('../mutation-boundary')>('../mutation-boundary.ts', { 'server-only': {}, './admin/maintenance-policy': policy, './admin/maintenance-access': { guardMaintenance: guard }, './mutation-failure': failure, './mutation-context': { mutationIdentity }, './admin/test-session': session, './admin/test-session-store': { resolveRequestIdentity: async () => ({ actorId: 'keeper', effectiveUserId: 'keeper', testSessionId: null, contextVersion: 'a'.repeat(64) }), auditTestMutation: async () => { } } });
  const action = load<typeof import('../../app/actions/care-habitat')>('../../app/actions/care-habitat.ts', {
    '@/lib/admin/maintenance-policy': policy, '@/lib/maintenance-write': writes, '@/lib/mutation-boundary': boundary, '@/lib/features/gate': { withFeatureGate: (_key: string, work: () => unknown) => work(), resolveUserFeatureGate: async () => 'entitled' },
    '@/lib/care-celebrations': { baselineCelebrations: async () => true, finishCareCelebrations: async () => assert.fail('Cannot celebrate a rejected attachment') }, 'fs/promises': {}, path: {}, 'next/cache': {}, '@/lib/utils': {}, '@/lib/history-mutations': {}, '@/lib/db': {}, '@/lib/spider-slots': {}, '@/lib/spider-write-policy': {}, '@/lib/write-validation': {},
    '@/lib/uploads': { saveImageUpload: async () => { active = true; return { url: 'spood-storage:keeper/new.png' }; }, cleanupUnattachedUpload: async (url: string, id: string) => { assert.equal(url, 'spood-storage:keeper/new.png'); assert.equal(id, 'keeper'); cleaned++; } },
    '@/app/actions/care-shared': { getCareWriteUser: async () => ({ id: 'keeper' }), ownedSpider: async () => ({ id: 'spider', name: 'spider' }), asOptionalString: () => '', revalidateSpider: () => assert.fail('Cannot refresh a rejected attachment') },
  }, { File, FormData });
  const form = new FormData();
  form.set('mutationContext', 'a'.repeat(64));
  form.set('photo', new File(['image'], 'image.png', { type: 'image/png' }));
  const result = await action.addSpiderPhoto('spider', form);
  assert.equal(result.ok, false);
  assert.ok('code' in result && result.code === 'maintenance');
  assert.equal(attachments, 0);
  assert.equal(cleaned, 1);
});

test('cron cutoff does not record a failed billing retry for unadmitted work', async () => {
  const { reconcileDueBilling } = await import('../billing-reconciliation');
  let writes=0;
  await assert.rejects(reconcileDueBilling({
    prisma:{user:{findMany:async()=>[{id:'keeper',stripeCustomerId:'customer',billingCheckFailures:0}],updateMany:async()=>{writes++;return {count:1};}}} as never,
    reconcileCustomer:async()=>{throw new policy.MaintenanceError();},now:new Date(),logger:{error(){}}
  }),policy.MaintenanceError);
  assert.equal(writes,0);
});
