"use client";
import { useMutationContext } from '@/components/mutation-context';

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  openBillingPortalAction,
  startCheckoutAction,
} from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { PLAN_PRICES, type BillingInterval } from "@/lib/billing";

type Props = {
  stripeReady: boolean;
  mode: "upgrade" | "portal";
};

export function CheckoutButtons({ stripeReady, mode }: Props) {
 const mutationContext = useMutationContext();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<BillingInterval | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(
    kind: BillingInterval | "portal",
    action: () => Promise<{ url?: string; error?: string }>,
  ) {
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          setBusy(null);
          return;
        }
        if (result.url) {
          window.location.assign(result.url);
          return;
        }
        setError("Checkout didn’t return a link. Please try again.");
        setBusy(null);
      } catch {
        setError("Something went wrong starting checkout. Please try again.");
        setBusy(null);
        router.refresh();
      }
    });
  }

  if (mode === "portal") {
    return (
      <div className="space-y-3">
        {error ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full"
          disabled={!stripeReady || pending}
          onClick={() => run("portal", () => openBillingPortalAction(mutationContext))}
        >
          {busy === "portal" ? "Opening…" : "Open billing portal"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--plum)]/15 bg-[var(--cream-deep)]/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--plum)]/70">
            Monthly
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[var(--midnight)]">
            {PLAN_PRICES.monthly.amountLabel}
            <span className="text-base font-sans font-semibold text-[var(--midnight)]/55">
              /{PLAN_PRICES.monthly.periodLabel}
            </span>
          </p>
          <Button
            type="button"
            className="mt-4 w-full"
            disabled={!stripeReady || pending}
            onClick={() =>
              run("monthly", () => startCheckoutAction("monthly", mutationContext))
            }
          >
            {busy === "monthly" ? "Starting…" : "Start monthly"}
          </Button>
        </div>
        <div className="rounded-2xl border border-[var(--gold)]/40 bg-[var(--panel)] p-4 text-[var(--on-panel)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
            Yearly · best value
          </p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl">
            {PLAN_PRICES.yearly.amountLabel}
            <span className="text-base font-sans font-semibold text-[var(--on-panel)]/70">
              /{PLAN_PRICES.yearly.periodLabel}
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--on-panel)]/65">
            About $1.67/mo when billed annually
          </p>
          <Button
            type="button"
            variant="gold"
            className="mt-4 w-full"
            disabled={!stripeReady || pending}
            onClick={() => run("yearly", () => startCheckoutAction("yearly", mutationContext))}
          >
            {busy === "yearly" ? "Starting…" : "Start yearly"}
          </Button>
        </div>
      </div>
    </div>
  );
}
