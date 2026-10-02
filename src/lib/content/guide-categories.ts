/** Client-safe guide category data: no filesystem or server-only imports, so
 * client components can import it directly. */
export const GUIDE_CATEGORIES = [
  { key: "feeding", label: "Feeding" },
  { key: "water", label: "Water" },
  { key: "molting", label: "Molting" },
  { key: "handling", label: "Handling" },
  { key: "cleaning", label: "Cleaning" },
  { key: "life-stages", label: "Life Stages" },
  { key: "health", label: "Health" },
  { key: "species-profiles", label: "Species Profiles" },
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number]["key"];