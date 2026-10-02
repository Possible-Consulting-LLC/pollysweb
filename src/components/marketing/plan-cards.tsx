"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Crown, Leaf, Sprout, Star } from "lucide-react";
import {
  annualFreeMonths,
  ctaForPlan,
  planHasNoPrice,
  type PublicPlan,
} from "@/lib/public-pricing";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "yearly";

const CARD_ICONS = [Leaf, Sprout, Crown, Star];

function formatCents(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function PlanCards({
  plans,
  isAuthed,
  currentPlanId,
}: {
  plans: PublicPlan[];
  isAuthed: boolean;
  currentPlanId: string | null;
}) {
  const [interval, setInterval] = useState<Interval>("yearly");

  return (
    <div>
      <div className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-[var(--plum)]/15 bg-[var(--card-solid)] p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          aria-pressed={interval === "monthly"}
          className={cn(
            "rounded-full px-5 py-2 text-sm font-bold transition",
            interval === "monthly" ? "bg-[var(--lavender)]/70 text-[var(--plum)]" : "text-[var(--midnight)]/60 hover:text-[var(--plum)]",
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("yearly")}
          aria-pressed={interval === "yearly"}
          className={cn(
            "rounded-full px-5 py-2 text-sm font-bold transition",
            interval === "yearly" ? "bg-[var(--plum)] text-[var(--on-accent)] shadow-sm" : "text-[var(--midnight)]/60 hover:text-[var(--plum)]",
          )}
        >
          Yearly
        </button>
      </div>

      <div className={cn("grid gap-5", pricingGrid(plans.length))}>
        {plans.map((plan, index) => {
          const Icon = CARD_ICONS[Math.min(index, CARD_ICONS.length - 1)];
          const badge = plans.length === 3 && index === 1;
                    const savings = annualFreeMonths(plan.monthlyCents, plan.annualCents);
          const noPrice = planHasNoPrice(plan);
          const cta = ctaForPlan(plan, currentPlanId === plan.id, isAuthed);
          const showMonthly = interval === "monthly" || plan.annualCents === null;
          const priceCents = showMonthly ? plan.monthlyCents : plan.annualCents;

          return (
            <article
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-[2rem] border bg-[var(--card-solid)] p-6 shadow-[0_12px_40px_var(--shadow)] sm:p-7",
                badge ? "border-orange-400/60" : "border-[var(--plum)]/10",
              )}
            >
              {badge ? (
                <span className="absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-orange-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm">
                  <HeartGlyph /> Most Popular
                </span>
              ) : null}
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--lavender)]/60 text-[var(--plum)]">
                <Icon className="h-5.5 w-5.5" aria-hidden />
              </span>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
                {plan.name}
              </h3>
              {plan.blurb ? <p className="mt-0.5 text-sm text-[var(--midnight)]/60">{plan.blurb}</p> : null}

              <div className="mt-5">
                {noPrice ? (
                  <p className="text-3xl font-bold text-[var(--midnight)]">Contact us</p>
                ) : (
                  <>
                    <p className="font-[family-name:var(--font-display)] text-4xl font-bold text-[var(--midnight)]">
                      ${priceCents !== null ? formatCents(priceCents) : "—"}
                      <span className="text-base font-semibold text-[var(--midnight)]/55">
                        {showMonthly ? "/mo" : "/yr"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--midnight)]/55">
                      {showMonthly
                        ? plan.annualCents !== null
                          ? `or $${formatCents(plan.annualCents)}/yr`
                          : "billed monthly"
                        : `equivalent to $${formatCents(Math.round(plan.annualCents! / 12))}/mo`}
                    </p>
                    {interval === "yearly" && savings !== null && savings > 0 ? (
                      <p className="mt-1 inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                        {savings} {savings === 1 ? "month" : "months"} free!
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-[var(--midnight)]/75">
                {plan.features.map((feature) => (
                  <li key={feature.name} className="inline-flex w-full items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
                    {feature.name}
                  </li>
                ))}
              </ul>

              {cta.href ? (
                <Link
                  href={cta.href}
                  className={cn(
                    "mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition",
                    badge
                      ? "bg-orange-500 text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)] hover:bg-orange-600"
                      : index === plans.length - 1
                        ? "bg-[var(--plum)] text-[var(--on-accent)] hover:bg-[var(--plum-deep)]"
                        : "border border-[var(--plum)]/30 text-[var(--plum)] hover:bg-[var(--hover)]",
                  )}
                >
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : (
                <span
                  aria-disabled
                  className="mt-6 inline-flex items-center justify-center rounded-full border border-[var(--plum)]/15 bg-[var(--card)] px-6 py-3 text-sm font-bold text-[var(--midnight)]/50"
                >
                  Your current plan
                </span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function pricingGrid(count: number): string {
  if (count <= 1) return "mx-auto max-w-md";
  if (count === 2) return "sm:grid-cols-2 max-w-2xl mx-auto";
  if (count === 3) return "sm:grid-cols-2 lg:grid-cols-3";
  return "sm:grid-cols-2 lg:grid-cols-4";
}

function HeartGlyph() {
  return <span aria-hidden>🧡</span>;
}