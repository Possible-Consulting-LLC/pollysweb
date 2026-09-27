/** Pure-fixture tests for scripts/staging-legacy-subscriptions.ts: mapping,
 * idempotency decisions, feature-designation validation, and the staging
 * environment guard. Never touches the database. Run with:
 *   npx tsx --test scripts/staging-legacy-subscriptions.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_PLAN_SPECS,
  ORPHANED_FEATURE_KEYS,
  assertLegacyBackfillEnvironment,
  backfillReason,
  decideUserAction,
  effectiveSubscription,
  mapLegacyTier,
  validateDesignatedFeatures,
} from './staging-legacy-subscriptions';

const STAGING_ENV: Record<string, string | undefined> = {
  SPOODLY_ENV: 'staging',
  DATABASE_URL: 'postgresql://postgres:secret@db.nfdecdylxcmuypxodppe.supabase.co:5432/postgres?sslmode=require',
  DIRECT_URL: 'postgresql://postgres:secret@db.nfdecdylxcmuypxodppe.supabase.co:5432/postgres?sslmode=require',
  SUPABASE_URL: 'https://nfdecdylxcmuypxodppe.supabase.co',
};

test('guard aborts unless SPOODLY_ENV is exactly staging', () => {
  for (const env of [{}, { SPOODLY_ENV: 'production' }, { SPOODLY_ENV: 'staging ' },
    { SPOODLY_ENV: 'Staging' }, { SPOODLY_ENV: undefined }]) {
    assert.throws(() => assertLegacyBackfillEnvironment(env), /SPOODLY_ENV must explicitly be staging/,
      `env ${JSON.stringify(env)} must abort`);
  }
  assert.doesNotThrow(() => assertLegacyBackfillEnvironment(STAGING_ENV));
});

test('guard aborts on a staging env whose configuration fails the staging guard', () => {
  assert.throws(() => assertLegacyBackfillEnvironment({ SPOODLY_ENV: 'staging' }));
  assert.throws(() => assertLegacyBackfillEnvironment({ ...STAGING_ENV, DATABASE_URL: 'postgresql://postgres:secret@evil.example.com:5432/postgres' }));
});

test('mapLegacyTier normalizes pro and free to the Legacy tier keys', () => {
  assert.equal(mapLegacyTier('pro'), 'pro');
  assert.equal(mapLegacyTier('free'), 'free');
  assert.equal(LEGACY_PLAN_SPECS.pro.name, 'Pro – Legacy');
  assert.equal(LEGACY_PLAN_SPECS.free.name, 'Free – Legacy');
});

test('mapLegacyTier fails loudly on null, empty, or unknown tiers', () => {
  for (const tier of [null, undefined, '', 'premium', 'Pro', 'FREE', 'demo']) {
    assert.throws(() => mapLegacyTier(tier), /Unmapped legacy plan tier/,
      `tier ${String(tier)} must abort`);
  }
});

test('decideUserAction skips when the effective subscription is already on the mapped Legacy plan', () => {
  const freeId = 'plan-free-legacy', proId = 'plan-pro-legacy';
  assert.equal(decideUserAction(freeId, { planId: freeId }), 'skip');
  assert.equal(decideUserAction(proId, { planId: proId }), 'skip');
});

test('decideUserAction supersedes an effective subscription on any other plan', () => {
  assert.equal(decideUserAction('plan-pro-legacy', { planId: 'cmuj59cg40001car6p821fzk6' }), 'supersede');
  // A cross-legacy mismatch (wrong tier's legacy plan) is corrected, not skipped.
  assert.equal(decideUserAction('plan-pro-legacy', { planId: 'plan-free-legacy' }), 'supersede');
});

test('decideUserAction creates when no effective subscription exists', () => {
  assert.equal(decideUserAction('plan-pro-legacy', null), 'create');
});

test('effectiveSubscription only honors TRIALING/ACTIVE/PAST_DUE rows that have not expired', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const active = { status: 'ACTIVE', expiresAt: null, planId: 'legacy' };
  assert.equal(effectiveSubscription([active], now), active);
  assert.equal(effectiveSubscription([
    { status: 'CANCELED', expiresAt: null, planId: 'old' },
    { status: 'EXPIRED', expiresAt: null, planId: 'older' },
  ], now), null);
  assert.equal(effectiveSubscription([
    { status: 'ACTIVE', expiresAt: new Date('2026-09-27T11:59:59Z'), planId: 'stale' },
  ], now), null);
  assert.equal(effectiveSubscription([
    { status: 'TRIALING', expiresAt: new Date('2026-09-27T13:00:00Z'), planId: 'trial' },
  ], now)?.planId, 'trial');
});

test('designated feature lists are registered, deduplicated, and never include the photo.upload orphan', () => {
  assert.deepEqual(ORPHANED_FEATURE_KEYS, ['photo.upload']);
  for (const [tier, spec] of Object.entries(LEGACY_PLAN_SPECS)) {
    const validated = validateDesignatedFeatures(spec.featureKeys);
    assert.ok(!(validated instanceof Error), `${tier}: ${validated instanceof Error ? validated.message : ''}`);
    assert.ok(!(spec.featureKeys as readonly string[]).includes('photo.upload'), `${tier} must not designate photo.upload`);
  }
  // Free's designation is a subset of Pro's (the legacy tiers were strictly nested).
  assert.ok(LEGACY_PLAN_SPECS.free!.featureKeys.every(key => LEGACY_PLAN_SPECS.pro!.featureKeys.includes(key)));
});

test('designated keys pin the expected Pro and Free feature sets', () => {
  assert.deepEqual([...LEGACY_PLAN_SPECS.pro!.featureKeys].sort(), [
    'activity.delete', 'activity.edit', 'activity.full_history.view', 'care.body_condition.log',
    'care.feed.log', 'care.hydrate.log', 'care.molt.log', 'care.observe.log', 'care.play.log',
    'enclosure.manage', 'enclosure.view', 'housekeeping.log', 'journey.badges.view', 'journey.check_in',
    'journey.streaks.view', 'photo.delete', 'photo.gallery.view', 'photo.profile.set', 'spood.list.view',
    'spood.memorialize', 'universe.view',
  ]);
  assert.deepEqual([...LEGACY_PLAN_SPECS.free!.featureKeys].sort(), ['care.feed.log', 'spood.list.view']);
  // Legacy entitlements carry over: free allows one spood, pro is unlimited.
  assert.equal(LEGACY_PLAN_SPECS.free!.maxSpiders, 1);
  assert.equal(LEGACY_PLAN_SPECS.pro!.maxSpiders, null);
});

test('validateDesignatedFeatures rejects unregistered keys and duplicates', () => {
  const unknown = validateDesignatedFeatures(['spood.list.view', 'care.bogus.log']);
  assert.ok(unknown instanceof Error);
  assert.match(unknown.message, /Unknown feature key/);
  const duplicate = validateDesignatedFeatures(['spood.list.view', 'spood.list.view']);
  assert.ok(duplicate instanceof Error);
  assert.match(duplicate.message, /more than once/);
  const empty = validateDesignatedFeatures([]);
  assert.ok(empty instanceof Error);
  assert.match(empty.message, /at least one feature key/);
});

test('validateDesignatedFeatures rejects the photo.upload orphan loudly even though the registry still lists it', () => {
  const error = validateDesignatedFeatures(['spood.list.view', 'photo.upload']);
  assert.ok(error instanceof Error);
  assert.match(error.message, /photo\.upload/);
  assert.match(error.message, /never assignable/);
});

test('backfillReason is audit-safe: short, honest, and free of @ or control characters', () => {
  for (const tier of ['pro', 'free']) {
    const reason = backfillReason(tier);
    assert.ok(reason.length > 0 && reason.length <= 500);
    assert.ok(!/[\u0000-\u001f\u007f@]/.test(reason), reason);
    assert.match(reason, /Legacy backfill/);
    assert.match(reason, new RegExp(`plan=${tier}\\b`));
  }
});
