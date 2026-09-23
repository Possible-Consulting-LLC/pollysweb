import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import type { BillingInterval } from "./billing";
import { checkoutDecision, chooseSubscription, grantsPro, verifyCustomerOwner } from "./billing-policy";

export function createBillingService({ prisma, getStripe, priceIdForInterval, legacyPriceIds, appUrl, admit = async () => {} }: {
  prisma: PrismaClient;
  getStripe: () => Stripe;
  priceIdForInterval: (interval: BillingInterval) => string;
  legacyPriceIds: () => string[];
  appUrl: () => string;
  admit?: (tx: Prisma.TransactionClient) => Promise<void>;
}) {
// Checkout and webhooks share the same row lock across all app instances.
async function withBillingLock<T>(userId: string, run: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await admit(tx);
    return run(tx);
  }, { maxWait: 10_000, timeout: 45_000 });
}

const keyFor = (value: string) => createHash("sha256").update(value).digest("hex");
const hasApprovedPrice = (subscription: Stripe.Subscription, approvedPrices: ReadonlySet<string>) =>
  subscription.items.data.some((item) => approvedPrices.has(item.price.id));
const hasAppBillingMetadata = (metadata: Stripe.Metadata | null, userId: string) =>
  metadata?.userId === userId && (metadata.interval === "monthly" || metadata.interval === "yearly");
function approvedPriceIds() {
  const prices = [priceIdForInterval("monthly"), priceIdForInterval("yearly"), ...legacyPriceIds()];
  if (prices.some((priceId) => !priceId.startsWith("price_"))) {
    throw new Error("Billing Price ID allowlist needs review.");
  }
  return new Set(prices);
}

function assertKnownAppSubscription(subscription: Stripe.Subscription, approvedPrices: ReadonlySet<string>, userId: string) {
  if (hasAppBillingMetadata(subscription.metadata, userId) &&
      !hasApprovedPrice(subscription, approvedPrices) &&
      !["canceled", "incomplete_expired"].includes(subscription.status)) {
    throw new Error("Your subscription uses an unrecognized price. Billing configuration needs review before another checkout.");
  }
}

async function currentSubscriptions(stripe: Stripe, customerId: string) {
  const subscriptions: Stripe.Subscription[] = [];
  // Iterate all pages so a replacement cannot hide behind old canceled subscriptions.
  for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
    subscriptions.push(subscription);
  }
  return subscriptions;
}

type Locker = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
const retryWindowMs = 23 * 60 * 60 * 1000;
function assertBillingAvailable(user: { isDemo: boolean; suspendedAt: Date | null; deletingAt: Date | null }) {
  if (user.isDemo) throw Error("Real billing is disabled for demo accounts.");
  if (user.deletingAt || user.suspendedAt) throw Error("Account is unavailable for billing.");
}
function assertRetryWindow(createdAt: Date) {
  const age = Date.now() - createdAt.getTime();
  if (age < 0 || age >= retryWindowMs) throw Error("Checkout recovery window expired. Provider and application logs require investigation; this intent cannot be cleared automatically.");
}

/** Exact request state commits before each possible remote create. A list response
 * cannot settle an ambiguous create: only replaying its original key can do that. */
async function runIntent(userId: string, intentId: string, locked: Locker) {
  const prepared = await locked(async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    assertBillingAvailable(user);
    const intent = await tx.billingCheckoutIntent.findUnique({ where: { userId } });
    if (!intent || intent.id !== intentId) return null;
    assertRetryWindow(intent.createdAt);
    if (intent.phase === 'session') return { ready: true as const };
    const stripe = getStripe();
    const interval = intent.interval as BillingInterval;
    const approvedPrices = approvedPriceIds();
    let customerId = intent.customerId;
    if (!customerId) {
      await admit(tx);
      const customer = await stripe.customers.create({ metadata: { userId } }, {
        idempotencyKey: `spoodly-customer-${keyFor(userId)}`,
      });
      customerId = customer.id;
      await tx.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId, billingNextCheckAt: new Date() } });
    }
    // Customer creation has returned successfully (or was unnecessary). No
    // checkout create is possible in prepare phase. Commit a definite preflight
    // rejection with the acknowledged customer rather than strand this account.
    try {
      const customer = await stripe.customers.retrieve(customerId);
      verifyCustomerOwner(userId, customerId, customer);
      const subscriptions = await currentSubscriptions(stripe, customerId);
      for (const subscription of subscriptions) assertKnownAppSubscription(subscription, approvedPrices, userId);
      const open: Stripe.Checkout.Session[] = [];
      for await (const session of stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) open.push(session);
      const appOpen = open.filter((session) => hasAppBillingMetadata(session.metadata, userId));
      for (const session of appOpen) {
        if (!session.metadata?.priceId || !approvedPrices.has(session.metadata.priceId)) {
          throw new Error("A pending checkout has an outdated or unverified price. Please wait for it to expire or contact support for review.");
        }
      }
      const existing = checkoutDecision(
        subscriptions.filter((subscription) => hasApprovedPrice(subscription, approvedPrices)),
        appOpen,
        interval,
      );
      if (existing) {
        await tx.billingCheckoutIntent.delete({ where: { userId } });
        return { url: existing.url! };
      }

      const latest = (await stripe.checkout.sessions.list({ customer: customerId, limit: 1 })).data[0];
      if (latest?.mode === "subscription" && latest.status === "complete") {
        const subscriptionId = typeof latest.subscription === "string" ? latest.subscription : latest.subscription?.id;
        // A completed checkout may not yet appear in the list response. Read it directly.
        if (!subscriptionId) throw new Error("Your checkout is still processing. Please check again shortly.");
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        assertKnownAppSubscription(subscription, approvedPrices, userId);
        checkoutDecision(hasApprovedPrice(subscription, approvedPrices) ? [subscription] : [], [], interval);
      }

    } catch (error) {
      await tx.billingCheckoutIntent.delete({ where: { userId } });
      return { error: error instanceof Error ? error.message : 'Billing verification failed.' };
    }
    await tx.billingCheckoutIntent.update({ where: { userId }, data: { customerId, phase: 'session' } });
    return { ready: true as const };
  });
  if (prepared && 'error' in prepared) throw Error(prepared.error);
  if (!prepared || 'url' in prepared) return prepared;
  return locked(async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    assertBillingAvailable(user);
    const intent = await tx.billingCheckoutIntent.findUnique({ where: { userId } });
    if (!intent || intent.id !== intentId) return null;
    assertRetryWindow(intent.createdAt);
    if (intent.phase !== 'session' || !intent.customerId || user.stripeCustomerId !== intent.customerId) throw Error('Checkout recovery state requires review.');
    const stripe = getStripe();
    verifyCustomerOwner(userId, intent.customerId, await stripe.customers.retrieve(intent.customerId));
    await admit(tx);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: intent.customerId,
      line_items: [{ price: intent.priceId, quantity: 1 }],
      success_url: `${intent.appUrl}/upgrade?success=1`, cancel_url: `${intent.appUrl}/upgrade?canceled=1`,
      client_reference_id: userId,
      metadata: { userId, interval: intent.interval, priceId: intent.priceId },
      subscription_data: { metadata: { userId, interval: intent.interval } },
      allow_promotion_codes: true,
    }, { idempotencyKey: `spoodly-checkout-${intent.id}` });
    // A replay may now be complete/expired. The original request is settled, but
    // never issue a replacement checkout from this recovery operation.
    await tx.billingCheckoutIntent.delete({ where: { userId } });
    return session.status === 'open' && session.url ? { url: session.url } : { settled: true as const };
  });
}

async function checkoutForUser(userId: string, interval: BillingInterval): Promise<{ url: string }> {
  if (!['monthly', 'yearly'].includes(interval)) throw Error('Pick monthly or yearly.');
  const locked: Locker = work => withBillingLock(userId, work);
  for (let attempt = 0; attempt < 3; attempt++) {
    const intent = await locked(async tx => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      assertBillingAvailable(user);
      if (user.plan === 'pro' && !user.stripeCustomerId) throw Error('Your account already has Pro access.');
      const pending = await tx.billingCheckoutIntent.findUnique({ where: { userId } });
      if (pending) {
        if (pending.interval !== interval) throw Error('Recover your pending checkout before changing billing interval.');
        assertRetryWindow(pending.createdAt);
        return pending;
      }
      const priceId = priceIdForInterval(interval);
      if (!priceId.startsWith('price_')) throw Error('Billing price is not configured correctly.');
      return tx.billingCheckoutIntent.create({ data: { id: randomUUID(), userId, interval, priceId,
        appUrl: appUrl(), customerId: user.stripeCustomerId, phase: 'prepare', createdAt: new Date() } });
    });
    const result = await runIntent(userId, intent.id, locked);
    if (result && 'url' in result) return { url: result.url! };
    if (result && 'settled' in result) throw Error('Your original checkout has finished. Refresh your billing page.');
  }
  throw Error('Checkout changed concurrently. Please retry.');
}

/** The admin composition supplies fresh authorization, proof, audit, and sorted
 * actor/target User locks at every checkpoint. This never reserves a new intent. */
async function recoverCheckoutForUser(userId: string, locked: Locker) {
  const intent = await locked(tx => tx.billingCheckoutIntent.findUnique({ where: { userId } }));
  if (intent) await runIntent(userId, intent.id, locked);
}

async function portalForUser(userId: string) {
  return withBillingLock(userId, async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    assertBillingAvailable(user);
    if (!user.stripeCustomerId) throw Error('No Stripe customer on this account yet.');
    const stripe = getStripe();
    verifyCustomerOwner(userId, user.stripeCustomerId, await stripe.customers.retrieve(user.stripeCustomerId));
    await admit(tx);
    const portal = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${appUrl()}/settings` });
    return { url: portal.url };
  });
}

/** Only signed webhooks call this; event metadata never chooses the account. */
async function reconcileStripeCustomer(customerId: string) {
  const owner = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  if (!owner) return;
  const issue = await withBillingLock(owner.id, async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: owner.id } });
    if (user.deletingAt) throw new Error("Account deletion is handling billing; retry later.");
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    verifyCustomerOwner(user.id, user.stripeCustomerId, customer);
    const subscriptions = await currentSubscriptions(stripe, customerId);
    if (user.isDemo) {
      let pendingCheckout = false;
      for await (const session of stripe.checkout.sessions.list({ customer: customerId, limit: 100 })) {
        if (session.status === 'open' || (session.status === 'complete' && session.mode === 'subscription')) pendingCheckout = true;
      }
      const unexpected = Boolean(user.stripeSubscriptionId || subscriptions.length || pendingCheckout ||
        await tx.billingCheckoutIntent.findUnique({ where: { userId: user.id } }));
      await tx.user.update({ where: { id: user.id }, data: {
        billingLastCheckedAt: new Date(), billingNextCheckAt: null,
        billingCheckFailures: unexpected ? Math.max(1, user.billingCheckFailures) : 0,
      } });
      return unexpected ? 'Unexpected demo billing association requires operations review.' : null;
    }
    for (const subscription of subscriptions) {
      if (subscription.metadata.userId && subscription.metadata.userId !== user.id) {
        throw new Error("Subscription ownership could not be verified.");
      }
    }
    const approvedPrices = approvedPriceIds();
    const approvedSubscriptions = subscriptions.filter((candidate) => hasApprovedPrice(candidate, approvedPrices));
    const subscription = chooseSubscription(approvedSubscriptions);
    const approvedItem = subscription?.items.data.find((item) => approvedPrices.has(item.price.id));
    const periodEnd = approvedItem?.current_period_end;
    const checkedAt = new Date();
    await tx.user.update({ where: { id: user.id }, data: {
      plan: subscription && grantsPro(subscription.status) ? "pro" : "free",
      stripeSubscriptionId: subscription?.id ?? null,
      stripePriceId: approvedItem?.price.id ?? null,
      subscriptionStatus: subscription?.status ?? null,
      subscriptionCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      billingLastCheckedAt: checkedAt,
      billingNextCheckAt: new Date(checkedAt.getTime() + 6 * 60 * 60 * 1000),
      billingCheckFailures: 0,
    } });
  });
  if (issue) throw Error(issue);
}
return { checkoutForUser, recoverCheckoutForUser, portalForUser, reconcileStripeCustomer };
}
