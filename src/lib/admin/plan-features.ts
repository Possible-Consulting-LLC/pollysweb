import 'server-only';
import type { Prisma } from '@prisma/client';
import { appendAudit } from './audit';
import { planHistoryCount } from './plans';
import { isRegisteredFeatureKey } from '../features/registry';
import { summarizePlanForPricing } from '../features/pricing';

// Re-export the client-safe pricing summary (src/lib/features/pricing.ts) so
// server consumers have one import path; the editor preview uses it live.
export { summarizePlanForPricing };
export type { PricingSummary } from '../features/pricing';

export type FeatureMatrixEntry = { key: string; enabled: boolean };
/** Three fields: the count after, the count before, and the keys flipped
 * true→false while the plan still has effective subscribers. */
export type AppliedMatrix = { enabledCount: number; previousEnabledCount: number; removedAccess: string[] };

type PlanFeaturesDb = Pick<Prisma.TransactionClient,
  'plan' | 'planBillingOption' | 'feature' | 'featurePlanTranslation' | 'userSubscription'>;
/** appendAudit accepts the full client; this service only needs these delegates. */
const auditTx = (tx: PlanFeaturesDb): Prisma.TransactionClient => tx as Prisma.TransactionClient;

/** Matrix validation is registry-based and fails closed: a key that is not in
 * the code registry is rejected whether it is a typo or an orphaned database
 * row (a key in the DB but no longer in the registry), and duplicates and
 * non-boolean states are rejected before anything is written. */
export function validateFeatureMatrix(entries: FeatureMatrixEntry[]): { entries: FeatureMatrixEntry[] } | Error {
  if (!Array.isArray(entries)) return new Error('Submit the feature matrix as a list of keys.');
  const seen = new Set<string>();
  const accepted: FeatureMatrixEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') return new Error('Submit the feature matrix as a list of keys.');
    const { key, enabled } = entry as { key?: unknown; enabled?: unknown };
    if (typeof key !== 'string' || key.length === 0 || key.length > 128)
      return new Error('Every matrix entry needs a valid feature key.');
    if (typeof enabled !== 'boolean') return new Error('Choose enabled or disabled for every feature.');
    if (!isRegisteredFeatureKey(key))
      return new Error(`Unknown feature key "${key}". Only code-registry features can be assigned.`);
    if (seen.has(key)) return new Error(`Feature key "${key}" appears more than once.`);
    seen.add(key);
    accepted.push({ key, enabled });
  }
  return { entries: accepted };
}

/** Applies the submitted matrix inside the caller's transaction. Upserts only:
 * existing rows keep their place and are flipped with an update, and rows are
 * never deleted — disabling leaves the row with enabled: false (safe
 * restoration), so re-enabling preserves the creation history. Rows for
 * unsubmitted keys are untouched. removedAccess lists the true→false flips when
 * planHistoryCount still reports effective subscribers (Task 5 wires the real
 * count), so the UI can warn without blocking the save. Audits plan.features
 * with featureCount/enabledCount/previousEnabledCount over the submitted matrix. */
export async function applyFeatureMatrix(tx: PlanFeaturesDb, actorId: string, planId: string,
  input: { entries: FeatureMatrixEntry[] }, reason: string): Promise<AppliedMatrix | Error> {
  if (!planId || planId.length > 128) return new Error('A valid plan is required.');
  const validated = validateFeatureMatrix(Array.isArray(input?.entries) ? input.entries : []);
  if (validated instanceof Error) return validated;
  const plan = await tx.plan.findUnique({ where: { id: planId } });
  if (!plan) return new Error('That plan no longer exists. Reload the catalog.');
  const keys = validated.entries.map(entry => entry.key);
  const featureRows = keys.length ? await tx.feature.findMany({ where: { key: { in: keys } } }) : [];
  const featureIdByKey = new Map(featureRows.map(row => [row.key, row.id]));
  for (const key of keys)
    if (!featureIdByKey.has(key))
      return new Error('Feature rows are missing from the database. Run registry sync from the feature catalog first.');
  const existing = await tx.featurePlanTranslation.findMany({ where: { planId } });
  const keyByFeatureId = new Map(featureRows.map(row => [row.id, row.key]));
  const previousByKey = new Map<string, boolean>();
  for (const row of existing) {
    const key = keyByFeatureId.get(row.featureId);
    // Translations of features outside the submitted matrix stay untouched.
    if (key !== undefined) previousByKey.set(key, row.enabled);
  }
  // Missing translations resolve as disabled.
  const changed = validated.entries.filter(entry => (previousByKey.get(entry.key) ?? false) !== entry.enabled);
  if (changed.length === 0) return new Error('No feature changes were entered.');
  for (const entry of changed) {
    const featureId = featureIdByKey.get(entry.key)!;
    const row = existing.find(candidate => candidate.featureId === featureId);
    if (row) await tx.featurePlanTranslation.update({ where: { id: row.id }, data: { enabled: entry.enabled } });
    else await tx.featurePlanTranslation.create({ data: { planId, featureId, enabled: entry.enabled } });
  }
  const previousEnabledCount = validated.entries.filter(entry => previousByKey.get(entry.key) === true).length;
  const enabledCount = validated.entries.filter(entry => entry.enabled).length;
  const subscribers = await planHistoryCount(tx, planId);
  const removedAccess = subscribers > 0
    ? changed.filter(entry => previousByKey.get(entry.key) === true && !entry.enabled).map(entry => entry.key)
    : [];
  await appendAudit(auditTx(tx), { actorId, targetId: planId, action: 'plan.features', reason,
    changes: { planName: plan.name, featureCount: validated.entries.length, enabledCount, previousEnabledCount } });
  return { enabledCount, previousEnabledCount, removedAccess };
}
