import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { assertStagingEnvironment, isStaging } from "./staging-guard";

const valid = {
  SPOODLY_ENV: "staging",
  DATABASE_URL: "postgresql://postgres.nfdecdylxcmuypxodppe:fake-password@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true",
  DIRECT_URL: "postgresql://postgres:fake-password@db.nfdecdylxcmuypxodppe.supabase.co:5432/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://nfdecdylxcmuypxodppe.supabase.co",
};

test("staging identity activates even if the environment marker is missing or incorrect", () => {
  assert.equal(isStaging({ SPOODLY_ENV: "staging" }), true);
  assert.equal(isStaging({ SPOODLY_ENV: "production", VERCEL_PROJECT_ID: "prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO" }), true);
  assert.equal(isStaging({}), false);
});
test("accepts isolated direct and pooler connections without a storage key", () => {
  assert.doesNotThrow(() => assertStagingEnvironment(valid));
});

test("dedicated staging verification email key requires a recipient allowlist and sender", () => {
  assert.throws(() => assertStagingEnvironment({ ...valid, EMAIL_RESEND_API_KEY: "test-key" }), /staging/i);
  assert.throws(() => assertStagingEnvironment({ ...valid, EMAIL_RESEND_API_KEY: "test-key", EMAIL_ALLOWED_RECIPIENTS: "keeper@example.com" }), /staging/i);
  assert.doesNotThrow(() => assertStagingEnvironment({ ...valid, EMAIL_RESEND_API_KEY: "test-key", EMAIL_ALLOWED_RECIPIENTS: "keeper@example.com", EMAIL_FROM_EMAIL: "Spoodly <verify@example.com>", AUTH_URL: "https://staging.example.com" }));
});

test("staging feedback recipient must be explicitly allowed", () => {
  const env = { ...valid, EMAIL_RESEND_API_KEY: "test-key", EMAIL_ALLOWED_RECIPIENTS: "support@example.com", EMAIL_FROM_EMAIL: "hello@example.com", AUTH_URL: "https://staging.example" };
  assert.doesNotThrow(() => assertStagingEnvironment({ ...env, FEEDBACK_TO_EMAIL: "support@example.com" }));
  assert.throws(() => assertStagingEnvironment({ ...env, FEEDBACK_TO_EMAIL: "outsider@example.com" }), /FEEDBACK_TO_EMAIL/);
});

test("staging build rejects an unsafe email verification origin", () => {
  const env = { ...valid, EMAIL_RESEND_API_KEY: "test-key", EMAIL_ALLOWED_RECIPIENTS: "keeper@example.com", EMAIL_FROM_EMAIL: "hello@example.com", AUTH_URL: "https://long-project.vercel.app" };
  assert.doesNotThrow(() => assertStagingEnvironment({ ...env, EMAIL_VERIFICATION_ORIGIN: "https://staging.example" }));
  for (const origin of ["http://staging.example", "https://staging.example/path", "https://user:pass@staging.example"]) {
    assert.throws(() => assertStagingEnvironment({ ...env, EMAIL_VERIFICATION_ORIGIN: origin }), /EMAIL_VERIFICATION_ORIGIN/);
  }
});

for (const field of ["DATABASE_URL", "DIRECT_URL"] as const) {
  for (const url of [
    "", "not a URL",
    "postgresql://postgres:fake-password@db.jfutawxwjqekerugbqzt.supabase.co:5432/postgres",
    "postgresql://postgres:fake-password@db.other.supabase.co:5432/postgres",
    "postgresql://postgres.jfutawxwjqekerugbqzt:fake-password@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
    "postgresql://postgres:fake-password@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
    "postgresql://postgres:fake-password@db.nfdecdylxcmuypxodppe.supabase.co.evil.test:5432/postgres",
    "https://postgres:fake-password@db.nfdecdylxcmuypxodppe.supabase.co/postgres",
    valid.DIRECT_URL + "?host=db.jfutawxwjqekerugbqzt.supabase.co",
    valid.DIRECT_URL.replace("postgres:fake", "other:fake"),
  ]) {
    test(`rejects unsafe ${field} fixture ${url.replace(/fake-password/g, "redacted")}`, () => {
      assert.throws(() => assertStagingEnvironment({ ...valid, [field]: url }), (error: Error) => {
        assert.match(error.message, /staging/i);
        assert.ok(!error.message.includes("fake-password"));
        return true;
      });
    });
  }
}

for (const field of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  for (const url of ["https://jfutawxwjqekerugbqzt.supabase.co", "https://other.supabase.co", "https://nfdecdylxcmuypxodppe.supabase.co.evil.test", "http://nfdecdylxcmuypxodppe.supabase.co", "https://nfdecdylxcmuypxodppe.supabase.co/other"]) {
    test(`rejects mismatched Supabase endpoint in ${field}: ${url}`, () => {
      assert.throws(() => assertStagingEnvironment({ ...valid, [field]: url }), /staging/i);
    });
  }
}

test("requires an explicit staging Supabase endpoint", () => {
  assert.throws(() => assertStagingEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "" }), /staging/i);
});

for (const field of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "RESEND_API_KEY"]) {
  test(`rejects configured ${field} instead of enabling external integrations`, () => {
    assert.throws(() => assertStagingEnvironment({ ...valid, [field]: "fake-secret" }), (error: Error) => {
      assert.ok(!error.message.includes("fake-secret"));
      return /staging/i.test(error.message);
    });
  });
}

test("rejects storage JWTs belonging to another project and malformed credentials", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9." + Buffer.from(JSON.stringify({ ref: "jfutawxwjqekerugbqzt", role: "service_role" })).toString("base64url") + ".fake";
  for (const key of [jwt, "eyJmalformed", "not-a-supabase-key"]) {
    assert.throws(() => assertStagingEnvironment({ ...valid, SUPABASE_SERVICE_ROLE_KEY: key }), /staging/i);
  }
});

test("does not impose staging configuration on other environments", () => {
  assert.doesNotThrow(() => assertStagingEnvironment({ DATABASE_URL: "unrelated" }));
});

function runIsolated(code: string, overrides: Record<string, string> = {}, serverOnly = false) {
  return spawnSync(process.execPath, [...(serverOnly ? ["--conditions=react-server"] : []), "--import", "tsx", "-e", code], {
    cwd: process.cwd(),
    env: { ...valid, ...overrides, NODE_ENV: "production", PATH: process.env.PATH },
    encoding: "utf8",
  });
}

test("Next config rejects an unsafe deployment before building", () => {
  const result = runIsolated("require('./next.config.ts')", { DATABASE_URL: "invalid" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsafe staging configuration/);
});

test("staging sends a noindex header for all routes", () => {
  const result = runIsolated("require('./next.config.ts').default.headers().then(h => console.log(JSON.stringify(h)))");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).some((rule: { source: string; headers: { key: string; value: string }[] }) =>
    rule.source === "/:path*" && rule.headers.some((header) => header.key === "X-Robots-Tag" && header.value.includes("noindex"))));
});

test("all routes disallow framing and MIME sniffing", () => {
  const result = runIsolated("require('./next.config.ts').default.headers().then(h => console.log(JSON.stringify(h)))");
  assert.equal(result.status, 0, result.stderr);
  const headers = JSON.parse(result.stdout)
    .filter((rule: { source: string }) => rule.source === "/:path*")
    .flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers);
  assert.ok(headers.some((header: { key: string; value: string }) => header.key === "X-Frame-Options" && header.value === "DENY"));
  assert.ok(headers.some((header: { key: string; value: string }) => header.key === "X-Content-Type-Options" && header.value === "nosniff"));
});

test("Prisma rejects an unsafe staging target even when a cached client exists", () => {
  // Suppress construction entirely: this test must never load Prisma env files or connect.
  const result = runIsolated("globalThis.prisma = {}; require('./src/lib/db.ts')", { DATABASE_URL: "invalid" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsafe staging configuration/);
});

test("Supabase rejects unsafe staging config before constructing its client", () => {
  const result = runIsolated("require('./src/lib/supabase.ts').getSupabaseAdmin()", { SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture", SUPABASE_URL: "https://jfutawxwjqekerugbqzt.supabase.co" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsafe staging configuration/);
});

test("billing remains unavailable in staging even when keys are present", () => {
  const result = runIsolated("console.log(require('./src/lib/billing.ts').isStripeConfigured())", {
    STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_YEARLY: "price_year",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "false");
});

test("the Stripe client is disabled even with no keys", () => {
  const result = runIsolated("globalThis.prisma = {}; require('./src/lib/stripe.ts').getStripe()", {}, true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Stripe is disabled in staging/);
});
