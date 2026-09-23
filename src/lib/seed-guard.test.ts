import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateDemoSeedTarget } from "./seed-guard";

describe("demo seed target guard", () => {
  it("requires an explicit opt-in", () => {
    const result = validateDemoSeedTarget({ DATABASE_URL: "postgresql://localhost/spoodly", NODE_ENV: "development" });
    assert.ok(result);
    assert.match(result, /SPOODLY_ALLOW_DEMO_SEED/);
  });

  it("allows only an explicitly opted-in local development database", () => {
    assert.equal(validateDemoSeedTarget({ DATABASE_URL: "postgresql://localhost/spoodly", NODE_ENV: "development", SPOODLY_ALLOW_DEMO_SEED: "true" }), null);
    const remote = validateDemoSeedTarget({ DATABASE_URL: "postgresql://postgres:secret@nfdecdylxcmuypxodppe.supabase.co:5432/postgres", NODE_ENV: "development", SPOODLY_ALLOW_DEMO_SEED: "true" });
    assert.ok(remote);
    assert.match(remote, /local/);
    const production = validateDemoSeedTarget({ DATABASE_URL: "postgresql://localhost/spoodly", NODE_ENV: "production", SPOODLY_ALLOW_DEMO_SEED: "true" });
    assert.ok(production);
    assert.match(production, /production/);
  });
});
