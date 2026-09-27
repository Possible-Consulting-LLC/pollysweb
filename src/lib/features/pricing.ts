// Pure pricing-summary math for the plan catalog: how public pricing will
// summarize a configured plan. No DB, no side effects, client-safe by design —
// the admin matrix preview recomputes it live from unsaved toggle state.
// src/lib/admin/plan-features.ts re-exports it for server-side callers.
import { FEATURE_REGISTRY, registryFeature } from './registry';

export type PricingSummary = {
  monthlyCents: number | null;
  annualCents: number | null;
  enabledFeatures: Array<{ key: string; name: string; category: string }>;
};

const registryOrder = new Map<string, number>(
  FEATURE_REGISTRY.map((definition, index) => [definition.key, index] as const));

/** Active billing options of the plan supply the advertised prices (null when an
 * interval has none); enabled translations resolve against the code registry,
 * deduped and in registry order. Disabled translations are excluded (missing
 * translations resolve as disabled), and orphaned keys never render as included
 * value — grouping by category is the rendering component's job. */
export function summarizePlanForPricing(
  plan: { id: string },
  options: ReadonlyArray<{ planId: string; interval: string; basePriceCents: number; active: boolean }>,
  translations: ReadonlyArray<{ key: string; enabled: boolean }>,
): PricingSummary {
  const owned = options.filter(option => option.planId === plan.id && option.active);
  const monthly = owned.find(option => option.interval === 'MONTHLY');
  const annual = owned.find(option => option.interval === 'ANNUAL');
  const seen = new Set<string>();
  const enabledFeatures: PricingSummary['enabledFeatures'] = [];
  for (const translation of translations) {
    if (!translation.enabled || seen.has(translation.key)) continue;
    const definition = registryFeature(translation.key);
    if (!definition) continue;
    seen.add(translation.key);
    enabledFeatures.push({ key: definition.key, name: definition.name, category: definition.category });
  }
  enabledFeatures.sort((a, b) => (registryOrder.get(a.key) ?? 0) - (registryOrder.get(b.key) ?? 0));
  return { monthlyCents: monthly?.basePriceCents ?? null, annualCents: annual?.basePriceCents ?? null, enabledFeatures };
}
