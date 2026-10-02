import Link from "next/link";
import { AppHeader } from "@/components/layout/nav";
import { AddSpoodForm } from "@/components/spoods/add-spood-form";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeatureGate } from "@/components/features/feature-gate";
import { resolveUserFeatureGate, resolveUserGates } from "@/lib/features/gate";
import { FREE_SPIDER_LIMIT, PLAN_PRICES } from "@/lib/billing";
import { getBillingProfile } from "@/lib/stripe";
import { requireUser } from "@/lib/session";

export default async function AddSpoodPage() {
  const user = await requireUser();
  const [gateState, uploadGates] = await Promise.all([
    user.id ? resolveUserFeatureGate(user.id, "spood.create") : ("upsell" as const),
    resolveUserGates(user.id, ["photo.upload"]),
  ]);
  const billing = gateState === "entitled" ? await getBillingProfile(user.id!) : null;

  return (
    <div className="space-y-6">
      <AppHeader
        title="Add a Spood"
        subtitle="Start a little life story for someone new."
      />

      <FeatureGate state={gateState} featureKey="spood.create" name="Adding a Spood">
        {billing?.canAddSpider ? (
          <Card>
            <AddSpoodForm photoUploadGate={uploadGates["photo.upload"]} />
          </Card>
        ) : billing ? (
          <Card className="space-y-4">
            <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--midnight)]">
              Free plan includes {FREE_SPIDER_LIMIT} active spood
            </p>
            <p className="text-sm text-[var(--midnight)]/70">
              You’re caring for {billing.spiderCount} already
              {billing.memorialCount
                ? ` (${billing.memorialCount} in memory don’t count)`
                : ""}
              . Upgrade to Spoodly Pro for unlimited profiles —{" "}
              {PLAN_PRICES.monthly.amountLabel}/month or{" "}
              {PLAN_PRICES.yearly.amountLabel}/year.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/upgrade" className={buttonVariants({ size: "lg", className: "flex-1 w-full" })}>See Pro plans</Link>
              <Link href="/spoods" className={buttonVariants({ variant: "soft", size: "lg", className: "flex-1 w-full" })}>Back to My Spoods</Link>
            </div>
          </Card>
        ) : null}
      </FeatureGate>
    </div>
  );
}
