import assert from "node:assert/strict";
import test from "node:test";
import { pricingGridClass, annualFreeMonths, ctaForPlan, type PublicPlan } from "./public-pricing";

test("grid classes adapt to plan count", () => {
  assert.equal(pricingGridClass(1), "mx-auto max-w-md");
  assert.equal(pricingGridClass(2), "sm:grid-cols-2 max-w-2xl mx-auto");
  assert.equal(pricingGridClass(3), "sm:grid-cols-2 lg:grid-cols-3");
  assert.equal(pricingGridClass(4), "sm:grid-cols-2 lg:grid-cols-4");
  assert.equal(pricingGridClass(7), "sm:grid-cols-2 lg:grid-cols-4");
});

test("annual free months math", () => {
  assert.equal(annualFreeMonths(199, 1999), 2);
  assert.equal(annualFreeMonths(499, 4999), 2);
  assert.equal(annualFreeMonths(null, 1999), null);
  assert.equal(annualFreeMonths(199, null), null);
  assert.equal(annualFreeMonths(0, 0), null);
  assert.equal(annualFreeMonths(199, 2388), null);
});

test("CTA mapping covers all four branches", () => {
  const free: PublicPlan = { id: "p1", name: "Free", blurb: null, maxSpiders: 1, monthlyCents: 0, annualCents: 0, features: [] };
  const pro: PublicPlan = { id: "p2", name: "Pro", blurb: null, maxSpiders: null, monthlyCents: 499, annualCents: 4999, features: [] };

  assert.deepEqual(ctaForPlan(free, false, false), { label: "Start Free", href: "/register" });
  assert.deepEqual(ctaForPlan(pro, false, false), { label: "Get Pro", href: "/register" });
  assert.deepEqual(ctaForPlan(pro, false, true), { label: "Upgrade to Pro", href: "/upgrade" });
  assert.deepEqual(ctaForPlan(pro, true, true), { label: "Your current plan", href: null });
});