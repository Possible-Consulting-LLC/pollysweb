type SubscriptionSummary = { id: string; status: string; created: number };
type CheckoutSummary = {
  id: string;
  mode: string | null;
  status: string | null;
  url: string | null;
  metadata: Record<string, string> | null;
};

export function grantsPro(status: string) {
  return status === "active" || status === "trialing";
}

export function needsBillingRecovery(
  customerId: string | null,
  subscriptionId: string | null,
  status: string | null,
) {
  return Boolean(customerId && subscriptionId && status &&
    !["canceled", "incomplete_expired"].includes(status));
}

export function verifyCustomerOwner(
  userId: string,
  storedCustomerId: string | null,
  customer: { id: string; deleted?: boolean | void; metadata?: Record<string, string> },
) {
  if (!storedCustomerId || customer.deleted || storedCustomerId !== customer.id ||
      (customer.metadata?.userId && customer.metadata.userId !== userId)) {
    throw new Error("Stripe customer ownership could not be verified.");
  }
}

/** Prefer a currently entitled subscription over old cancellations/replacements. */
export function chooseSubscription<T extends SubscriptionSummary>(subscriptions: T[]): T | null {
  return [...subscriptions].sort((a, b) =>
    Number(grantsPro(b.status)) - Number(grantsPro(a.status)) || b.created - a.created || b.id.localeCompare(a.id),
  )[0] ?? null;
}

export function checkoutDecision<T extends CheckoutSummary>(
  subscriptions: SubscriptionSummary[],
  sessions: T[],
  interval: string,
): T | null {
  if (subscriptions.some((subscription) => !["canceled", "incomplete_expired"].includes(subscription.status))) {
    throw new Error("You already have a subscription. Use Manage billing to make changes.");
  }
  const open = sessions.filter((session) => session.mode === "subscription" && session.status === "open");
  if (open.length > 1) throw new Error("Multiple checkout sessions are pending. Please contact support before starting another.");
  if (open[0] && (open[0].metadata?.interval !== interval || !open[0].url)) {
    throw new Error("A checkout is already in progress for another plan. Finish that checkout or wait for it to expire.");
  }
  return open[0] ?? null;
}
