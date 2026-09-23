export const SEX_OPTIONS = ["Female", "Male", "Unknown"] as const;

export const THEME_OPTIONS = [
  {
    value: "cosmic",
    label: "Light",
  },
  {
    value: "midnight",
    label: "Dark",
  },
  {
    value: "system",
    label: "System",
  },
] as const;

export type AppTheme = (typeof THEME_OPTIONS)[number]["value"];

export function normalizeTheme(value: string | null | undefined): AppTheme {
  if (value === "midnight" || value === "cosmic" || value === "system") {
    return value;
  }
  return "cosmic";
}

export const PREMOLT_STATUSES = [
  "Normal",
  "Possible premolt",
  "Premolt",
  "Molting",
  "Post-molt recovery",
] as const;

export const FEEDING_OUTCOMES = [
  "Ate normally",
  "Ate partially",
  "Showed interest but did not eat",
  "Ignored prey",
  "Refused prey",
  "Appeared stressed / afraid of prey",
] as const;

export const SUCCESSFUL_FEEDING_OUTCOMES = [
  "Ate normally",
  "Ate partially",
] as const;

export const PREY_TYPES = [
  "fruit flies",
  "house flies",
  "blue bottle flies",
  "mealworms",
  "mini mealworms",
  "waxworms",
  "crickets",
  "roaches",
  "other",
] as const;

export const HYDRATION_METHODS = [
  "Misted enclosure",
  "Water droplet on glass",
  "Plain water on Q-tip",
  "Sweet water on Q-tip",
  "Water dish refilled",
] as const;

export const BODY_CONDITIONS = [
  "Very thin",
  "Thin",
  "Normal",
  "Plump",
  "Very full",
] as const;

export const OBSERVATION_KINDS = [
  "built a new hammock",
  "unusually active",
  "hiding more than usual",
  "explored enclosure",
  "refused food",
  "moved hammock",
  "drinking water",
  "play and interaction",
  "behavior note",
  "custom note",
] as const;

/** Presentation only: keep observation keys stable for saved history and badges. */
export function observationLabel(kind: string): string {
  return kind === "play and interaction" ? "Play & interaction" : kind.charAt(0).toUpperCase() + kind.slice(1);
}

export const ENCLOSURE_TYPES = [
  "acrylic",
  "glass",
  "mesh",
  "custom",
  "other",
] as const;

export const CARE_STATUSES = [
  "All good",
  "Feeding due",
  "Mist today",
  "Possible premolt",
  "In premolt",
  "Molting",
  "Recently molted",
  "Post-molt recovery",
] as const;

export type CareStatus = (typeof CARE_STATUSES)[number];
export type PremoltStatus = (typeof PREMOLT_STATUSES)[number];

/** Built-in profile illustrations for new spoods (and fallbacks). */
export const DEFAULT_SPOOOD_AVATARS = [
  { id: "star", label: "Star", src: "/spoods/defaults/star.svg" },
  { id: "clementine", label: "Clementine", src: "/spoods/defaults/clementine.svg" },
  { id: "vylit", label: "Vylit", src: "/spoods/defaults/vylit.svg" },
  { id: "mochi", label: "Mochi", src: "/spoods/defaults/mochi.svg" },
  { id: "midnight", label: "Midnight", src: "/spoods/defaults/midnight.svg" },
] as const;

export const DEFAULT_SPOOOD_AVATAR_SRC = DEFAULT_SPOOOD_AVATARS[0].src;

export function isDefaultSpoodAvatar(src: string) {
  const path = src.split("?")[0];
  return (
    DEFAULT_SPOOOD_AVATARS.some((avatar) => avatar.src === path) ||
    // Older portrait paths still count as built-ins for existing profiles.
    [
      "/spoods/star.svg",
      "/spoods/clementine.svg",
      "/spoods/vylit.svg",
      "/spoods/mochi.svg",
      "/spoods/wednesday.svg",
      "/spoods/defaults/wednesday.svg",
      "/spoods/midnight.svg",
    ].includes(path)
  );
}
