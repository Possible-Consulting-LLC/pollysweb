import type { Prisma } from '@prisma/client';
import { MAX_BILLING_SNAPSHOT_AGE_MS } from './effective-entitlement';

/** Database predicate for effectivePro; contract-tested against the domain resolver. */
export function effectiveProWhere(now: Date): Prisma.UserWhereInput {
  return { OR: [
    { isDemo: true, demoPlan: 'pro' },
    { isDemo: false, plan: 'pro', OR: [
      { stripeCustomerId: null },
      { subscriptionStatus: { in: ['active', 'trialing'] }, billingLastCheckedAt: {
        gte: new Date(now.getTime() - MAX_BILLING_SNAPSHOT_AGE_MS), lte: now,
      } },
    ] },
  ] };
}
