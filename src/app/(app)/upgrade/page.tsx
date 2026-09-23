import Link from "next/link";
import { format } from "date-fns";
import { CheckoutButtons } from "@/components/billing/checkout-buttons";
import { AppHeader } from "@/components/layout/nav";
import { buttonVariants } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import {
  FREE_SPIDER_LIMIT,
  isStripeConfigured,
} from "@/lib/billing";
import { getBillingProfile } from "@/lib/stripe";
import { needsBillingRecovery } from "@/lib/billing-policy";
import { requireUser } from "@/lib/session";
import { checkoutReturnNotice } from "@/lib/upgrade-notice";

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
  const recovery = needsBillingRecovery(
    billing.stripeCustomerId,
    billing.stripeSubscriptionId,
    billing.subscriptionStatus,
  );
  const paymentProblem = billing.subscriptionStatus === "past_due" || billing.subscriptionStatus === "unpaid";
  const checkoutNotice = checkoutReturnNotice(params.success === "1", billing.isDemo, billing.plan);

  return (
    <div className="space-y-6">
      <AppHeader
        title="Spoodly Pro"
        subtitle="One free spood forever. Upgrade to welcome the whole web."
      />

      {checkoutNotice ? (
        <p
          className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-sm text-[var(--midnight)]"
          role="status"
        >
          {checkoutNotice}
        </p>
      ) : null}
      {!billing.isDemo && params.canceled === "1" ? (
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
              {billing.plan === "free" ? ` / ${FREE_SPIDER_LIMIT} active` : " · unlimited"}
              {billing.memorialCount
                ? ` · ${billing.memorialCount} in memory`
                : ""}
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

      {billing.isDemo ? <Card><SectionHeader title="Demo account" /><p>This account uses the {billing.plan} test plan. Real purchases and billing management are disabled.</p></Card> : billing.plan === "pro" || recovery ? (
        <Card className="space-y-4">
          <SectionHeader
            title={paymentProblem ? "Restore Pro" : "Manage billing"}
            subtitle={paymentProblem
              ? "Your subscription needs payment attention. Pro access is paused; your first-created spood remains writable and the others stay readable."
              : billing.plan === "free"
                ? "We’re checking your subscription. Your spoods and history remain available while Pro access is paused."
              : "Update card, cancel, or switch monthly/yearly in Stripe’s customer portal."}
          />
          <CheckoutButtons stripeReady={stripeReady} mode="portal" />
          {billing.plan === "pro" ? <Link href="/spoods/new" className={buttonVariants({ variant: "soft", className: "w-full" })}>Add another spood</Link> : null}
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
