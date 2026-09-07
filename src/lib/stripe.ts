import "server-only";
import Stripe from "stripe";
import { prisma } from "@/lib/db";
import {
  FREE_SPIDER_LIMIT,
  isProPlan,
  type BillingInterval,
  PLAN_PRICES,
} from "@/lib/billing";

let stripeClient: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      // Pin to the version shipped with stripe-node.
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }
  return stripeClient;
}

export function priceIdForInterval(interval: BillingInterval) {
  const envName = PLAN_PRICES[interval].envPriceId;
  const priceId = process.env[envName]?.trim();
  if (!priceId) throw new Error(`Missing ${envName}`);
  return priceId;
}

export async function getBillingProfile(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });

  // Memorialized (passed) spiders keep their story but don't use a free slot.
  const [activeSpiderCount, memorialCount] = await Promise.all([
    prisma.spider.count({
      where: { userId, memorializedAt: null },
    }),
    prisma.spider.count({
      where: { userId, memorializedAt: { not: null } },
    }),
  ]);

  const plan = isProPlan(user.plan) ? "pro" : "free";
  const spiderCount = activeSpiderCount;
  const atFreeLimit = plan === "free" && spiderCount >= FREE_SPIDER_LIMIT;

  return {
    ...user,
    plan,
    spiderCount,
    memorialCount,
    freeLimit: FREE_SPIDER_LIMIT,
    atFreeLimit,
    canAddSpider: plan === "pro" || spiderCount < FREE_SPIDER_LIMIT,
  };
}

export async function syncSubscriptionToUser(
  userId: string,
  subscription: Stripe.Subscription,
) {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const status = subscription.status;
  const active =
    status === "active" || status === "trialing" || status === "past_due";

  // Stripe SDK typings vary by API version for period end.
  const periodEndUnix =
    (subscription as { current_period_end?: number }).current_period_end ??
    subscription.items.data[0]?.current_period_end ??
    null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: active ? "pro" : "free",
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: periodEndUnix
        ? new Date(periodEndUnix * 1000)
        : null,
    },
  });
}
