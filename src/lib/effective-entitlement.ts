export type DemoPlan = "free" | "pro";

export type BillingEntitlementSnapshot = {
  isDemo: boolean;
  demoPlan: string | null;
  plan: string;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  billingLastCheckedAt: Date | null;
};

export function effectivePro(user: BillingEntitlementSnapshot, now: Date = new Date()): boolean {
  if (user.isDemo) return user.demoPlan === "pro";
  if (user.plan !== "pro") return false;
  if (!user.stripeCustomerId) return true;
  if (!grantsPro(user.subscriptionStatus ?? "") || !user.billingLastCheckedAt) return false;
  const age = now.getTime() - user.billingLastCheckedAt.getTime();
  return age >= 0 && age <= MAX_BILLING_SNAPSHOT_AGE_MS;
}
import { grantsPro } from "./billing-policy";

export const MAX_BILLING_SNAPSHOT_AGE_MS = 24 * 60 * 60 * 1000;
