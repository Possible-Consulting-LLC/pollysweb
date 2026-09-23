import { isStaging } from "./staging-guard";

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

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function isStripeConfigured() {
  if (isStaging()) return false;
  const monthly = env("STRIPE_PRICE_MONTHLY");
  const yearly = env("STRIPE_PRICE_YEARLY");
  return Boolean(
    env("STRIPE_SECRET_KEY") &&
      env("STRIPE_WEBHOOK_SECRET") &&
      monthly?.startsWith("price_") &&
      yearly?.startsWith("price_") &&
      legacyProPriceIds().every((priceId) => priceId.startsWith("price_")),
  );
}

export function legacyProPriceIds(value = process.env.STRIPE_PRO_LEGACY_PRICE_IDS) {
  return value?.split(",").map((priceId) => priceId.trim()).filter(Boolean) ?? [];
}

export function stripeEnvStatus() {
  const secret = env("STRIPE_SECRET_KEY");
  const monthly = env("STRIPE_PRICE_MONTHLY");
  const yearly = env("STRIPE_PRICE_YEARLY");
  return {
    STRIPE_SECRET_KEY: Boolean(secret),
    STRIPE_SECRET_KEY_MODE: secret?.startsWith("sk_live_")
      ? "live"
      : secret?.startsWith("sk_test_")
        ? "test"
        : secret
          ? "unknown"
          : null,
    STRIPE_PRICE_MONTHLY: Boolean(monthly),
    STRIPE_PRICE_MONTHLY_KIND: monthly?.startsWith("price_")
      ? "price"
      : monthly?.startsWith("prod_")
        ? "product"
        : monthly
          ? "other"
          : null,
    STRIPE_PRICE_YEARLY: Boolean(yearly),
    STRIPE_PRICE_YEARLY_KIND: yearly?.startsWith("price_")
      ? "price"
      : yearly?.startsWith("prod_")
        ? "product"
        : yearly
          ? "other"
          : null,
    STRIPE_WEBHOOK_SECRET: Boolean(env("STRIPE_WEBHOOK_SECRET")),
  };
}

export function appUrl() {
  return (
    env("AUTH_URL") ||
    env("NEXTAUTH_URL") ||
    env("NEXT_PUBLIC_APP_URL") ||
    "http://127.0.0.1:43123"
  ).replace(/\/$/, "");
}
