import "server-only";
import Stripe from "stripe";
import { isStaging } from "./staging-guard";
import { prisma } from "@/lib/db";
import {
  FREE_SPIDER_LIMIT,
  type BillingInterval,
  PLAN_PRICES,
} from "@/lib/billing";
import { effectivePro } from "./effective-entitlement";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (isStaging()) throw new Error("Stripe is disabled in staging.");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      // Pin to the version shipped with stripe-node.
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
      timeout: 10_000,
      maxNetworkRetries: 1,
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
      plan: true, isDemo: true, demoPlan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      billingLastCheckedAt: true,
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

  const plan = effectivePro(user) ? "pro" : "free";
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
