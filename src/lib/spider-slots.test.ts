import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma } from "@prisma/client";
import { runWithSpiderSlot } from "./spider-slots";

test("concurrent free-plan additions cannot both consume the last slot", async () => {
  let active = 0;
  let releasePrevious = Promise.resolve();

  async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const previous = releasePrevious;
    releasePrevious = released;
    let locked = false;
    const tx = {
      $queryRaw: async () => {
        await previous;
        locked = true;
        return [{ id: "keeper" }];
      },
      user: { findUniqueOrThrow: async () => ({ plan: "free" }) },
      spider: { count: async () => active },
    } as unknown as Prisma.TransactionClient;
    try {
      const result = await work(tx);
      assert.equal(locked, true, "slot decision must hold the keeper lock");
      return result;
    } finally {
      release();
    }
  }

  const [first, second] = await Promise.all([
    transaction((tx) => runWithSpiderSlot(tx, "keeper", async () => { active++; return "created"; })),
    transaction((tx) => runWithSpiderSlot(tx, "keeper", async () => { active++; return "restored"; })),
  ]);

  assert.equal(active, 1);
  assert.deepEqual([first.ok, second.ok], [true, false]);
});

test("Pro additions are allowed without applying the free slot limit", async () => {
  const tx = {
    $queryRaw: async () => [{ id: "keeper" }],
    user: { findUniqueOrThrow: async () => ({ plan: "pro" }) },
    spider: { count: async () => { throw new Error("free limit must not be checked"); } },
  } as unknown as Prisma.TransactionClient;

  const result = await runWithSpiderSlot(tx, "keeper", async () => "created");
  assert.deepEqual(result, { ok: true, value: "created" });
});

test("past-due Stripe accounts cannot add a spood beyond the Free limit", async () => {
  const tx = {
    $queryRaw: async () => [{ id: "keeper" }],
    user: { findUniqueOrThrow: async () => ({
      plan: "pro", stripeCustomerId: "cus_1", subscriptionStatus: "past_due",
      billingLastCheckedAt: new Date(),
    }) },
    spider: { count: async () => 2 },
  } as unknown as Prisma.TransactionClient;

  const result = await runWithSpiderSlot(tx, "keeper", async () => "created");
  assert.deepEqual(result, { ok: false, freeLimit: 1 });
});

test("stale Stripe-backed Pro cannot add another spood", async () => {
  const tx = {
    $queryRaw: async () => [{ id: "keeper" }],
    user: { findUniqueOrThrow: async () => ({
      plan: "pro", stripeCustomerId: "cus_1", subscriptionStatus: "active",
      billingLastCheckedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    }) },
    spider: { count: async () => 2 },
  } as unknown as Prisma.TransactionClient;

  const result = await runWithSpiderSlot(tx, "keeper", async () => "created");
  assert.deepEqual(result, { ok: false, freeLimit: 1 });
});

test('demo overrides control active-spood creation and restoration limits', async () => {
  for (const [demoPlan, plan, expected] of [['pro', 'free', true], ['free', 'pro', false]] as const) {
    const tx = {
      $queryRaw: async () => [],
      user: { findUniqueOrThrow: async ({ select }: { select: Record<string, boolean> }) => {
        const row = { plan, isDemo: true, demoPlan, stripeCustomerId: null, subscriptionStatus: null, billingLastCheckedAt: null };
        return Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
      } },
      spider: { count: async () => 3 },
    } as unknown as Prisma.TransactionClient;
    assert.equal((await runWithSpiderSlot(tx, 'demo', async () => 'created')).ok, expected);
  }
});
