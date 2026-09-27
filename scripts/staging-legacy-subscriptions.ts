/** Legacy-subscription backfill for the staging environment. Copies the legacy
 * per-user plan tiers ('free'/'pro' on User.plan) into the new plan system as
 * "Free – Legacy" / "Pro – Legacy" plans with one $0 MONTHLY billing option
 * each, assigns the designated legacy feature sets to those plans, and gives
 * every user an ACTIVE subscription on the mapped legacy plan via the real
 * admin assignment service (which end-dates any prior effective subscription —
 * authorized for this backfill).
 *
 * DRY-RUN BY DEFAULT: without --apply it prints the mapping table and writes
 * nothing (plan ensure/feature/assignment writes happen only with --apply;
 * reads always run). Safe to execute repeatedly; users already holding the
 * mapped legacy plan are skipped.
 *
 * Run with (the react-server condition is required so the admin services'
 * 'server-only' markers resolve to no-ops under tsx):
 *   npx tsx --conditions=react-server scripts/staging-legacy-subscriptions.ts [--apply]
 *
 * Hard-aborts unless SPOODLY_ENV === 'staging' (loaded from .env.local).
 * This script never touches User rows (read-only on users); the only writes
 * are plans, billing options, feature translations, subscriptions, and the
 * admin audit trail those services keep. */
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import type { Prisma, PrismaClient } from '@prisma/client';
import { assertStagingEnvironment } from '../src/lib/staging-guard';
import { isRegisteredFeatureKey } from '../src/lib/features/registry';

// ---------------------------------------------------------------------------
// Pure mapping / decision logic (unit-tested in staging-legacy-subscriptions.test.ts)
// ---------------------------------------------------------------------------

export type Environment = Record<string, string | undefined>;

/** The legacy tiers map onto exactly these plan names. */
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

/** Registry-listed keys that must never be assigned to a plan. photo.upload
 * is orphaned (deliberately unassignable); reject it loudly if it ever shows
 * up in a designation. */
export const ORPHANED_FEATURE_KEYS: readonly string[] = ['photo.upload'];

const TIERS: readonly string[] = Object.keys(LEGACY_PLAN_SPECS);

export function assertLegacyBackfillEnvironment(env: Environment): void {
  if (env.SPOODLY_ENV !== 'staging')
    throw new Error('SPOODLY_ENV must explicitly be staging; refusing to run.');
  assertStagingEnvironment(env);
}

/** Legacy User.plan tier → normalized Legacy tier key. Strict: only the exact
 * legacy values 'free'/'pro' map; anything else (including null/empty or case
 * variants) fails loudly so an unexpected tier aborts the run. */
export function mapLegacyTier(tier: string | null | undefined): LegacyTier {
  if (typeof tier !== 'string' || !TIERS.includes(tier))
    throw new Error(`Unmapped legacy plan tier ${JSON.stringify(tier ?? null)}; aborting.`);
  return tier as LegacyTier;
}

export type SubscriptionPlanRef = { planId: string };

/** The one effective subscription per the assignment service's semantics
 * (TRIALING/ACTIVE/PAST_DUE and not expired), or null when none applies. */
export function effectiveSubscription<T extends { status: string; expiresAt: Date | null }>(
  rows: readonly T[], now: Date): T | null {
  return rows.find(row =>
    ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(row.status) &&
    (row.expiresAt === null || row.expiresAt.getTime() > now.getTime())) ?? null;
}

/** Backfill decision for one user: 'skip' only when the user's effective
 * subscription is already on the mapped legacy plan (re-runs are no-ops);
 * 'supersede' when a subscription on any other plan — including the other
 * tier's legacy plan — is effective (the service end-dates it); 'create'
 * when the user has no effective subscription. */
export function decideUserAction(mappedPlanId: string,
  effective: SubscriptionPlanRef | null): 'create' | 'supersede' | 'skip' {
  if (effective === null) return 'create';
  return effective.planId === mappedPlanId ? 'skip' : 'supersede';
}

/** Fails closed unless every designated key is a registry feature, is not an
 * orphan, and the list is non-empty and duplicate-free. */
export function validateDesignatedFeatures(keys: readonly string[]): readonly string[] | Error {
  if (!Array.isArray(keys) || keys.length === 0)
    return new Error('Designation needs at least one feature key.');
  const seen = new Set<string>();
  for (const key of keys) {
    if (ORPHANED_FEATURE_KEYS.includes(key))
      return new Error(`Orphaned feature key "${key}" is never assignable; remove it from the designation.`);
    if (typeof key !== 'string' || !isRegisteredFeatureKey(key))
      return new Error(`Unknown feature key ${JSON.stringify(key)}. Only code-registry features can be assigned.`);
    if (seen.has(key))
      return new Error(`Feature key "${key}" appears more than once.`);
    seen.add(key);
  }
  return [...keys];
}

/** Audit reason derived from the user's own legacy tier; kept free of '@' and
 * control characters per the audit allowlist's text rules. */
export function backfillReason(tier: string): string {
  if (!TIERS.includes(tier))
    throw new Error(`Unmapped legacy plan tier ${JSON.stringify(tier)}; aborting.`);
  return `Legacy backfill: staging plan=${tier} copied into the new system`;
}

// ---------------------------------------------------------------------------
// Script body (DB reads always; writes only under --apply)
// ---------------------------------------------------------------------------

type LegacyDb = Prisma.TransactionClient;

const PLAN_REASONS: Record<LegacyTier, string> = {
  free: 'Legacy backfill: legacy free tier plan copied into the new system',
  pro: 'Legacy backfill: legacy pro tier plan copied into the new system',
};
const FEATURE_REASONS: Record<LegacyTier, string> = {
  free: 'Legacy backfill: designated features for the legacy free tier plan',
  pro: 'Legacy backfill: designated features for the legacy pro tier plan',
};

/** Idempotently ensures one Legacy plan exists with its $0 MONTHLY option and
 * designated features, reusing the admin plan services inside one transaction.
 * A same-named plan is reused only when its shape matches the spec (STANDARD,
 * active, non-public, one active $0 MONTHLY option); any mismatch aborts for
 * manual reconciliation instead of silently rewriting someone's plan. */
async function ensureLegacyPlan(db: PrismaClient, actorId: string,
  tier: LegacyTier): Promise<{ planId: string; optionId: string; planCreated: boolean;
    featuresAdded: string[] }> {
  const spec = LEGACY_PLAN_SPECS[tier];
  const designation = validateDesignatedFeatures(spec.featureKeys);
  assert.ok(!(designation instanceof Error), designation instanceof Error ? designation.message : '');
  return db.$transaction(async tx => {
    const { createPlan, saveBillingOption } = await import('../src/lib/admin/plans');
    const { applyFeatureMatrix } = await import('../src/lib/admin/plan-features');
    const existing = await tx.plan.findFirst({
      where: { name: spec.name },
      include: { billingOptions: true,
        featureTranslations: { include: { feature: { select: { key: true } } } } },
    });
    if (existing) {
      assert.ok(existing.planType === 'STANDARD' && existing.active && !existing.public,
        `Plan "${spec.name}" exists with a different shape (planType=${existing.planType}, ` +
        `active=${existing.active}, public=${existing.public}); reconcile it manually before backfilling.`);
      const option = existing.billingOptions.find(candidate =>
        candidate.interval === 'MONTHLY' && candidate.active && candidate.basePriceCents === 0);
      assert.ok(option,
        `Plan "${spec.name}" exists without an active $0 MONTHLY billing option; add one via the admin plan editor before backfilling.`);
      const enabledKeys = new Set(existing.featureTranslations
        .filter(translation => translation.enabled).map(translation => translation.feature.key));
      const featuresAdded = spec.featureKeys.filter(key => !enabledKeys.has(key));
      if (featuresAdded.length > 0) {
        const applied = await applyFeatureMatrix(tx, actorId, existing.id,
          { entries: spec.featureKeys.map(key => ({ key, enabled: true })) },
          FEATURE_REASONS[tier]);
        assert.ok(!(applied instanceof Error), applied instanceof Error ? applied.message : '');
      }
      return { planId: existing.id, optionId: option.id, planCreated: false, featuresAdded };
    }
    const created = await createPlan(tx, actorId,
      { name: spec.name, description: spec.description, planType: 'STANDARD',
        maxSpiders: spec.maxSpiders, active: true, public: false }, PLAN_REASONS[tier]);
    assert.ok(!(created instanceof Error), created instanceof Error ? created.message : '');
    const saved = await saveBillingOption(tx, actorId, created,
      { interval: 'MONTHLY', basePriceCents: 0, active: true }, PLAN_REASONS[tier]);
    assert.ok(!(saved instanceof Error), saved instanceof Error ? saved.message : '');
    const applied = await applyFeatureMatrix(tx, actorId, created,
      { entries: spec.featureKeys.map(key => ({ key, enabled: true })) }, FEATURE_REASONS[tier]);
    assert.ok(!(applied instanceof Error), applied instanceof Error ? applied.message : '');
    const option = await tx.planBillingOption.findFirstOrThrow({
      where: { planId: created, interval: 'MONTHLY', active: true }, select: { id: true } });
    return { planId: created, optionId: option.id, planCreated: true,
      featuresAdded: [...spec.featureKeys] };
  });
}

type PlanReadiness = Record<LegacyTier, Awaited<ReturnType<typeof ensureLegacyPlan>>>;

type BackfillRow = {
  userId: string; email: string; tier: LegacyTier; action: 'create' | 'supersede' | 'skip';
  currentPlanName: string | null; targetPlanName: string;
};

async function loadBackfillRows(db: PrismaClient, plans: PlanReadiness,
  now: Date): Promise<BackfillRow[]> {
  const users = await db.user.findMany({
    select: { id: true, email: true, plan: true,
      subscriptions: { where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { planId: true, plan: { select: { name: true } }, status: true, expiresAt: true } } },
    orderBy: [{ email: 'asc' }, { id: 'asc' }] });
  return users.map(user => {
    // Strict tier mapping: an unexpected value aborts the whole run.
    const tier = mapLegacyTier(user.plan);
    const target = plans[tier];
    const effective = effectiveSubscription(user.subscriptions, now);
    return {
      userId: user.id, email: user.email, tier,
      action: decideUserAction(target.planId, effective ? { planId: effective.planId } : null),
      currentPlanName: effective ? effective.plan.name : null,
      targetPlanName: LEGACY_PLAN_SPECS[tier].name,
    };
  });
}

function printRows(rows: readonly BackfillRow[]): { create: number; supersede: number; skip: number } {
  const counts = { create: 0, supersede: 0, skip: 0 };
  console.log('email'.padEnd(34), 'tier'.padEnd(6), 'current'.padEnd(16), 'target'.padEnd(15), 'action');
  for (const row of rows) {
    counts[row.action] += 1;
    const action = row.action === 'supersede' && row.currentPlanName
      ? `supersede (end-dates "${row.currentPlanName}")` : row.action;
    console.log(row.email.padEnd(34), row.tier.padEnd(6),
      (row.currentPlanName ?? '—').slice(0, 16).padEnd(16), row.targetPlanName.padEnd(15), action);
  }
  console.log(`Counts: create=${counts.create} supersede=${counts.supersede} skip=${counts.skip} total=${rows.length}`);
  return counts;
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL('..', import.meta.url));
  dotenv.config({ path: resolve(root, '.env.local'), override: true, quiet: true });
  assertLegacyBackfillEnvironment(process.env);
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  assert.ok(args.every(arg => arg === '--apply'), 'Unknown argument; only --apply is allowed.');
  // The admin services mark themselves 'server-only'; resolve those markers to
  // no-ops by running under `npx tsx --conditions=react-server`.
  let services: { prisma: PrismaClient; assignPlanSubscription: typeof import('../src/lib/admin/plan-assignment').assignPlanSubscription };
  try {
    const [{ prisma }, assignment] = await Promise.all([
      import('../src/lib/db'), import('../src/lib/admin/plan-assignment')]);
    services = { prisma, assignPlanSubscription: assignment.assignPlanSubscription };
  } catch (error) {
    throw new Error(
      `Could not load the admin services (${error instanceof Error ? error.message : String(error)}). ` +
      'Run with: npx tsx --conditions=react-server scripts/staging-legacy-subscriptions.ts [--apply]');
  }
  const { prisma } = services;
  try {
    // Actor: the single non-deleting super administrator the services audit against.
    const admins = await prisma.user.findMany({
      where: { role: 'super_admin', deletingAt: null }, select: { id: true, email: true } });
    assert.equal(admins.length, 1, `Expected exactly one eligible super_admin actor, found ${admins.length}.`);
    const actorId = admins[0]!.id;
    console.log(`Actor: ${admins[0]!.email} (${actorId})`);
    console.log(apply ? 'Mode: APPLY (writes enabled)' : 'Mode: DRY-RUN (no writes; pass --apply to write)');

    // Phase 1 — plans: idempotent ensure (writes only under --apply).
    const plans = {} as PlanReadiness;
    for (const tier of TIERS as readonly LegacyTier[]) {
      const spec = LEGACY_PLAN_SPECS[tier];
      if (apply) {
        const readiness = await ensureLegacyPlan(prisma, actorId, tier);
        plans[tier] = readiness;
        console.log(`Plan "${spec.name}": ${readiness.planCreated ? 'created' : 'exists'} ` +
          `(option ${readiness.optionId}${readiness.featuresAdded.length ? `, features added: ${readiness.featuresAdded.join(', ')}` : ', features already designated'})`);
      } else {
        // Dry-run readiness check: same shape validations, zero writes.
        const existing = await prisma.plan.findFirst({
          where: { name: spec.name },
          include: { billingOptions: true,
            featureTranslations: { include: { feature: { select: { key: true } } } } } });
        if (!existing) {
          plans[tier] = { planId: `<to-create: ${spec.name}>`, optionId: '<to-create: $0 MONTHLY>',
            planCreated: true, featuresAdded: [...spec.featureKeys] };
          console.log(`Plan "${spec.name}": missing — would be created (STANDARD, active, non-public, maxSpiders=${spec.maxSpiders}, one $0 MONTHLY option, ${spec.featureKeys.length} designated features).`);
        } else {
          const option = existing.billingOptions.find(candidate =>
            candidate.interval === 'MONTHLY' && candidate.active && candidate.basePriceCents === 0);
          assert.ok(existing.planType === 'STANDARD' && existing.active && !existing.public && option,
            `Plan "${spec.name}" exists with a mismatched shape; reconcile it manually before backfilling.`);
          const enabledKeys = new Set(existing.featureTranslations
            .filter(translation => translation.enabled).map(translation => translation.feature.key));
          const featuresAdded = spec.featureKeys.filter(key => !enabledKeys.has(key));
          plans[tier] = { planId: existing.id, optionId: option!.id, planCreated: false, featuresAdded };
          console.log(`Plan "${spec.name}": exists (option ${option!.id}${featuresAdded.length ? `, would add features: ${featuresAdded.join(', ')}` : ', features already designated'}).`);
        }
      }
    }

    // Phase 2 — mapping table (read-only).
    const now = new Date();
    const rows = await loadBackfillRows(prisma, plans, now);
    const counts = printRows(rows);

    // Phase 3 — assignments via the admin assignment service (writes only under --apply).
    if (!apply) {
      console.log('DRY-RUN complete: nothing was written. Re-run with --apply to assign.');
      return;
    }
    const pending = rows.filter(row => row.action !== 'skip');
    for (const row of pending) {
      const target = plans[row.tier];
      const result = await prisma.$transaction(tx =>
        services.assignPlanSubscription(tx as unknown as Prisma.TransactionClient, actorId, {
          targetUserId: row.userId, planId: target.planId, planBillingOptionId: target.optionId,
          effectiveAt: now, reason: backfillReason(row.tier) }));
      assert.ok(!(result instanceof Error), `Assignment failed for ${row.email}: ${result instanceof Error ? result.message : ''}`);
      console.log(`Assigned ${row.email} → "${row.targetPlanName}" ($0 MONTHLY, ACTIVE, subscription ${result}).`);
    }
    console.log(`APPLY complete: ${counts.create} created, ${counts.supersede} superseded, ${counts.skip} skipped.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    console.error('Legacy backfill aborted; inspect the message above. Nothing is applied unless a completed --apply run says so.');
    process.exitCode = 1;
  });
}
