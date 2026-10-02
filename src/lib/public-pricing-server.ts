import "server-only";
import { prisma } from "@/lib/db";
import { summarizePlanForPricing } from "@/lib/features/pricing";
import type { PublicPlan } from "./public-pricing";

export type { PublicPlan };

/** Loads the publicly sellable catalog: plans marked public AND active, in
 * admin-defined sort order, summarized through the same helper the admin
 * matrix previews with. Plans without an active price option surface as
 * null prices (rendered as "Contact us"). */
export async function loadPublicPricing(): Promise<PublicPlan[]> {
  const plans = await prisma.plan.findMany({
    where: { public: true, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      billingOptions: { where: { active: true } },
      featureTranslations: {
        where: { enabled: true },
        include: { feature: { select: { key: true } } },
      },
    },
  });

  return plans.map((plan) => {
    const summary = summarizePlanForPricing(
      { id: plan.id },
      plan.billingOptions,
      plan.featureTranslations.map((translation) => ({
        key: translation.feature.key,
        enabled: translation.enabled,
      })),
    );
    return {
      id: plan.id,
      name: plan.name,
      blurb: plan.description.trim().length > 0 ? plan.description : null,
      maxSpiders: plan.maxSpiders,
      monthlyCents: summary.monthlyCents,
      annualCents: summary.annualCents,
      features: summary.enabledFeatures.map((feature) => ({
        name: feature.name,
        category: feature.category,
      })),
    };
  });
}