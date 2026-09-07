"use server";

import { redirect } from "next/navigation";
import { getActionUser } from "@/lib/session";
import { appUrl, isStripeConfigured, type BillingInterval } from "@/lib/billing";
import {
  getBillingProfile,
  getStripe,
  priceIdForInterval,
  syncSubscriptionToUser,
} from "@/lib/stripe";
import { prisma } from "@/lib/db";

export async function startCheckoutAction(formData: FormData) {
  const user = await getActionUser();
  if (!user?.id) redirect("/login");

  if (!isStripeConfigured()) {
    redirect("/upgrade?error=not_configured");
  }

  const interval = String(formData.get("interval") || "monthly") as BillingInterval;
  if (interval !== "monthly" && interval !== "yearly") {
    redirect("/upgrade?error=invalid_plan");
  }

  const profile = await getBillingProfile(user.id);
  const stripe = getStripe();
  const priceId = priceIdForInterval(interval);

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

  if (!session.url) redirect("/upgrade?error=checkout");
  redirect(session.url);
}

export async function openBillingPortalAction() {
  const user = await getActionUser();
  if (!user?.id) redirect("/login");

  if (!isStripeConfigured()) {
    redirect("/upgrade?error=not_configured");
  }

  const profile = await getBillingProfile(user.id);
  if (!profile.stripeCustomerId) {
    redirect("/upgrade");
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${appUrl()}/settings`,
  });

  redirect(portal.url);
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
