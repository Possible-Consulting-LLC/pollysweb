import 'server-only';
import type { Prisma } from '@prisma/client';
import { FEATURE_REGISTRY } from '../features/registry';

export type SyncReport = { created: string[]; unchanged: number; orphaned: string[] };

/** Create database rows for registry features that are missing, always inactive.
 * Existing rows keep their metadata and release state; database keys that are no
 * longer in the code registry are reported as orphans and left untouched. Sync
 * changes no plan state and is deliberately not audited, but the caller must
 * still supply the super-admin actor and a short reason for provenance. */
export async function syncFeatureRegistry(
  tx: Pick<Prisma.TransactionClient, 'feature'>,
  actorId: string,
  reason: string,
): Promise<SyncReport> {
  if (!actorId || actorId.length > 128) throw new Error('Invalid actor for registry sync.');
  const trimmedReason = reason.trim();
  if (!trimmedReason || trimmedReason.length > 500) throw new Error('Provide a short reason for registry sync.');
  const existing = await tx.feature.findMany({ select: { key: true } });
  const existingKeys = new Set(existing.map(row => row.key));
  const registeredKeys: Set<string> = new Set(FEATURE_REGISTRY.map(definition => definition.key));
  const created: string[] = [];
  for (const definition of FEATURE_REGISTRY) {
    if (existingKeys.has(definition.key)) continue;
    await tx.feature.create({ data: { key: definition.key, name: definition.name,
      description: definition.description, category: definition.category, active: false } });
    created.push(definition.key);
  }
  const orphaned = existing.map(row => row.key).filter(key => !registeredKeys.has(key)).sort();
  return { created, unchanged: existing.length - orphaned.length, orphaned };
}
