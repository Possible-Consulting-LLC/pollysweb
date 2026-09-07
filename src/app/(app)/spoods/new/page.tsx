import Link from "next/link";
import { AppHeader } from "@/components/layout/nav";
import { AddSpoodForm } from "@/components/spoods/add-spood-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FREE_SPIDER_LIMIT, PLAN_PRICES } from "@/lib/billing";
import { getBillingProfile } from "@/lib/stripe";
import { requireUser } from "@/lib/session";

export default async function AddSpoodPage() {
  const user = await requireUser();
  const billing = await getBillingProfile(user.id!);

  return (
    <div className="space-y-6">
      <AppHeader
        title="Add a Spood"
        subtitle="Start a little life story for someone new."
      />

      {billing.canAddSpider ? (
        <Card>
          <AddSpoodForm />
        </Card>
      ) : (
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
            <Link href="/upgrade" className="flex-1">
              <Button type="button" className="w-full" size="lg">
                See Pro plans
              </Button>
            </Link>
            <Link href="/spoods" className="flex-1">
              <Button type="button" variant="soft" className="w-full" size="lg">
                Back to My Spoods
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
