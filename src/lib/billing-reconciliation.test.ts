import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { reconcileDueBilling } from "./billing-reconciliation";

const now = new Date("2026-09-17T12:00:00.000Z");

type Row = {
  isDemo?: boolean;
  id: string;
  stripeCustomerId: string | null;
  billingLastCheckedAt: Date | null;
  billingNextCheckAt: Date | null;
  billingCheckFailures: number;
};

function fixture(rows: Row[]) {
  const calls: string[] = [];
  const errors: Record<string, unknown>[] = [];
  const database = {
    user: {
      findMany: async ({ where, orderBy, take }: { where: { isDemo?: boolean; stripeCustomerId: { not: null }; billingNextCheckAt: { lte: Date } }; orderBy: unknown; take: number }) => {
        assert.deepEqual(where.stripeCustomerId, { not: null });
        assert.deepEqual(orderBy, [{ billingNextCheckAt: "asc" }, { id: "asc" }]);
        assert.equal(take, 20);
        return rows.filter((row) => (where.isDemo === undefined || Boolean(row.isDemo) === where.isDemo) && row.stripeCustomerId && row.billingNextCheckAt && row.billingNextCheckAt <= where.billingNextCheckAt.lte)
          .sort((a, b) => a.billingNextCheckAt!.getTime() - b.billingNextCheckAt!.getTime() || a.id.localeCompare(b.id))
          .slice(0, take).map((item) => ({ ...item }));
      },
      updateMany: async ({ where, data }: { where: { id: string; billingLastCheckedAt: Date | null; billingNextCheckAt: Date | null; billingCheckFailures: number }; data: { billingNextCheckAt: Date; billingCheckFailures: { increment: number } } }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row || row.billingLastCheckedAt?.getTime() !== where.billingLastCheckedAt?.getTime() ||
          row.billingNextCheckAt?.getTime() !== where.billingNextCheckAt?.getTime() || row.billingCheckFailures !== where.billingCheckFailures) return { count: 0 };
        row.billingNextCheckAt = data.billingNextCheckAt;
        row.billingCheckFailures += data.billingCheckFailures.increment;
        return { count: 1 };
      },
    },
  };
  const reconcileCustomer = async (customerId: string) => {
    calls.push(customerId);
    if (customerId === "cus_fail") throw new Error("Stripe unavailable");
    const row = rows.find((item) => item.stripeCustomerId === customerId)!;
    row.billingLastCheckedAt = now;
    row.billingNextCheckAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    row.billingCheckFailures = 0;
  };
  return { database: database as unknown as PrismaClient, calls, errors, reconcileCustomer };
}

function row(id: string, customerId: string | null, due: Date | null, failures = 0): Row {
  return { id, stripeCustomerId: customerId, billingLastCheckedAt: null, billingNextCheckAt: due, billingCheckFailures: failures };
}

test("a run processes only a bounded, ordered batch of due Stripe customers", async () => {
  const rows = [row("not_due", "cus_later", new Date("2026-09-18T00:00:00Z")), row("free", null, now),
    ...Array.from({ length: 23 }, (_, index) => row(`user_${String(index).padStart(2, "0")}`, `cus_${String(index).padStart(2, "0")}`, now))];
  const f = fixture(rows);

  const result = await reconcileDueBilling({ prisma: f.database, reconcileCustomer: f.reconcileCustomer, now, logger: { error: (entry) => f.errors.push(entry) } });

  assert.deepEqual(result, { selected: 20, succeeded: 20, failed: 0 });
  assert.deepEqual(f.calls, Array.from({ length: 20 }, (_, index) => `cus_${String(index).padStart(2, "0")}`));
  assert.equal(rows.find((item) => item.id === "user_20")?.billingLastCheckedAt, null);
});

test("one failed customer is retried on a later run without blocking later customers", async () => {
  const rows = [row("a", "cus_fail", now), row("b", "cus_ok", now)];
  const f = fixture(rows);

  const first = await reconcileDueBilling({ prisma: f.database, reconcileCustomer: f.reconcileCustomer, now, logger: { error: (entry) => f.errors.push(entry) } });

  assert.deepEqual(first, { selected: 2, succeeded: 1, failed: 1 });
  assert.deepEqual(f.calls, ["cus_fail", "cus_ok"]);
  assert.equal(rows[0].billingCheckFailures, 1);
  assert.ok(rows[0].billingNextCheckAt! > now);
  assert.ok(rows[0].billingNextCheckAt! < rows[1].billingNextCheckAt!);
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0].customerId, "cus_fail");

  const retryAt = rows[0].billingNextCheckAt!;
  await reconcileDueBilling({ prisma: f.database, reconcileCustomer: f.reconcileCustomer, now: retryAt, logger: { error: () => {} } });
  assert.deepEqual(f.calls, ["cus_fail", "cus_ok", "cus_fail"]);
});

test("a failed cron check cannot overwrite freshness from a concurrent successful webhook", async () => {
  const rows = [row("a", "cus_fail", now)];
  const f = fixture(rows);
  const successfulCheck = new Date(now.getTime() + 1000);
  const reconcileCustomer = async () => {
    rows[0].billingLastCheckedAt = successfulCheck;
    rows[0].billingNextCheckAt = new Date(successfulCheck.getTime() + 6 * 60 * 60 * 1000);
    throw new Error("older cron attempt failed");
  };

  const result = await reconcileDueBilling({ prisma: f.database, reconcileCustomer, now, logger: { error: () => {} } });

  assert.equal(result.failed, 1);
  assert.equal(rows[0].billingLastCheckedAt, successfulCheck);
  assert.equal(rows[0].billingCheckFailures, 0);
});

test('normal demo customers do not enter periodic reconciliation even with an old due timestamp', async () => {
 const demo = { ...row('demo', 'cus_demo', now), isDemo: true };
 const f = fixture([demo]);
 const result = await reconcileDueBilling({ prisma: f.database, reconcileCustomer: f.reconcileCustomer, now, logger: { error: entry => f.errors.push(entry) } });
 assert.equal(result.selected, 0); assert.deepEqual(f.calls, []); assert.equal(demo.billingLastCheckedAt, null);
});
