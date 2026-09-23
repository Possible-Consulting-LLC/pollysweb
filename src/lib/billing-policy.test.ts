import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseSubscription, verifyCustomerOwner, checkoutDecision, grantsPro, needsBillingRecovery } from "./billing-policy";

test("past-due subscriptions stop granting Pro immediately", () => {
  assert.equal(grantsPro("active"), true);
  assert.equal(grantsPro("trialing"), true);
  assert.equal(grantsPro("past_due"), false);
});

test("an active replacement wins over a newer past-due subscription", () => {
  assert.equal(chooseSubscription([
    { id: "paid", status: "active", created: 10 },
    { id: "failed", status: "past_due", created: 20 },
  ])?.id, "paid");
});

test("past-due and unpaid customers are sent to recovery, not another checkout", () => {
  assert.equal(needsBillingRecovery("cus_1", "sub_1", "past_due"), true);
  assert.equal(needsBillingRecovery("cus_1", "sub_1", "unpaid"), true);
  assert.equal(needsBillingRecovery("cus_1", "sub_1", "canceled"), false);
  assert.equal(needsBillingRecovery(null, null, null), false);
});

test("subscription metadata cannot assign another keeper's customer", () => {
  assert.throws(() => verifyCustomerOwner("user_a", "cus_a", { id: "cus_b", metadata: { userId: "user_a" } }), /ownership/);
  assert.throws(() => verifyCustomerOwner("user_a", "cus_a", { id: "cus_a", metadata: { userId: "user_b" } }), /ownership/);
  assert.doesNotThrow(() => verifyCustomerOwner("user_a", "cus_a", { id: "cus_a", metadata: {} }));
});

test("a deleted old subscription does not replace an active replacement", () => {
  assert.equal(chooseSubscription([
    { id: "old", status: "canceled", created: 10 },
    { id: "replacement", status: "active", created: 20 },
  ])?.id, "replacement");
});

test("current cancellation wins over the caller's old event snapshot", () => {
  assert.equal(chooseSubscription([{ id: "current", status: "canceled", created: 10 }])?.status, "canceled");
  assert.equal(chooseSubscription([]), null);
});

test("all nonterminal subscription statuses prevent a second checkout", () => {
  for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
    assert.throws(() => checkoutDecision([{ id: "sub", status, created: 1 }], [], "monthly"), /subscription/);
  }
});

test("an existing checkout is reused, and changing interval cannot create a second", () => {
  const sessions = [{ id: "cs_a", mode: "subscription", status: "open", url: "https://checkout.stripe.com/fixture", metadata: { interval: "monthly" } }];
  assert.equal(checkoutDecision([], sessions, "monthly")?.id, "cs_a");
  assert.throws(() => checkoutDecision([], sessions, "yearly"), /checkout/);
  assert.equal(checkoutDecision([{ id: "old", status: "canceled", created: 1 }], [], "monthly"), null);
});
