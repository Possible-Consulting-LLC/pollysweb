/** Legacy tier → legacy plan mapping (SINGLE SOURCE OF TRUTH) and the
 * read-time effective-entitlements resolver.
 *
 * ── CONTRACT (gating-phase design) ──────────────────────────────────────────
 * This module is PURE DATA RESOLUTION. It never writes, never enforces, and
 * no product flow treats its output as authorization by itself.
 *
 * - The legacy `User.plan` tier ('free' | 'pro') maps onto exactly one legacy
 *   plan name each ('Free – Legacy' / 'Pro – Legacy'), exported both as the
 *   per-tier specs and as LEGACY_PLAN_NAMES — the single source every consumer
 *   reads (the wizard's assignable-plans exclusion; the subscriptions page's
 *   tier-derived virtual rows).
 * - `resolveEffectiveEntitlements` resolves a user's effective feature keys:
 *   1. If the user holds an effective subscription (TRIALING/ACTIVE/PAST_DUE
 *      and not expired — the same semantics as the plan-assignment service),
 *      the entitlements are that subscription's plan's ENABLED feature keys.
 *   2. Otherwise they derive from the user's tier via the mapping above,
 *      using the mapped legacy plan's ENABLED feature translations as loaded
 *      from the database (never the compile-time designation, so admin edits
 *      are honored).
 * - Unknown/missing tiers and unloaded legacy plans FAIL LOUDLY (throw) —
 *   resolution never silently degrades to an empty (permission-less) set.
 *
 * Read-time usage (how a gating-phase caller loads inputs):
 *   const legacyPlans = await loadLegacyPlanSource(prisma); // cheap; cacheable
 *   const user = await prisma.user.findUniqueOrThrow({
 *     where: { id },
 *     include: { subscriptions: { include: { plan: { include: {
 *       featureTranslations: { include: { feature: { select: { key: true } } } },
 *     } } } } },
 *   });
 *   const entitlements = resolveEffectiveEntitlements(user, legacyPlans, new Date());
 *
 * `resolveEffectiveEntitlements` re-checks status/expiry itself, so the caller
 * may include all of a user's subscriptions; the first effective row wins, so
 * pass an `orderBy` (e.g. startedAt desc) for determinism. */
import type { Prisma, PrismaClient } from '@prisma/client';

/** The legacy tiers map onto exactly these plan names. `featureKeys` is the
 * original designation of each tier's feature set (kept as documentation and
 * pinned by tests); read-time resolution always uses the database's current
 * FeaturePlanTranslation rows instead of this list. */
export const LEGACY_PLAN_SPECS = {
  free: {
    name: 'Free – Legacy',
    description: 'Backfilled from the legacy staging free tier.',
    maxSpiders: 1,
    featureKeys: ['spood.list.view', 'care.feed.log'],
  },
  pro: {
    name: 'Pro – Legacy',
    description: 'Backfilled from the legacy staging pro tier.',
    maxSpiders: null,
    featureKeys: [
      'spood.list.view', 'care.feed.log', 'care.hydrate.log', 'care.molt.log',
      'care.observe.log', 'care.play.log', 'care.body_condition.log',
      'enclosure.view', 'enclosure.manage', 'housekeeping.log',
      'photo.gallery.view', 'photo.profile.set', 'photo.delete',
      'spood.memorialize', 'journey.check_in', 'journey.streaks.view',
      'journey.badges.view', 'universe.view', 'activity.full_history.view',
      'activity.edit', 'activity.delete',
    ],
  },
} as const satisfies Record<string, {
  name: string; description: string; maxSpiders: number | null; featureKeys: readonly string[];
}>;
export type LegacyTier = keyof typeof LEGACY_PLAN_SPECS;

/** The two legacy plan names, derived from the mapping above — the single
 * source the wizard's assignable-plans exclusion (and every "is this a legacy
 * plan?" check) reads. */
export const LEGACY_PLAN_NAMES: readonly string[] =
  Object.values(LEGACY_PLAN_SPECS).map(spec => spec.name);

const TIERS: readonly string[] = Object.keys(LEGACY_PLAN_SPECS);

/** Legacy User.plan tier → normalized Legacy tier key. Strict: only the exact
 * legacy values 'free'/'pro' map; anything else (including null/empty or case
 * variants) fails loudly so an unexpected tier never resolves silently. */
export function mapLegacyTier(tier: string | null | undefined): LegacyTier {
  if (typeof tier !== 'string' || !TIERS.includes(tier))
    throw new Error(`Unmapped legacy plan tier ${JSON.stringify(tier ?? null)}; aborting.`);
  return tier as LegacyTier;
}

// ---------------------------------------------------------------------------
// Effective-entitlements resolver (pure; the gating phase adopts this)
// ---------------------------------------------------------------------------

/** A subscription is effective when its status is TRIALING/ACTIVE/PAST_DUE and
 * it has not expired — THE single definition, shared by the plan-assignment
 * service, the plans services, and the subscriptions actions (the row
 * predicate and its Prisma where-clause form below). */
export const EFFECTIVE_SUBSCRIPTION_STATUSES: readonly string[] =
  ['TRIALING', 'ACTIVE', 'PAST_DUE'];

export function isEffectiveSubscription(
  row: { status: string; expiresAt: Date | null }, now: Date): boolean {
  return EFFECTIVE_SUBSCRIPTION_STATUSES.includes(row.status) &&
    (row.expiresAt === null || row.expiresAt.getTime() > now.getTime());
}

/** The same predicate as a Prisma where-clause, for count/update/findMany
 * queries (plan history, end-dating prior subscriptions, the subscriptions
 * page's union). Kept beside isEffectiveSubscription so the query and row
 * forms of "effective subscription" can never drift. */
export const effectiveSubscriptionWhere =
  (): Prisma.UserSubscriptionWhereInput => ({
    status: { in: [...EFFECTIVE_SUBSCRIPTION_STATUSES] },
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  });

export type PlanFeatureSnapshot = { enabled: boolean; feature: { key: string } };

/** The slice of a Plan the resolver reads: its name and feature translations. */
export type PlanSnapshot = {
  name: string;
  featureTranslations: ReadonlyArray<PlanFeatureSnapshot>;
};

/** The slice of a UserSubscription the resolver reads. The `plan` relation is
 * required (database FK); callers must include it. */
export type SubscriptionSnapshot = {
  status: string;
  expiresAt: Date | null;
  plan: PlanSnapshot;
};

/** The slice of a User the resolver reads: the legacy tier column and their
 * subscriptions (all of them — the resolver filters to the effective one).
 * `plan` tolerates undefined so a missing tier fails loudly via mapLegacyTier. */
export type EntitlementUser = {
  plan: string | null | undefined;
  subscriptions: ReadonlyArray<SubscriptionSnapshot>;
};

/** Pre-loaded legacy plan snapshots keyed by tier, via `loadLegacyPlanSource`.
 * Injected (rather than queried) to keep the resolver pure and testable
 * without a database; callers can load once and cache. */
export type LegacyPlanSource = Readonly<Record<LegacyTier, PlanSnapshot>>;

export type EffectiveEntitlements = {
  /** Enabled feature keys the user is entitled to, in plan-translation order. */
  featureKeys: readonly string[];
  /** Where the entitlements came from: the effective subscription's plan, or
   * the tier-derived legacy plan when no subscription is effective. */
  source: 'subscription' | 'tier';
  /** Name of the plan the entitlements were read from. */
  planName: string;
  /** The mapped tier — set only when `source === 'tier'`. */
  tier: LegacyTier | null;
};

function enabledKeys(translations: ReadonlyArray<PlanFeatureSnapshot>): string[] {
  return translations.filter(translation => translation.enabled)
    .map(translation => translation.feature.key);
}

/** Resolves the feature keys a user is effectively entitled to (see the module
 * docblock for the contract). Throws on an unknown/missing tier on the
 * fallback path, on an effective subscription whose plan was not included,
 * and on a fallback whose tier's legacy plan was not loaded. */
export function resolveEffectiveEntitlements(user: EntitlementUser,
  legacyPlans: LegacyPlanSource, now: Date = new Date()): EffectiveEntitlements {
  const effective = user.subscriptions.find(row => isEffectiveSubscription(row, now));
  if (effective) {
    if (!effective.plan || !Array.isArray(effective.plan.featureTranslations))
      throw new Error(
        'Effective subscription is missing its included plan feature translations; ' +
        'the caller must include subscriptions.plan.featureTranslations.feature.');
    return {
      featureKeys: enabledKeys(effective.plan.featureTranslations),
      source: 'subscription',
      planName: effective.plan.name,
      tier: null,
    };
  }
  const tier = mapLegacyTier(user.plan);
  const legacyPlan = legacyPlans[tier];
  if (!legacyPlan || !Array.isArray(legacyPlan.featureTranslations))
    throw new Error(
      `Legacy plan "${LEGACY_PLAN_SPECS[tier].name}" was not loaded for the tier ` +
      `fallback; load both legacy plans via loadLegacyPlanSource first.`);
  return {
    featureKeys: enabledKeys(legacyPlan.featureTranslations),
    source: 'tier',
    planName: legacyPlan.name,
    tier,
  };
}

/** Read-only loader for the resolver's second argument: fetches both legacy
 * plans (by their mapped names) with their feature translations. Throws if a
 * legacy plan is missing — i.e. before the legacy plans exist. */
export async function loadLegacyPlanSource(
  db: PrismaClient | Prisma.TransactionClient): Promise<LegacyPlanSource> {
  const plans = await db.plan.findMany({
    where: { name: { in: Object.values(LEGACY_PLAN_SPECS).map(spec => spec.name) } },
    select: { name: true,
      featureTranslations: { select: { enabled: true, feature: { select: { key: true } } } } },
  });
  const byName = new Map(plans.map(plan => [plan.name, plan]));
  const pick = (tier: LegacyTier): PlanSnapshot => {
    const name = LEGACY_PLAN_SPECS[tier].name;
    const plan = byName.get(name);
    if (!plan)
      throw new Error(
        `Legacy plan "${name}" does not exist yet; both legacy plans named in ` +
        `LEGACY_PLAN_SPECS must exist with their feature translations — create ` +
        `them via the admin plans page so legacy-tier users (their tier-derived ` +
        `rows on the subscriptions page) resolve against them.`);
    return plan;
  };
  return { free: pick('free'), pro: pick('pro') };
}
