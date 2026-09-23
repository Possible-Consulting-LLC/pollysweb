import assert from "node:assert/strict";
import test from "node:test";
import { assertSpiderWritableInTransaction, canWriteSpider, firstCreatedSpiderId } from "./spider-write-policy";

const baseUser = {
  isDemo: false, demoPlan: null, plan: "free",
  stripeCustomerId: null,
  subscriptionStatus: null,
  billingLastCheckedAt: null,
};

test("a free keeper can edit the oldest active spood", () => {
  assert.equal(canWriteSpider(baseUser, "oldest", "oldest"), true);
});

test("a free keeper cannot edit a later spood", () => {
  assert.equal(canWriteSpider(baseUser, "oldest", "later"), false);
});

test("past_due Pro billing makes later spoods read-only", () => {
  assert.equal(canWriteSpider({
    isDemo: false, demoPlan: null, plan: "pro",
    stripeCustomerId: "cus_123",
    subscriptionStatus: "past_due",
    billingLastCheckedAt: new Date(),
  }, "oldest", "later"), false);
});

test("effective Pro can edit any owned spood", () => {
  assert.equal(canWriteSpider({
    isDemo: false, demoPlan: null, plan: "pro",
    stripeCustomerId: "cus_123",
    subscriptionStatus: "active",
    billingLastCheckedAt: new Date(),
  }, "oldest", "later"), true);
});

test("no spood is writable when no first-created spood exists", () => {
  assert.equal(canWriteSpider(baseUser, null, "unknown"), false);
});

test("oldest spood selection excludes memorialized records and uses creation time then ID", () => {
  assert.equal(firstCreatedSpiderId([
    { id: "memorial", createdAt: new Date("2026-08-01"), memorializedAt: new Date("2026-09-10") },
    { id: "b", createdAt: new Date("2026-09-01"), memorializedAt: null },
    { id: "a", createdAt: new Date("2026-09-01"), memorializedAt: null },
  ]), "a");
});

test('demo Pro permits later spood writes while demo Free retains first-spood restriction', () => {
  assert.equal(canWriteSpider({ ...baseUser, isDemo: true, demoPlan: 'pro' }, 'oldest', 'later'), true);
  assert.equal(canWriteSpider({ ...baseUser, plan: 'pro', isDemo: true, demoPlan: 'free' }, 'oldest', 'later'), false);
});

test("transaction admission locks the keeper before reading current entitlement", async () => {
  const calls: string[] = [];
  await assertSpiderWritableInTransaction({
    $queryRaw: async () => { calls.push("lock"); return []; },
    user: { findUnique: async () => { calls.push("user"); return { ...baseUser, deletingAt: null, suspendedAt: null }; } },
    spider: {
      findFirst: async ({ where }: { where: { id?: string } }) => {
        calls.push(where.id ? "owner" : "first");
        return { id: "active" };
      },
    },
  } as never, "keeper", "active");
  assert.deepEqual(calls, ["lock", "user", "owner", "first"]);
});

test("transaction admission rejects a later spood after Pro becomes past due", async () => {
  await assert.rejects(() => assertSpiderWritableInTransaction({
    $queryRaw: async () => [],
    user: { findUnique: async () => ({ ...baseUser, plan: "pro", stripeCustomerId: "cus", subscriptionStatus: "past_due", billingLastCheckedAt: new Date(), deletingAt: null, suspendedAt: null }) },
    spider: { findFirst: async ({ where }: { where: { id?: string } }) => where.id ? { id: "later" } : { id: "first" } },
  } as never, "keeper", "later"), /read-only/);
});
