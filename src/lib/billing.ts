export const FREE_SPIDER_LIMIT = 1;

export const PLAN_PRICES = {
  monthly: {
    amountLabel: "$1.99",
    periodLabel: "month",
    envPriceId: "STRIPE_PRICE_MONTHLY",
  },
  yearly: {
    amountLabel: "$19.99",
    periodLabel: "year",
    envPriceId: "STRIPE_PRICE_YEARLY",
  },
} as const;

export type BillingInterval = keyof typeof PLAN_PRICES;

export type PlanId = "free" | "pro";

export function normalizePlan(value: string | null | undefined): PlanId {
  return value === "pro" ? "pro" : "free";
}

export function isProPlan(value: string | null | undefined) {
  return normalizePlan(value) === "pro";
}

export function isStripeConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_MONTHLY &&
      process.env.STRIPE_PRICE_YEARLY,
  );
}

export function appUrl() {
  return (
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://127.0.0.1:43123"
  ).replace(/\/$/, "");
}
