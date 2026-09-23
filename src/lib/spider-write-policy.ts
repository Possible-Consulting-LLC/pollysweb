import { prisma } from "./db";
import { effectivePro, type BillingEntitlementSnapshot } from "./effective-entitlement";
import type { Prisma } from "@prisma/client";

export const READ_ONLY_SPOOD_MESSAGE =
  "This spood is read-only on the free plan. Upgrade to Pro to make changes.";

export function firstCreatedSpiderId<T extends { id: string; createdAt: Date; memorializedAt?: Date | null }>(spiders: readonly T[]): string | null {
  const first = spiders.filter((spider) => !spider.memorializedAt).sort((a, b) =>
    a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )[0];
  return first?.id ?? null;
}

export function canWriteSpider(
  user: BillingEntitlementSnapshot,
  firstSpiderId: string | null,
  spiderId: string,
): boolean {
  return effectivePro(user) || (firstSpiderId !== null && firstSpiderId === spiderId);
}

export async function getSpiderWriteState(userId: string): Promise<{
  proAccess: boolean;
  firstSpiderId: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true, isDemo: true, demoPlan: true,
      stripeCustomerId: true,
      subscriptionStatus: true,
      billingLastCheckedAt: true,
    },
  });
  if (!user) throw new Error("Please sign in again.");

  const first = await prisma.spider.findFirst({
    where: { userId, memorializedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return { proAccess: effectivePro(user), firstSpiderId: first?.id ?? null };
}

/** Call after verifying that this keeper owns the target spood. */
export async function assertSpiderWritable(userId: string, spiderId: string): Promise<void> {
  const state = await getSpiderWriteState(userId);
  if (!state.proAccess && state.firstSpiderId !== spiderId) {
    throw new Error(READ_ONLY_SPOOD_MESSAGE);
  }
}

/** Authoritative write admission. Call inside the same transaction as the write. */
export async function assertSpiderWritableInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  spiderId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      plan: true, isDemo: true, demoPlan: true, stripeCustomerId: true,
      subscriptionStatus: true, billingLastCheckedAt: true,
      deletingAt: true, suspendedAt: true,
    },
  });
  if (!user || user.deletingAt || user.suspendedAt) throw new Error("Account is unavailable for writes.");
  const owned = await tx.spider.findFirst({ where: { id: spiderId, userId }, select: { id: true } });
  if (!owned) throw new Error("Spider not found.");
  const first = await tx.spider.findFirst({
    where: { userId, memorializedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!canWriteSpider(user, first?.id ?? null, spiderId)) throw new Error(READ_ONLY_SPOOD_MESSAGE);
}
