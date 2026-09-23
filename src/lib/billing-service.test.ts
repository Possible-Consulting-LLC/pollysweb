import assert from "node:assert/strict";
import { test } from "node:test";
import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";
import { createDemoService } from './admin/demo-accounts';
import type { Actor } from './admin/policy';
import { createBillingService } from "./billing-service-core";

function fixture(legacyPrices: string[] = [], admit: () => Promise<void> = async () => {}) {
  const account = { isDemo: false, demoPlan: null as string | null, demoLabel: null as string | null, emailVerified: new Date(), suspendedAt: null, deletingAt: null, id: "keeper", plan: "free", stripeCustomerId: null as string | null, stripeSubscriptionId: null as string | null, stripePriceId: null as string | null, billingLastCheckedAt: null as Date | null, billingNextCheckAt: null as Date | null, billingCheckFailures: 2 };
  const subscriptions: Stripe.Subscription[] = [];
  const retrievedSubscriptions: Stripe.Subscription[] = [];
  const sessions: Stripe.Checkout.Session[] = [];
  const counts = { customer: 0, checkout: 0, updates: 0, reads: 0 };
  type Intent = { id: string; userId: string; interval: string; priceId: string; appUrl: string; customerId: string | null; phase: string; createdAt: Date };
  let intent: Intent | null = null;
  const faults = { rollbackAfterSession: false, ambiguousSession: false, ambiguousCustomer: false, rollbackAfterCustomer: false };
  const hooks: { beforeCustomer?: () => Promise<void> } = {};
  const intentTable = {
    findUnique: async () => intent ? { ...intent } : null,
    findUniqueOrThrow: async () => { if (!intent) throw Error('Missing intent'); return { ...intent }; },
    create: async ({ data }: { data: Intent }) => { intent = { ...data, phase: data.phase ?? 'prepare', createdAt: data.createdAt ?? new Date() }; return intent; },
    update: async ({ data }: { data: Partial<Intent> }) => { Object.assign(intent!, data); return intent; },
    delete: async () => { intent = null; },
  };
  let locked = false;
  let queue = Promise.resolve();
  const table = {
    findUnique: async ({ where }: { where: { stripeCustomerId?: string } }) => where.stripeCustomerId === account.stripeCustomerId ? { id: account.id } : null,
    findUniqueOrThrow: async () => ({ ...account }),
    update: async ({ data }: { data: Partial<typeof account> }) => { assert.ok(locked); counts.updates++; Object.assign(account, data); return account; },
  };
  const tx = { billingCheckoutIntent: intentTable, user: table, $queryRaw: async () => { locked = true; return [{ id: account.id }]; } };
  const database = {
    user: table, billingCheckoutIntent: intentTable,
    $transaction: (run: (tx: unknown) => Promise<unknown>) => {
      const result = queue.then(async () => {
        const beforeAccount = { ...account }, beforeIntent = intent ? { ...intent } : null;
        const beforeSessions = sessions.length, beforeCustomers = counts.customer;
        try {
          const result = await run(tx);
          if (faults.rollbackAfterCustomer && counts.customer > beforeCustomers) { faults.rollbackAfterCustomer = false; throw Error('Lost customer acknowledgment'); }
          if (faults.rollbackAfterSession && sessions.length > beforeSessions) { faults.rollbackAfterSession = false; throw Error('Lost database acknowledgment'); }
          return result;
        } catch (error) { Object.assign(account, beforeAccount); intent = beforeIntent; throw error; }
        finally { locked = false; }
      });
      queue = result.then(() => {}, () => {});
      return result;
    },
  };
  function page<T>(items: T[]) {
    return Object.assign(Promise.resolve({ data: items }), { async *[Symbol.asyncIterator]() { yield* items; } });
  }
  let remoteCustomer: { id: string; metadata: { userId: string } } | null = null;
  const idempotentSessions = new Map<string, Stripe.Checkout.Session>();
  const stripe = {
    customers: {
      create: async () => {
        assert.ok(intent, 'customer create must have a committed intent');
        await hooks.beforeCustomer?.();
        if (remoteCustomer) return remoteCustomer;
        counts.customer++;
        remoteCustomer = { id: 'customer', metadata: { userId: 'keeper' } };
        if (faults.ambiguousCustomer) { faults.ambiguousCustomer = false; throw Error('Customer timeout'); }
        return remoteCustomer;
      },
      retrieve: async (id: string) => ({ id, metadata: { userId: "keeper" } }),
    },
    subscriptions: {
      list: () => { assert.ok(locked, "fetch current Stripe state only after locking"); counts.reads++; return page(subscriptions); },
      retrieve: async (id: string) => [...subscriptions, ...retrievedSubscriptions].find((sub) => sub.id === id),
    },
    checkout: { sessions: {
      list: (args: { status?: string; limit?: number }) => page(args.status ? sessions.filter((s) => s.status === args.status) : args.limit === 1 ? sessions.slice(-1) : sessions),
      create: async (args: { metadata: Record<string, string> }, options: { idempotencyKey: string }) => {
        const cached = idempotentSessions.get(options.idempotencyKey);
        if (cached) return cached;
        counts.checkout++;
        const session = { id: `session_${counts.checkout}`, mode: "subscription", status: "open", url: "https://checkout.stripe.com/fixture", metadata: args.metadata } as Stripe.Checkout.Session;
        sessions.push(session);
        idempotentSessions.set(options.idempotencyKey, session);
        if (faults.ambiguousSession) { faults.ambiguousSession = false; throw Error('Network timeout'); }
        return session;
      },
    } },
  };
  const service = createBillingService({
    prisma: database as unknown as PrismaClient,
    getStripe: () => stripe as unknown as Stripe,
    priceIdForInterval: (interval) => `price_${interval}`,
    legacyPriceIds: () => legacyPrices,
    appUrl: () => "https://example.test",
    admit,
  });
  return { database, tx, faults, hooks, intent: () => intent, account, subscriptions, retrievedSubscriptions, sessions, counts, stripe, ...service };
}

function subscription(id: string, status: Stripe.Subscription.Status, created: number) {
  return { id, status, created, metadata: { userId: "keeper", interval: "monthly" }, items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1800000000 }] } } as unknown as Stripe.Subscription;
}

function unrelatedSubscription(id: string, status: Stripe.Subscription.Status, created: number) {
  return {
    ...subscription(id, status, created),
    metadata: {},
    items: { data: [{ price: { id: "price_unrelated" }, current_period_end: 1800000000 }] },
  } as Stripe.Subscription;
}

test("two simultaneous checkout attempts create one customer and one checkout", async () => {
  const f = fixture();
  const [first, second] = await Promise.all([f.checkoutForUser("keeper", "monthly"), f.checkoutForUser("keeper", "monthly")]);
  assert.deepEqual(first, second);
  assert.equal(f.counts.customer, 1);
  assert.equal(f.counts.checkout, 1);
});

test("a new Stripe customer enters the due queue before its first webhook", async () => {
  const f = fixture();
  const before = Date.now();

  await f.checkoutForUser("keeper", "monthly");

  assert.ok(f.account.billingNextCheckAt instanceof Date);
  assert.ok(f.account.billingNextCheckAt.getTime() >= before);
  assert.equal(f.account.billingLastCheckedAt, null);
});

test("an active Stripe subscription blocks checkout even when the local plan is stale", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push(subscription("existing", "active", 1));
  await assert.rejects(f.checkoutForUser("keeper", "yearly"), /already have a subscription/);
  assert.equal(f.counts.checkout, 0);
});

test("an unrelated active subscription does not block Pro checkout", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push(unrelatedSubscription("unrelated", "active", 1));

  const result = await f.checkoutForUser("keeper", "monthly");

  assert.equal(result.url, "https://checkout.stripe.com/fixture");
  assert.equal(f.counts.checkout, 1);
});

test("a completed unrelated checkout missing from subscription list does not block Pro checkout", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.retrievedSubscriptions.push(unrelatedSubscription("unrelated", "active", 1));
  f.sessions.push({ mode: "subscription", status: "complete", subscription: "unrelated" } as Stripe.Checkout.Session);

  const result = await f.checkoutForUser("keeper", "monthly");

  assert.equal(result.url, "https://checkout.stripe.com/fixture");
  assert.equal(f.counts.checkout, 1);
});

test("a completed Pro checkout missing from subscription list still blocks duplicate checkout", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.retrievedSubscriptions.push(subscription("recent_pro", "active", 1));
  f.sessions.push({ mode: "subscription", status: "complete", subscription: "recent_pro" } as Stripe.Checkout.Session);

  await assert.rejects(f.checkoutForUser("keeper", "monthly"), /already have a subscription/);
  assert.equal(f.counts.checkout, 0);
});

test("an unrelated open checkout does not block Pro checkout", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.sessions.push({ id: "foreign", mode: "subscription", status: "open", url: "https://checkout.stripe.com/foreign", metadata: {} } as Stripe.Checkout.Session);

  const result = await f.checkoutForUser("keeper", "monthly");

  assert.equal(result.url, "https://checkout.stripe.com/fixture");
  assert.equal(f.counts.checkout, 1);
});

test("new checkout sessions record the exact price used", async () => {
  const f = fixture();

  await f.checkoutForUser("keeper", "monthly");

  assert.equal(f.sessions[0]?.metadata?.priceId, "price_monthly");
});

test("an open checkout for an unknown rotated price is not reused", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.sessions.push({ id: "old", mode: "subscription", status: "open", url: "https://checkout.stripe.com/old", metadata: { userId: "keeper", interval: "monthly", priceId: "price_old_monthly" } } as unknown as Stripe.Checkout.Session);

  await assert.rejects(f.checkoutForUser("keeper", "monthly"), /outdated|review/i);
  assert.equal(f.counts.checkout, 0);
});

test("an open checkout for an allowlisted legacy price can be reused", async () => {
  const f = fixture(["price_old_monthly"]);
  f.account.stripeCustomerId = "customer";
  f.sessions.push({ id: "old", mode: "subscription", status: "open", url: "https://checkout.stripe.com/old", metadata: { userId: "keeper", interval: "monthly", priceId: "price_old_monthly" } } as unknown as Stripe.Checkout.Session);

  const result = await f.checkoutForUser("keeper", "monthly");

  assert.equal(result.url, "https://checkout.stripe.com/old");
  assert.equal(f.counts.checkout, 0);
});

test("an app checkout opened before price metadata existed is held for review", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.sessions.push({ id: "old", mode: "subscription", status: "open", url: "https://checkout.stripe.com/old", metadata: { userId: "keeper", interval: "monthly" } } as unknown as Stripe.Checkout.Session);

  await assert.rejects(f.checkoutForUser("keeper", "monthly"), /outdated|review/i);
  assert.equal(f.counts.checkout, 0);
});

test("an allowlisted legacy Pro price keeps access and blocks duplicate checkout", async () => {
  const f = fixture(["price_legacy"]);
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push({
    ...subscription("legacy_pro", "active", 1),
    items: { data: [{ price: { id: "price_legacy" }, current_period_end: 1800000000 }] },
  } as Stripe.Subscription);

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.plan, "pro");
  assert.equal(f.account.stripeSubscriptionId, "legacy_pro");
  await assert.rejects(f.checkoutForUser("keeper", "monthly"), /already have a subscription/);
  assert.equal(f.counts.checkout, 0);
});

test("past-due Stripe state revokes Pro while retaining the subscription for recovery", async () => {
  const f = fixture();
  f.account.plan = "pro";
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push(subscription("failed_payment", "past_due", 1));

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.plan, "free");
  assert.equal(f.account.stripeSubscriptionId, "failed_payment");
  await assert.rejects(f.checkoutForUser("keeper", "monthly"), /already have a subscription/);
});

test("switching a recorded legacy subscription to an unrelated price revokes Pro", async () => {
  const f = fixture();
  f.account.plan = "pro";
  f.account.stripeCustomerId = "customer";
  f.account.stripeSubscriptionId = "legacy_pro";
  f.account.stripePriceId = "price_legacy";
  f.subscriptions.push({
    ...subscription("legacy_pro", "active", 1),
    items: { data: [{ price: { id: "price_unrelated" }, current_period_end: 1800000000 }] },
  } as Stripe.Subscription);

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.plan, "free");
  assert.equal(f.account.stripeSubscriptionId, null);
  assert.equal(f.account.stripePriceId, null);
});

test("matching metadata and legacy price do not grant Pro to a different subscription", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.account.stripeSubscriptionId = "recorded_pro";
  f.account.stripePriceId = "price_legacy";
  f.subscriptions.push({
    ...subscription("other_subscription", "active", 1),
    items: { data: [{ price: { id: "price_legacy" }, current_period_end: 1800000000 }] },
  } as Stripe.Subscription);

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.plan, "free");
  assert.equal(f.account.stripeSubscriptionId, null);
});

test("a tainted recorded subscription at an unapproved price cannot start another checkout", async () => {
  const f = fixture();
  f.account.plan = "pro";
  f.account.stripeCustomerId = "customer";
  f.account.stripeSubscriptionId = "legacy_pro";
  f.account.stripePriceId = "price_legacy";
  f.subscriptions.push({
    ...subscription("legacy_pro", "active", 1),
    items: { data: [{ price: { id: "price_unrelated" }, current_period_end: 1800000000 }] },
  } as Stripe.Subscription);

  await assert.rejects(f.checkoutForUser("keeper", "monthly"), /review|configuration/i);
  assert.equal(f.counts.checkout, 0);
});

test("delayed webhook triggers reconcile live state and keep a replacement subscription", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push(subscription("old", "canceled", 1), subscription("new", "active", 2));
  await Promise.all([f.reconcileStripeCustomer("customer"), f.reconcileStripeCustomer("customer")]);
  assert.equal(f.account.plan, "pro");
  assert.equal(f.account.stripeSubscriptionId, "new");
  f.subscriptions[1] = subscription("new", "canceled", 2);
  await f.reconcileStripeCustomer("customer");
  assert.equal(f.account.plan, "free");
});

test("successful reconciliation records freshness and clears retry failures under the billing lock", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push(subscription("pro", "active", 1));
  const before = Date.now();

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.billingCheckFailures, 0);
  assert.ok(f.account.billingLastCheckedAt instanceof Date);
  assert.ok(f.account.billingLastCheckedAt.getTime() >= before);
  assert.ok(f.account.billingNextCheckAt instanceof Date);
  assert.ok(f.account.billingNextCheckAt.getTime() > f.account.billingLastCheckedAt.getTime());
  assert.ok(f.account.billingNextCheckAt.getTime() - f.account.billingLastCheckedAt.getTime() < 24 * 60 * 60 * 1000);
});

test("failed ownership verification leaves entitlement and check metadata unchanged", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.account.plan = "pro";
  f.subscriptions.push({ ...subscription("bad", "active", 1), metadata: { userId: "intruder" } });

  await assert.rejects(f.reconcileStripeCustomer("customer"), /ownership/);

  assert.equal(f.account.plan, "pro");
  assert.equal(f.account.billingLastCheckedAt, null);
  assert.equal(f.account.billingNextCheckAt, null);
  assert.equal(f.account.billingCheckFailures, 2);
});

test("unknown customer and conflicting metadata never mutate another account", async () => {
  const f = fixture();
  await f.reconcileStripeCustomer("unowned");
  assert.equal(f.counts.updates, 0);
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push({ ...subscription("bad", "active", 1), metadata: { userId: "someone_else" } });
  await assert.rejects(f.reconcileStripeCustomer("customer"), /ownership/);
  assert.equal(f.counts.updates, 0);
});

test("an active subscription for another price does not grant Pro", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push(unrelatedSubscription("unrelated", "active", 1));

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.plan, "free");
  assert.equal(f.account.stripeSubscriptionId, null);
});

test("user metadata without this app's billing interval does not mark a foreign price as Pro", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push({
    ...unrelatedSubscription("unrelated", "active", 1),
    metadata: { userId: "keeper" },
  });

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.plan, "free");
  assert.equal(f.account.stripeSubscriptionId, null);
});

test("an approved active subscription wins over a newer unrelated subscription", async () => {
  const f = fixture();
  f.account.stripeCustomerId = "customer";
  f.subscriptions.push(
    subscription("pro", "active", 1),
    unrelatedSubscription("unrelated", "active", 2),
  );

  await f.reconcileStripeCustomer("customer");

  assert.equal(f.account.plan, "pro");
  assert.equal(f.account.stripeSubscriptionId, "pro");
});

test('demo checkout is rejected before creating customer or session', async () => {
  const f = fixture(); f.account.isDemo = true; f.account.demoPlan = 'free';
  await assert.rejects(f.checkoutForUser('keeper', 'monthly'), /demo/i);
  assert.equal(f.counts.customer, 0); assert.equal(f.counts.checkout, 0);
});
for (const fault of ['ambiguousSession', 'rollbackAfterSession'] as const) {
  test(`durable checkout replays exact request after ${fault}, even if list response hides it`, async () => {
    const f = fixture(); f.faults[fault] = true;
    await assert.rejects(f.checkoutForUser('keeper', 'monthly'));
    assert.ok(f.intent(), 'intent must survive failed transaction');
    f.sessions.length = 0;
    const result = await f.checkoutForUser('keeper', 'monthly');
    assert.equal(result.url, 'https://checkout.stripe.com/fixture');
    assert.equal(f.counts.checkout, 1, 'idempotent replay must not create another checkout');
    assert.equal(f.intent(), null);
  });
}
test('unexpected demo subscriptions surface a durable operations error and retain demo plan and billing snapshot', async () => {
  const f = fixture(); f.account.isDemo = true; f.account.demoPlan = 'pro'; f.account.stripeCustomerId = 'customer';
  f.subscriptions.push(subscription('unexpected', 'active', 1));
  await assert.rejects(f.reconcileStripeCustomer('customer'), /demo/i);
  assert.equal(f.account.plan, 'free'); assert.equal(f.account.demoPlan, 'pro');
  assert.ok(f.account.billingCheckFailures > 0);
});
test('empty demo customer reconciliation stops periodic billing checks without changing plan', async () => {
  const f = fixture(); f.account.isDemo = true; f.account.demoPlan = 'pro'; f.account.stripeCustomerId = 'customer';
  await f.reconcileStripeCustomer('customer');
  assert.equal(f.account.demoPlan, 'pro'); assert.equal(f.account.plan, 'free'); assert.equal(f.account.billingNextCheckAt, null);
});

test('demo portal is rejected by the service before any external call', async () => {
  const f = fixture(); f.account.isDemo = true;
  await assert.rejects(f.portalForUser('keeper'), /demo/i);
});
test('expired uncertain checkout cannot be replayed with a potentially pruned key', async () => {
  const f = fixture(); f.faults.ambiguousSession = true;
  await assert.rejects(f.checkoutForUser('keeper', 'monthly'));
  f.intent()!.createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await assert.rejects(f.checkoutForUser('keeper', 'monthly'), /investigation/);
  assert.ok(f.intent()); assert.equal(f.counts.checkout, 1);
});

test('known preflight rejection settles intent so ordinary subscribed accounts remain deletable', async () => {
  const f = fixture(); f.account.stripeCustomerId = 'customer'; f.subscriptions.push(subscription('existing', 'active', 1));
  await assert.rejects(f.checkoutForUser('keeper', 'monthly'), /already have a subscription/);
  assert.equal(f.intent(), null, 'no remote create remains in flight after preflight rejection');
});

for (const fault of ['ambiguousCustomer', 'rollbackAfterCustomer'] as const) {
  test(`customer ${fault} retains durable request even without any acknowledged IDs`, async () => {
    const f = fixture(); f.faults[fault] = true;
    await assert.rejects(f.checkoutForUser('keeper', 'monthly'));
    assert.equal(f.account.stripeCustomerId, null); assert.ok(f.intent());
    await f.checkoutForUser('keeper', 'monthly');
    assert.equal(f.counts.customer, 1); assert.equal(f.counts.checkout, 1); assert.equal(f.intent(), null);
  });
}
test('acknowledged new customer commits even when subscription preflight rejects checkout', async () => {
  const f = fixture(); f.subscriptions.push(subscription('existing', 'active', 1));
  await assert.rejects(f.checkoutForUser('keeper', 'monthly'), /already have/);
  assert.equal(f.account.stripeCustomerId, 'customer'); assert.equal(f.intent(), null); assert.equal(f.counts.checkout, 0);
});
const demoActor: Actor = { id: 'super', role: 'super_admin', owner: false, suspended: false, credentialVersion: 'v', reauthenticatedAt: Date.now() };
function demoFor(f: ReturnType<typeof fixture>) {
  return createDemoService({
    withLocked: (_id, work) => f.database.$transaction(async tx => { await f.tx.$queryRaw(); return work(tx as import('@prisma/client').Prisma.TransactionClient, demoActor, { id: 'keeper', role: 'user', demo: f.account.isDemo, owner: false }); }) as Promise<never>,
    getStripe: () => f.stripe as unknown as Stripe,
    audit: async () => {},
  });
}
test('committed intent wins a concurrent designation race while customer request is held at a barrier', async () => {
  const f = fixture(); const demo = demoFor(f);
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.hooks.beforeCustomer = async () => { entered(); await gate; };
  const checkout = f.checkoutForUser('keeper', 'monthly'); await reached;
  const designation = demo.setDemoAccount(demoActor, 'keeper', { label: 'Test', plan: 'pro', confirmedDedicatedTestAccount: true }, 'Test race');
  release();
  await assert.rejects(designation, /unresolved checkout/); await checkout;
  assert.equal(f.account.isDemo, false); assert.equal(f.counts.checkout, 1);
});
test('designation that wins the User lock prevents a concurrent checkout from reserving or calling Stripe', async () => {
  const f = fixture(); const demo = demoFor(f);
  const designation = demo.setDemoAccount(demoActor, 'keeper', { label: 'Test', plan: 'pro', confirmedDedicatedTestAccount: true }, 'Test race');
  const checkout = f.checkoutForUser('keeper', 'monthly');
  await designation; await assert.rejects(checkout, /demo/i);
  assert.equal(f.counts.customer, 0); assert.equal(f.counts.checkout, 0); assert.equal(f.intent(), null);
});

test('demo reconciliation reports completed checkout history even before a subscription becomes visible', async () => {
 const f = fixture(); f.account.isDemo = true; f.account.demoPlan = 'pro'; f.account.stripeCustomerId = 'customer';
 f.account.billingCheckFailures = 0;
 f.sessions.push({ id: 'completed', mode: 'subscription', status: 'complete' } as Stripe.Checkout.Session,
   { id: 'expired', mode: 'subscription', status: 'expired' } as Stripe.Checkout.Session);
 await assert.rejects(f.reconcileStripeCustomer('customer'), /demo/i);
 assert.equal(f.account.billingCheckFailures, 1); assert.equal(f.account.demoPlan, 'pro'); assert.equal(f.account.plan, 'free');
});

test('conflicting demo subscription ownership still records a visible operations failure without changing entitlements', async () => {
 const f = fixture(); f.account.isDemo = true; f.account.demoPlan = 'free'; f.account.stripeCustomerId = 'customer'; f.account.billingCheckFailures = 0;
 f.subscriptions.push({ ...subscription('foreign', 'active', 1), metadata: { userId: 'another' } });
 await assert.rejects(f.reconcileStripeCustomer('customer'));
 assert.equal(f.account.billingCheckFailures, 1); assert.equal(f.account.plan, 'free'); assert.equal(f.account.demoPlan, 'free');
});

test('maintenance cutoff before next billing phase retains committed intent without remote checkout',async()=>{
 let calls=0;const f=fixture([],async()=>{if(++calls===2)throw Error('maintenance');});
 await assert.rejects(f.checkoutForUser('keeper','monthly'),/maintenance/);
 assert.ok(f.intent());assert.equal(f.counts.customer,0);assert.equal(f.counts.checkout,0);
});
test('already admitted remote customer acknowledges durably before blocked checkout phase',async()=>{
 let active=false;const f=fixture([],async()=>{if(active)throw Error('maintenance');});
 f.hooks.beforeCustomer=async()=>{active=true;};
 await assert.rejects(f.checkoutForUser('keeper','monthly'),/maintenance/);
 assert.equal(f.account.stripeCustomerId,'customer');assert.ok(f.intent());assert.equal(f.counts.checkout,0);
});
