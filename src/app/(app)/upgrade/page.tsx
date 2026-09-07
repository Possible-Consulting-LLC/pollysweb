import Link from "next/link";
import { format } from "date-fns";
import { CheckoutButtons } from "@/components/billing/checkout-buttons";
import { AppHeader } from "@/components/layout/nav";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import {
  FREE_SPIDER_LIMIT,
  isStripeConfigured,
} from "@/lib/billing";
import { getBillingProfile } from "@/lib/stripe";
import { requireUser } from "@/lib/session";

export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: Promise<{
    success?: string;
    canceled?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const billing = await getBillingProfile(user.id!);
  const params = searchParams ? await searchParams : {};
  const stripeReady = isStripeConfigured();

  return (
    <div className="space-y-6">
      <AppHeader
        title="Spoodly Pro"
        subtitle="One free spood forever. Upgrade to welcome the whole web."
      />

      {params.success === "1" ? (
        <p
          className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm text-[var(--midnight)]"
          role="status"
        >
          Welcome to Pro — you can add as many spoods as you like.
        </p>
      ) : null}
      {params.canceled === "1" ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          Checkout canceled. Your free plan is unchanged.
        </p>
      ) : null}
      {params.error === "not_configured" ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          Billing isn’t fully configured yet. Stripe keys still need to be added
          on this deploy.
        </p>
      ) : null}

      <Card className="space-y-3">
        <SectionHeader title="Your plan" />
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
            <dt className="text-xs text-[var(--midnight)]/55">Current plan</dt>
            <dd className="font-semibold capitalize">{billing.plan}</dd>
          </div>
          <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
            <dt className="text-xs text-[var(--midnight)]/55">Spoods</dt>
            <dd className="font-semibold">
              {billing.spiderCount}
              {billing.plan === "free" ? ` / ${FREE_SPIDER_LIMIT} free` : " · unlimited"}
            </dd>
          </div>
          {billing.subscriptionCurrentPeriodEnd ? (
            <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3 sm:col-span-2">
              <dt className="text-xs text-[var(--midnight)]/55">Renews / ends</dt>
              <dd className="font-semibold">
                {format(billing.subscriptionCurrentPeriodEnd, "MMM d, yyyy")}
                {billing.subscriptionStatus ? ` · ${billing.subscriptionStatus}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {billing.plan === "pro" ? (
        <Card className="space-y-4">
          <SectionHeader
            title="Manage billing"
            subtitle="Update card, cancel, or switch monthly/yearly in Stripe’s customer portal."
          />
          <CheckoutButtons stripeReady={stripeReady} mode="portal" />
          <Link href="/spoods/new" className="block">
            <Button type="button" variant="soft" className="w-full">
              Add another spood
            </Button>
          </Link>
        </Card>
      ) : (
        <Card className="space-y-4">
          <SectionHeader
            title="Go Pro"
            subtitle={`Free includes ${FREE_SPIDER_LIMIT} spood. Pro unlocks unlimited profiles, stories, and care tracking.`}
          />
          <CheckoutButtons stripeReady={stripeReady} mode="upgrade" />
          {!stripeReady ? (
            <p className="text-xs text-[var(--midnight)]/55">
              Checkout unlocks once Stripe price IDs are configured on this
              environment.
            </p>
          ) : null}
        </Card>
      )}
    </div>
  );
}
