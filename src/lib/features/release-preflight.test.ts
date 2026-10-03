import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGACY_PLAN_SPECS } from "../admin/legacy-entitlements";
import { FEATURE_REGISTRY } from "./registry";
import { checkFeatureReleaseReadiness } from "./release-preflight";

type Feature = { key: string; active: boolean };
type Plan = { name: string; featureTranslations: Array<{ enabled: boolean; feature: { key: string } }> };

const readyFeatures = (): Feature[] => FEATURE_REGISTRY.map(({ key }) => ({ key, active: true }));
const readyPlans = (): Plan[] =>
  Object.values(LEGACY_PLAN_SPECS).map((spec) => ({
    name: spec.name,
    featureTranslations: spec.featureKeys.map((key) => ({ enabled: true, feature: { key } })),
  }));

function db(features: Feature[], plans: Plan[]) {
  return {
    feature: { findMany: async () => features },
    plan: {
      findMany: async ({ where }: { where: { name: { in: string[] } } }) => plans.filter((plan) => where.name.in.includes(plan.name)),
    },
  } as unknown as Parameters<typeof checkFeatureReleaseReadiness>[0];
}

test("a fully prepared database is ready", async () => {
  assert.deepEqual(await checkFeatureReleaseReadiness(db(readyFeatures(), readyPlans())), { ok: true, problems: [] });
});

test("missing and inactive registry features are reported", async () => {
  const features = readyFeatures().filter((feature) => feature.key !== "spood.create");
  features.find((feature) => feature.key === "care.feed.log")!.active = false;
  const result = await checkFeatureReleaseReadiness(db(features, readyPlans()));
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 2);
  assert.match(result.problems[0], /spood\.create.*no Feature row/);
  assert.match(result.problems[1], /care\.feed\.log.*not active/);
});

test("an empty database reports every registry key and both legacy plans", async () => {
  const result = await checkFeatureReleaseReadiness(db([], []));
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, FEATURE_REGISTRY.length + 2);
  assert.ok(result.problems.some((problem) => problem.includes(LEGACY_PLAN_SPECS.free.name)));
  assert.ok(result.problems.some((problem) => problem.includes(LEGACY_PLAN_SPECS.pro.name)));
});

test("a legacy plan that does not enable its documented keys is reported with the gap", async () => {
  const plans = readyPlans();
  const pro = plans.find((plan) => plan.name === LEGACY_PLAN_SPECS.pro.name)!;
  pro.featureTranslations = pro.featureTranslations
    .filter((row) => row.feature.key !== "enclosure.view")
    .map((row) => (row.feature.key === "universe.view" ? { ...row, enabled: false } : row));
  const result = await checkFeatureReleaseReadiness(db(readyFeatures(), plans));
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [
    `Legacy plan "${LEGACY_PLAN_SPECS.pro.name}" does not enable 2 documented feature(s): enclosure.view, universe.view.`,
  ]);
});
