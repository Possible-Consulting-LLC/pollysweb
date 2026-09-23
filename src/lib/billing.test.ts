import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { legacyProPriceIds } from "./billing";

const configured = {
  SPOODLY_ENV: "production",
  STRIPE_SECRET_KEY: "sk_test_fixture",
  STRIPE_PRICE_MONTHLY: "price_monthly",
  STRIPE_PRICE_YEARLY: "price_yearly",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture",
};

test("checkout is unavailable without a webhook signing secret", () => {
  assert.equal(configuredCheckout({ STRIPE_WEBHOOK_SECRET: "" }), false);
});

test("checkout is available when all required billing settings exist", () => {
  assert.equal(configuredCheckout(), true);
});

test("checkout is unavailable when a legacy Pro Price ID is malformed", () => {
  assert.equal(configuredCheckout({ STRIPE_PRO_LEGACY_PRICE_IDS: "price_old,prod_wrong" }), false);
});

test("checkout is unavailable when a current Pro Price ID is malformed", () => {
  assert.equal(configuredCheckout({ STRIPE_PRICE_YEARLY: "prod_wrong" }), false);
});

test("legacy Pro Price IDs are parsed from a comma-separated setting", () => {
  assert.deepEqual(legacyProPriceIds(" price_old_monthly,price_old_yearly, "), ["price_old_monthly", "price_old_yearly"]);
});

function configuredCheckout(overrides: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "console.log(require('./src/lib/billing.ts').isStripeConfigured())"], {
    cwd: process.cwd(),
    env: { ...configured, ...overrides, NODE_ENV: "production", PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() === "true";
}
