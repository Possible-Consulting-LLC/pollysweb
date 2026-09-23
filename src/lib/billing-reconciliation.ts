import { MaintenanceError } from './admin/maintenance-policy';
import type { PrismaClient } from "@prisma/client";

const BATCH_SIZE = 20;
const SUCCESS_INTERVAL_MS = 6 * 60 * 60 * 1000;

function retryDelayMs(previousFailures: number) {
  return Math.min(SUCCESS_INTERVAL_MS / 2, 15 * 60 * 1000 * 2 ** Math.min(previousFailures, 4));
}

export async function reconcileDueBilling({ prisma, reconcileCustomer, now, logger }: {
  prisma: PrismaClient;
  reconcileCustomer: (customerId: string) => Promise<void>;
  now: Date;
  logger: { error: (entry: Record<string, unknown>) => void };
}): Promise<{ selected: number; succeeded: number; failed: number }> {
  const due = await prisma.user.findMany({
    where: { isDemo: false, stripeCustomerId: { not: null }, billingNextCheckAt: { lte: now } },
    orderBy: [{ billingNextCheckAt: "asc" }, { id: "asc" }],
    take: BATCH_SIZE,
    select: { id: true, stripeCustomerId: true, billingLastCheckedAt: true, billingNextCheckAt: true, billingCheckFailures: true },
  });
  let succeeded = 0;
  let failed = 0;
  for (const user of due) {
    if (!user.stripeCustomerId) continue;
    try {
      await reconcileCustomer(user.stripeCustomerId);
      succeeded++;
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      failed++;
      const retryAt = new Date(now.getTime() + retryDelayMs(user.billingCheckFailures));
      // A webhook can succeed after this row was selected. Do not overwrite its freshness.
      const update = await prisma.user.updateMany({
        where: {
          id: user.id,
          stripeCustomerId: user.stripeCustomerId,
          billingLastCheckedAt: user.billingLastCheckedAt,
          billingNextCheckAt: user.billingNextCheckAt,
          billingCheckFailures: user.billingCheckFailures,
        },
        data: { billingNextCheckAt: retryAt, billingCheckFailures: { increment: 1 } },
      });
      logger.error({ event: "billing_reconciliation_failed", userId: user.id, customerId: user.stripeCustomerId,
        retryAt: update.count ? retryAt.toISOString() : null,
        error: error instanceof Error ? error.message : "Unknown reconciliation error" });
    }
  }
  return { selected: due.length, succeeded, failed };
}
