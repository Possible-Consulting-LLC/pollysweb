import 'server-only';
import type { Prisma } from '@prisma/client';
import type { RequestIdentity } from './admin/test-session';
import { prisma } from './db';
import { mutationIdentity } from './mutation-context';
import { guardMaintenance, guardMaintenanceAfterWrite } from './admin/maintenance-access';
import { assertSpiderWritableInTransaction } from './spider-write-policy';
/** Primary writes use one connection and rollback if cutoff arrives before commit.
 * This is deliberately explicit: auth/exit bookkeeping and cleanup are separate. */
export async function maintenanceTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}, primary = true): Promise<T> {
  const value = await prisma.$transaction(async (tx) => {
    await guardMaintenance('write', undefined, tx);
    const result = await work(tx);
    await guardMaintenanceAfterWrite(tx);
    return result;
  }, { isolationLevel: 'ReadCommitted', ...options });
  const context = mutationIdentity.getStore();
  if (primary && context)
    context.primaryCommitted = true;
  return value;
}

export async function writableSpiderTransaction<T>(
  userId: string,
  spiderId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: Parameters<typeof maintenanceTransaction<T>>[1],
): Promise<T> {
  return maintenanceTransaction(async (tx) => {
    await assertSpiderWritableInTransaction(tx, userId, spiderId);
    return work(tx);
  }, options);
}
/** Only dependent care progress of a confirmed primary save may finish after cutoff.
 * A new write or upload attachment always uses maintenanceTransaction directly. */
export async function drainCareCompletion<T>(work: () => Promise<T>): Promise<T> {
  const context = mutationIdentity.getStore();
  if (!context?.primaryCommitted)
    return work();
  return mutationIdentity.run({ ...context, careCompletion: true }, work);
}
export async function guardDerivedMaintenance(tx: Prisma.TransactionClient = prisma, identity?: RequestIdentity): Promise<void> {
  if (!mutationIdentity.getStore()?.careCompletion)
    await guardMaintenance('write', identity, tx);
}
