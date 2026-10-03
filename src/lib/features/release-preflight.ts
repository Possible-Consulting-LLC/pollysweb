import type { Prisma } from "@prisma/client";
import { LEGACY_PLAN_SPECS, type LegacyTier } from "@/lib/admin/legacy-entitlements";
import { FEATURE_REGISTRY } from "./registry";

export type FeatureReleaseReadiness = { ok: boolean; problems: string[] };

type PreflightDb = Pick<Prisma.TransactionClient, "feature" | "plan">;

/** Run before a deploy: an unprepared database makes every gate fail closed ("coming soon" for
 * everyone), so this lists what is missing instead of letting the release go out silently. */
export async function checkFeatureReleaseReadiness(db: PreflightDb): Promise<FeatureReleaseReadiness> {
  const problems: string[] = [];
  const legacyNames = Object.values(LEGACY_PLAN_SPECS).map((spec) => spec.name);
  const [features, plans] = await Promise.all([
    db.feature.findMany({ select: { key: true, active: true } }),
    db.plan.findMany({
      where: { name: { in: legacyNames } },
      select: { name: true, featureTranslations: { select: { enabled: true, feature: { select: { key: true } } } } },
    }),
  ]);

  const featureByKey = new Map(features.map((feature) => [feature.key, feature]));
  for (const { key } of FEATURE_REGISTRY) {
    const feature = featureByKey.get(key);
    if (!feature) problems.push(`Feature "${key}" has no Feature row; sync the registry from the admin features page.`);
    else if (!feature.active) problems.push(`Feature "${key}" is not active (released).`);
  }

  const planByName = new Map(plans.map((plan) => [plan.name, plan]));
  for (const tier of Object.keys(LEGACY_PLAN_SPECS) as LegacyTier[]) {
    const spec = LEGACY_PLAN_SPECS[tier];
    const plan = planByName.get(spec.name);
    if (!plan) {
      problems.push(`Legacy plan "${spec.name}" is missing; ${tier}-tier users cannot resolve any feature.`);
      continue;
    }
    const enabled = new Set(plan.featureTranslations.filter((row) => row.enabled).map((row) => row.feature.key));
    const missing = spec.featureKeys.filter((key) => !enabled.has(key));
    if (missing.length)
      problems.push(`Legacy plan "${spec.name}" does not enable ${missing.length} documented feature(s): ${missing.join(", ")}.`);
  }

  return { ok: problems.length === 0, problems };
}
