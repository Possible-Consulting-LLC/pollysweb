"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { withMutation } from '@/lib/mutation-boundary';

import Stripe from "stripe";
import { getActionUser } from "@/lib/session";
import {
  isStripeConfigured,
  type BillingInterval,
} from "@/lib/billing";
import { checkoutForUser, portalForUser } from "@/lib/billing-service";
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
  interval: BillingInterval, submittedContext: string
): Promise<{ url?: string; error?: string; }> {
  return withMutation(submittedContext, 'billing', 'startcheckoutaction', async () => {
    const user = await getActionUser();
    if (!user?.id) {
      return { error: "Please sign in again, then retry checkout." };
    }

    const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { isDemo: true } });
    if (profile?.isDemo) return { error: "Real billing is disabled for demo accounts." };

    if (!isStripeConfigured()) {
      return {
        error:
          "Billing isn’t fully configured yet. Check the Stripe key, monthly and yearly Price IDs, and webhook signing secret in Vercel, then redeploy.",
      };
    }

    if (interval !== "monthly" && interval !== "yearly") {
      return { error: "Pick monthly or yearly." };
    }

    try {
      return await checkoutForUser(user.id, interval);
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("[billing] checkout failed", error);
      return { error: stripeMessage(error) };
    }

  });
}

export async function openBillingPortalAction(submittedContext: string): Promise<{
  url?: string;
  error?: string;
}> {
  return withMutation(submittedContext, 'billing', 'openbillingportalaction', async () => {
    const user = await getActionUser();
    if (!user?.id) {
      return { error: "Please sign in again, then retry." };
    }

    const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { isDemo: true } });
    if (profile?.isDemo) return { error: "Real billing is disabled for demo accounts." };

    if (!isStripeConfigured()) {
      return {
        error:
          "Billing isn’t fully configured yet. Add Stripe keys on Vercel, then redeploy.",
      };
    }

    try {
      return await portalForUser(user.id);
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("[billing] portal failed", error);
      return { error: stripeMessage(error) };
    }

  });
}
