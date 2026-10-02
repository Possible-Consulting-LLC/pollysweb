export type FeatureGateState = "entitled" | "upsell" | "coming-soon";

export function resolveFeatureGate(input: { active: boolean; entitled: boolean }): FeatureGateState {
  if (!input.active) return "coming-soon";
  return input.entitled ? "entitled" : "upsell";
}
