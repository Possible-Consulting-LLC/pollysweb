import { guardDerivedMaintenance } from './maintenance-write';
import 'server-only';
import type { Prisma } from '@prisma/client';
import { mutationIdentity } from './mutation-context';
import { auditTestMutation, resolveRequestIdentity } from './admin/test-session-store';
import { TestContextError } from './admin/test-session';
/** For writes discovered during reads, capture the same effective identity before
 * entering their transaction. Call audit only inside the actual-change branch. */
export async function derivedMutationIdentity(userId: string) {
  const admitted = mutationIdentity.getStore();
  const identity = admitted ? admitted.identity : await resolveRequestIdentity();
  if (!identity || identity.effectiveUserId !== userId)
    throw new TestContextError();
  return identity;
}
export async function recordDerivedChange(tx: Prisma.TransactionClient, identity: Awaited<ReturnType<typeof derivedMutationIdentity>>, work: () => Promise<unknown>) {
  await guardDerivedMaintenance(tx, identity);
  await auditTestMutation(identity, 'test.derived.careday', 'attempted', tx);
  await work();
  await guardDerivedMaintenance(tx, identity);
  await auditTestMutation(identity, 'test.derived.careday', 'succeeded', tx);
}
