/** Pure-fixture tests for src/lib/admin/legacy-entitlements.ts: the single
 * tier → legacy-plan mapping and the read-time effective-entitlements
 * resolver. Never touches the database — the resolver's inputs are plain
 * fixture objects shaped like prisma include results. Run with:
 *   npx tsx --test src/lib/admin/legacy-entitlements.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECTIVE_SUBSCRIPTION_STATUSES,
  LEGACY_PLAN_SPECS,
  isEffectiveSubscription,
  legacyPlanNameForTier,
  loadLegacyPlanSource,
  mapLegacyTier,
  resolveEffectiveEntitlements,
} from './legacy-entitlements';
import type { EntitlementUser, LegacyPlanSource, PlanSnapshot } from './legacy-entitlements';

const NOW = new Date('2026-09-27T12:00:00Z');

/** Legacy plan snapshots as loadLegacyPlanSource would return them from the
 * database — deliberately NOT the compile-time designation (admin edited the
 * free plan's features after backfill), proving the resolver reads the
 * passed-in translations rather than LEGACY_PLAN_SPECS. */
const FREE_PLAN: PlanSnapshot = {
  name: 'Free – Legacy',
  featureTranslations: [
    { enabled: true, feature: { key: 'spood.list.view' } },
    { enabled: false, feature: { key: 'care.feed.log' } },
  ],
};
const PRO_PLAN: PlanSnapshot = {
  name: 'Pro – Legacy',
  featureTranslations: [
    { enabled: true, feature: { key: 'spood.list.view' } },
    { enabled: true, feature: { key: 'care.feed.log' } },
    { enabled: true, feature: { key: 'universe.view' } },
  ],
};
const LEGACY_PLANS: LegacyPlanSource = { free: FREE_PLAN, pro: PRO_PLAN };

function userWith(subscriptions: EntitlementUser['subscriptions'], plan = 'free'): EntitlementUser {
  return { plan, subscriptions };
}

const activeOn = (plan: PlanSnapshot) => ({ status: 'ACTIVE', expiresAt: null, plan });

test('the mapping sends free → "Free – Legacy" and pro → "Pro – Legacy" (both tiers)', () => {
  assert.equal(mapLegacyTier('free'), 'free');
  assert.equal(mapLegacyTier('pro'), 'pro');
  assert.equal(legacyPlanNameForTier('free'), 'Free – Legacy');
  assert.equal(legacyPlanNameForTier('pro'), 'Pro – Legacy');
  assert.equal(LEGACY_PLAN_SPECS.free.name, 'Free – Legacy');
  assert.equal(LEGACY_PLAN_SPECS.pro.name, 'Pro – Legacy');
});

test('resolver picks an ACTIVE subscription\'s plan features over the tier fallback', () => {
  const entitlements = resolveEffectiveEntitlements(
    userWith([activeOn(PRO_PLAN)], 'free'), LEGACY_PLANS, NOW);
  assert.equal(entitlements.source, 'subscription');
  assert.equal(entitlements.tier, null);
  assert.equal(entitlements.planName, 'Pro – Legacy');
  assert.deepEqual(entitlements.featureKeys, ['spood.list.view', 'care.feed.log', 'universe.view']);
});

test('resolver falls back to tier-derived legacy features when no subscription is effective', () => {
  const entitlements = resolveEffectiveEntitlements(userWith([], 'pro'), LEGACY_PLANS, NOW);
  assert.equal(entitlements.source, 'tier');
  assert.equal(entitlements.tier, 'pro');
  assert.equal(entitlements.planName, 'Pro – Legacy');
  assert.deepEqual(entitlements.featureKeys, ['spood.list.view', 'care.feed.log', 'universe.view']);
  // The free tier's fallback honors the (edited) DB translations, not the spec.
  const free = resolveEffectiveEntitlements(userWith([], 'free'), LEGACY_PLANS, NOW);
  assert.deepEqual(free.featureKeys, ['spood.list.view']);
});

test('resolver with an unknown or missing tier fails loudly on the fallback path', () => {
  for (const tier of [null, undefined, '', 'premium', 'Pro', 'FREE', 'demo']) {
    assert.throws(() => resolveEffectiveEntitlements({ plan: tier, subscriptions: [] },
      LEGACY_PLANS, NOW), /Unmapped legacy plan tier/, `tier ${String(tier)} must abort`);
  }
});

test('expired, canceled, and past subscriptions do not count; the tier fallback applies', () => {
  const entitlements = resolveEffectiveEntitlements(userWith([
    { status: 'CANCELED', expiresAt: null, plan: PRO_PLAN },
    { status: 'ACTIVE', expiresAt: new Date('2026-09-27T11:59:59Z'), plan: PRO_PLAN },
    { status: 'EXPIRED', expiresAt: null, plan: PRO_PLAN },
  ], 'free'), LEGACY_PLANS, NOW);
  assert.equal(entitlements.source, 'tier');
  assert.deepEqual(entitlements.featureKeys, ['spood.list.view']);
});

test('TRIALING and un-expired PAST_DUE subscriptions count as effective', () => {
  for (const status of ['TRIALING', 'PAST_DUE']) {
    const entitlements = resolveEffectiveEntitlements(
      userWith([{ status, expiresAt: new Date('2026-09-27T13:00:00Z'), plan: FREE_PLAN }], 'pro'),
      LEGACY_PLANS, NOW);
    assert.equal(entitlements.source, 'subscription');
    assert.equal(entitlements.planName, 'Free – Legacy');
  }
});

test('the fallback fails loudly when the tier\'s legacy plan was not loaded', () => {
  assert.throws(() =>
    resolveEffectiveEntitlements(userWith([], 'pro'), { free: FREE_PLAN, pro: undefined as never },
      NOW), /was not loaded/);
});

test('disabled translations are excluded; a plan with none resolves to zero keys', () => {
  const entitlements = resolveEffectiveEntitlements(userWith([], 'free'), LEGACY_PLANS, NOW);
  assert.deepEqual(entitlements.featureKeys, ['spood.list.view']);
  const none: LegacyPlanSource = { free: { name: 'Free – Legacy', featureTranslations: [] },
    pro: PRO_PLAN };
  assert.deepEqual(resolveEffectiveEntitlements(userWith([], 'free'), none, NOW).featureKeys, []);
});

test('an effective subscription whose plan translations were not included fails loudly', () => {
  const broken = { status: 'ACTIVE', expiresAt: null,
    plan: { name: 'Pro – Legacy', featureTranslations: null as never } };
  assert.throws(() => resolveEffectiveEntitlements(userWith([broken], 'free'), LEGACY_PLANS, NOW),
    /missing its included plan feature translations/);
});

test('isEffectiveSubscription matches the assignment-service semantics the script relies on', () => {
  assert.deepEqual(EFFECTIVE_SUBSCRIPTION_STATUSES, ['TRIALING', 'ACTIVE', 'PAST_DUE']);
  assert.equal(isEffectiveSubscription({ status: 'ACTIVE', expiresAt: null }, NOW), true);
  assert.equal(isEffectiveSubscription({ status: 'CANCELED', expiresAt: null }, NOW), false);
  assert.equal(isEffectiveSubscription(
    { status: 'ACTIVE', expiresAt: new Date('2026-09-27T11:59:59Z') }, NOW), false);
});

test('loadLegacyPlanSource rejects before the backfill has created the legacy plans', async () => {
  const emptyDb = { plan: { findMany: async () => [] } } as never;
  await assert.rejects(loadLegacyPlanSource(emptyDb), /does not exist yet/);
});
