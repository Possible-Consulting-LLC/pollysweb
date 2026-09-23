import type { Prisma } from "@prisma/client";
import { FREE_SPIDER_LIMIT } from "./billing";
import { effectivePro } from "./effective-entitlement";

/** Call inside a transaction so every active-spood addition for a keeper is serialized. */
export async function runWithSpiderSlot<T>(
  tx: Prisma.TransactionClient,
  userId: string,
  addSpider: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; freeLimit: number }> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true, isDemo: true, demoPlan: true, stripeCustomerId: true, subscriptionStatus: true, billingLastCheckedAt: true },
  });
  if (!effectivePro(user)) {
    const activeCount = await tx.spider.count({
      where: { userId, memorializedAt: null },
    });
    if (activeCount >= FREE_SPIDER_LIMIT) {
      return { ok: false, freeLimit: FREE_SPIDER_LIMIT };
    }
  }
  return { ok: true, value: await addSpider(tx) };
}
