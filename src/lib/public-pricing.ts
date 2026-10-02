export type PublicPlan = {
  id: string;
  name: string;
  blurb: string | null;
  maxSpiders: number | null;
  monthlyCents: number | null;
  annualCents: number | null;
  features: Array<{ name: string; category: string }>;
};

/** Grid shape for the card container, adaptive to how many plans exist. */
export function pricingGridClass(count: number): string {
  if (count <= 1) return "mx-auto max-w-md";
  if (count === 2) return "sm:grid-cols-2 max-w-2xl mx-auto";
  if (count === 3) return "sm:grid-cols-2 lg:grid-cols-3";
  return "sm:grid-cols-2 lg:grid-cols-4";
}

/** How many free months the annual price represents versus monthly×12, or
 * null when no meaningful comparison exists (missing interval, zero price,
 * or annual costs at least monthly×12). */
export function annualFreeMonths(
  monthlyCents: number | null,
  annualCents: number | null,
): number | null {
  if (monthlyCents === null || annualCents === null || monthlyCents <= 0 || annualCents <= 0) {
    return null;
  }
  const freeMonths = Math.round(12 - annualCents / monthlyCents);
  return freeMonths > 0 ? freeMonths : null;
}

export type PlanCta = { label: string; href: string | null };

/** CTA per card: anonymous visitors go to registration, authed keepers to the
 * upgrade flow, and the current plan is non-actionable. */
export function ctaForPlan(
  plan: Pick<PublicPlan, "name" | "monthlyCents" | "annualCents">,
  isCurrentPlan: boolean,
  isAuthed: boolean,
): PlanCta {
  const isFree = plan.monthlyCents === 0 || (plan.monthlyCents === null && plan.annualCents === null);
  if (isCurrentPlan) return { label: "Your current plan", href: null };
  if (isAuthed) return { label: `Upgrade to ${plan.name}`, href: "/upgrade" };
  if (isFree) return { label: "Start Free", href: "/register" };
  return { label: `Get ${plan.name}`, href: "/register" };
}

/** True when a plan should show "Contact us" instead of a price. */
export function planHasNoPrice(plan: Pick<PublicPlan, "monthlyCents" | "annualCents">): boolean {
  return plan.monthlyCents === null && plan.annualCents === null;
}