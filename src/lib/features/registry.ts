// Typed feature registry: the code-owned source of feature keys, transcribed
// verbatim from docs/superpowers/audits/2026-09-26-feature-entry-points.md.
// Pure data and lookups — no DB, no side effects, no active/release concept
// (release state lives in the database).

export type FeatureDefinition = { key: string; name: string; description: string; category: string };

export const FEATURE_REGISTRY = [
  // spoods (7)
  {
    key: "spood.create",
    name: "Add a spood",
    description: "Create a new active spood (subject to the plan's `maxSpiders` allowance).",
    category: "spoods",
  },
  {
    key: "spood.about.view",
    name: "View spood profile",
    description: "View a spood's About section and profile details.",
    category: "spoods",
  },
  {
    key: "spood.about.edit",
    name: "Edit spood profile",
    description: "Edit the About section and profile fields of an owned spood.",
    category: "spoods",
  },
  {
    key: "spood.list.view",
    name: "Browse spood collection",
    description: "Browse, search, and filter the spood list.",
    category: "spoods",
  },
  {
    key: "spood.story.view",
    name: "View spood story",
    description: "View a spood's life-story timeline of events and photos.",
    category: "spoods",
  },
  {
    key: "spood.memorialize",
    name: "Memorialize a spood",
    description: "Memorialize a spood, which frees its active slot.",
    category: "spoods",
  },
  {
    key: "spood.memorial.restore",
    name: "Restore a memorial",
    description: "Restore a memorialized spood to active care (blocked when it would exceed the plan's allowance).",
    category: "spoods",
  },
  // care (8)
  {
    key: "care.feed.log",
    name: "Log feeding",
    description: "Record a feeding (quick log and full detail).",
    category: "care",
  },
  {
    key: "care.hydrate.log",
    name: "Log hydration",
    description: "Record a misting/hydration event.",
    category: "care",
  },
  {
    key: "care.molt.log",
    name: "Log molt",
    description: "Record a completed molt with instar details.",
    category: "care",
  },
  {
    key: "care.observe.log",
    name: "Log observation",
    description: "Record a free-text observation.",
    category: "care",
  },
  {
    key: "care.play.log",
    name: "Log interaction",
    description: "Record a play/interaction moment.",
    category: "care",
  },
  {
    key: "care.body_condition.log",
    name: "Log body condition",
    description: "Record a body-condition assessment.",
    category: "care",
  },
  {
    key: "care.premolt.manage",
    name: "Manage premolt status",
    description: "Set and update a spood's premolt/life-stage status.",
    category: "care",
  },
  {
    key: "care.status.view",
    name: "View care status",
    description: "View the derived essential-care status grid for each spood.",
    category: "care",
  },
  // habitat (3)
  {
    key: "enclosure.view",
    name: "View enclosure",
    description: "View a spood's enclosure details on its profile.",
    category: "habitat",
  },
  {
    key: "enclosure.manage",
    name: "Manage enclosure",
    description: "Create or update a spood's enclosure record.",
    category: "habitat",
  },
  {
    key: "housekeeping.log",
    name: "Log housekeeping",
    description: "Record enclosure maintenance (cleaning, substrate, etc.).",
    category: "habitat",
  },
  // photos (4)
  {
    key: "photo.upload",
    name: "Upload photos",
    description: "Upload photos of a spood, including during Add-a-Spood.",
    category: "photos",
  },
  {
    key: "photo.gallery.view",
    name: "View photo gallery",
    description: "View a spood's photo gallery, lightbox, and photo history.",
    category: "photos",
  },
  {
    key: "photo.profile.set",
    name: "Set profile photo",
    description: "Choose an uploaded photo as a spood's profile portrait.",
    category: "photos",
  },
  {
    key: "photo.delete",
    name: "Delete photos",
    description: "Remove an uploaded photo and detach it from history.",
    category: "photos",
  },
  // journey (4)
  {
    key: "universe.view",
    name: "View care journey",
    description: "View the shared care-journey overview page (constellation hub).",
    category: "journey",
  },
  {
    key: "journey.check_in",
    name: "Complete care day",
    description: "Complete today's care day, with celebratory feedback.",
    category: "journey",
  },
  {
    key: "journey.streaks.view",
    name: "View care streaks",
    description: "View the recent-care meter and streak card.",
    category: "journey",
  },
  {
    key: "journey.badges.view",
    name: "View rewards and stories",
    description: "View the reward gallery of earned badges and spood story progress.",
    category: "journey",
  },
  // activity (3)
  {
    key: "activity.full_history.view",
    name: "View activity history",
    description: "View and filter the recent-activity feed across all spoods.",
    category: "activity",
  },
  {
    key: "activity.edit",
    name: "Edit activity entries",
    description: "Correct the time or details of a past care event.",
    category: "activity",
  },
  {
    key: "activity.delete",
    name: "Delete activity entries",
    description: "Remove an incorrect care-event record.",
    category: "activity",
  },
  // settings (5)
  {
    key: "settings.profile.manage",
    name: "Manage account profile",
    description: "Edit display name, default timezone, and account preferences.",
    category: "settings",
  },
  {
    key: "settings.theme.customize",
    name: "Customize theme",
    description: "Switch between light and dark appearance.",
    category: "settings",
  },
  {
    key: "settings.password.change",
    name: "Change password",
    description: "Change the account password.",
    category: "settings",
  },
  {
    key: "settings.email.change",
    name: "Change email address",
    description: "Request and confirm an email-address change (customer flow).",
    category: "settings",
  },
  {
    key: "settings.social.link",
    name: "Link and unlink social sign-in",
    description: "Link a social provider to the account and disconnect it.",
    category: "settings",
  },
] as const satisfies readonly FeatureDefinition[];

const REGISTRY_BY_KEY: ReadonlyMap<string, FeatureDefinition> = new Map(
  FEATURE_REGISTRY.map(feature => [feature.key, feature]),
);

export function isRegisteredFeatureKey(key: string): boolean {
  return REGISTRY_BY_KEY.has(key);
}

export function registryFeature(key: string): FeatureDefinition | null {
  return REGISTRY_BY_KEY.get(key) ?? null;
}

// Sorted alphabetically for a deterministic, first-appearance-independent order.
export function registryCategories(): string[] {
  return [...new Set(FEATURE_REGISTRY.map(feature => feature.category))].sort();
}
