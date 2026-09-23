import { guardServiceMaintenance } from '@/lib/admin/maintenance-access';
import { MaintenanceError, maintenanceResponse } from '@/lib/admin/maintenance-policy';
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { reconcileStripeCustomer } from "@/lib/billing-service";
import { isStaging } from "@/lib/staging-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (isStaging() || !secret || !key) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    console.error("[stripe webhook] signature failed", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try { await guardServiceMaintenance(); } catch { return maintenanceResponse(); }
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (session.mode === "subscription" && customerId) await reconcileStripeCustomer(customerId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        await reconcileStripeCustomer(customerId);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    if (error instanceof MaintenanceError) return maintenanceResponse();
    console.error("[stripe webhook] handler failed", error);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
