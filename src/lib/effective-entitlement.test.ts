import assert from "node:assert/strict";
import { test } from "node:test";
import { effectivePro } from "./effective-entitlement";

const now = new Date("2026-09-17T12:00:00.000Z");

test("manual Pro without a Stripe customer remains available", () => {
  assert.equal(effectivePro({ isDemo: false, demoPlan: null, plan: "pro", stripeCustomerId: null, subscriptionStatus: null, billingLastCheckedAt: null }, now), true);
});

test("past-due Stripe status never grants Pro", () => {
  assert.equal(effectivePro({ isDemo: false, demoPlan: null, plan: "pro", stripeCustomerId: "cus_1", subscriptionStatus: "past_due", billingLastCheckedAt: now }, now), false);
});

test("current active Stripe status grants Pro", () => {
  assert.equal(effectivePro({ isDemo: false, demoPlan: null, plan: "pro", stripeCustomerId: "cus_1", subscriptionStatus: "active", billingLastCheckedAt: now }, now), true);
});

test("an active Stripe snapshot older than 24 hours cannot authorize Pro additions", () => {
  const old = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 1);
  assert.equal(effectivePro({ isDemo: false, demoPlan: null, plan: "pro", stripeCustomerId: "cus_1", subscriptionStatus: "active", billingLastCheckedAt: old }, now), false);
});

test("a Stripe-backed Pro account with no successful reconciliation cannot authorize Pro additions", () => {
  assert.equal(effectivePro({ isDemo: false, demoPlan: null, plan: "pro", stripeCustomerId: "cus_1", subscriptionStatus: "active", billingLastCheckedAt: null }, now), false);
});

test('demo tier overrides billing and untagging immediately restores billing', () => {
  const free = { isDemo: false, demoPlan: null, plan: 'free', stripeCustomerId: null, subscriptionStatus: null, billingLastCheckedAt: null };
  assert.equal(effectivePro({ ...free, isDemo: true, demoPlan: 'pro' }, now), true);
  assert.equal(effectivePro({ ...free, plan: 'pro', isDemo: true, demoPlan: 'free' }, now), false);
  assert.equal(effectivePro({ ...free, isDemo: false, demoPlan: 'pro' }, now), false);
  assert.equal(effectivePro({ ...free, isDemo: true, demoPlan: null }, now), false);
});
