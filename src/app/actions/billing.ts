"use server";

import Stripe from "stripe";
import { getActionUser } from "@/lib/session";
import {
  appUrl,
  isStripeConfigured,
  type BillingInterval,
} from "@/lib/billing";
import {
  getBillingProfile,
  getStripe,
  priceIdForInterval,
  syncSubscriptionToUser,
} from "@/lib/stripe";
import { prisma } from "@/lib/db";

function stripeMessage(error: unknown): string {
  if (error instanceof Stripe.errors.StripeError) {
    if (error.code === "resource_missing") {
      return "Stripe couldn’t find that price. Double-check STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY are Price IDs (price_…), not Product IDs (prod_…).";
    }
    if (error.type === "StripeAuthenticationError") {
      return "Stripe rejected the secret key. Confirm STRIPE_SECRET_KEY matches the same mode (test/live) as your price IDs.";
    }
    if (error.message?.toLowerCase().includes("mode")) {
      return "Stripe test/live mismatch — use test keys with test prices, or live keys with live prices.";
    }
    return error.message || "Stripe checkout failed.";
  }
  if (error instanceof Error && error.message) {
    if (error.message.startsWith("Missing ")) {
      return `${error.message}. Add it in Vercel → Settings → Environment Variables, then redeploy.`;
    }
    return error.message;
  }
  return "Checkout failed unexpectedly. Please try again.";
}

export async function startCheckoutAction(
  interval: BillingInterval,
): Promise<{ url?: string; error?: string }> {
  const user = await getActionUser();
  if (!user?.id) {
    return { error: "Please sign in again, then retry checkout." };
  }

  if (!isStripeConfigured()) {
    return {
      error:
        "Billing isn’t fully configured yet. Add STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, and STRIPE_PRICE_YEARLY on Vercel, then redeploy.",
    };
  }

  if (interval !== "monthly" && interval !== "yearly") {
    return { error: "Pick monthly or yearly." };
  }

  try {
    const profile = await getBillingProfile(user.id);
    const stripe = getStripe();
    const priceId = priceIdForInterval(interval);

    if (!priceId.startsWith("price_")) {
      return {
        error: `${interval === "monthly" ? "STRIPE_PRICE_MONTHLY" : "STRIPE_PRICE_YEARLY"} should look like price_… (not prod_…).`,
      };
    }

    let customerId = profile.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl()}/upgrade?success=1`,
      cancel_url: `${appUrl()}/upgrade?canceled=1`,
      client_reference_id: user.id,
      metadata: { userId: user.id, interval },
      subscription_data: {
        metadata: { userId: user.id, interval },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return { error: "Stripe didn’t return a checkout URL." };
    }
    return { url: session.url };
  } catch (error) {
    console.error("[billing] checkout failed", error);
    return { error: stripeMessage(error) };
  }
}

export async function openBillingPortalAction(): Promise<{
  url?: string;
  error?: string;
}> {
  const user = await getActionUser();
  if (!user?.id) {
    return { error: "Please sign in again, then retry." };
  }

  if (!isStripeConfigured()) {
    return {
      error:
        "Billing isn’t fully configured yet. Add Stripe keys on Vercel, then redeploy.",
    };
  }

  try {
    const profile = await getBillingProfile(user.id);
    if (!profile.stripeCustomerId) {
      return { error: "No Stripe customer on this account yet." };
    }

    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${appUrl()}/settings`,
    });

    return { url: portal.url };
  } catch (error) {
    console.error("[billing] portal failed", error);
    return { error: stripeMessage(error) };
  }
}

/** Used by webhook / checkout success reconciliation. */
export async function applyStripeSubscription(
  userId: string,
  subscriptionId: string,
) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscriptionToUser(userId, subscription);
}
