import assert from "node:assert/strict";
import { it } from "node:test";
import {
  resolveFeatureGate,
  resolveUserFeatureGate,
  emitGateEvent,
  resolveTelemetrySinkFromRow,
  type FeatureGateDb,
} from "./gate";

it("released + entitled → entitled", () =>
  assert.equal(resolveFeatureGate({ active: true, entitled: true }), "entitled"));
it("released + not entitled → upsell", () =>
  assert.equal(resolveFeatureGate({ active: true, entitled: false }), "upsell"));
it("unreleased → coming-soon regardless of entitlement", () => {
  assert.equal(resolveFeatureGate({ active: false, entitled: true }), "coming-soon");
  assert.equal(resolveFeatureGate({ active: false, entitled: false }), "coming-soon");
});

it("resolveUserFeatureGate: released feature + entitled user → entitled", async () => {
  const db = {
    feature: {
      findUnique: async () => ({ key: "feat.one", active: true }),
    },
    user: {
      findUnique: async () => ({
        plan: "free",
        subscriptions: [
          {
            status: "ACTIVE",
            expiresAt: null,
            plan: {
              name: "Pro",
              featureTranslations: [
                { enabled: true, feature: { key: "feat.one" } },
              ],
            },
          },
        ],
      }),
    },
  } as unknown as FeatureGateDb;
  const state = await resolveUserFeatureGate(db, "user-1", "feat.one");
  assert.equal(state, "entitled");
});

it("resolveUserFeatureGate: released feature + plan translations excluding the key → upsell", async () => {
  const db = {
    feature: {
      findUnique: async () => ({ key: "feat.one", active: true }),
    },
    user: {
      findUnique: async () => ({
        plan: "free",
        subscriptions: [
          {
            status: "ACTIVE",
            expiresAt: null,
            plan: {
              name: "Free",
              featureTranslations: [
                { enabled: true, feature: { key: "other.feature" } },
              ],
            },
          },
        ],
      }),
    },
  } as unknown as FeatureGateDb;
  const state = await resolveUserFeatureGate(db, "user-1", "feat.one");
  assert.equal(state, "upsell");
});

it("resolveUserFeatureGate: unknown featureKey → coming-soon (no throw)", async () => {
  const db = {
    feature: {
      findUnique: async () => null,
    },
    user: {
      findUnique: async () => ({
        plan: "free",
        subscriptions: [],
      }),
    },
  } as unknown as FeatureGateDb;
  const state = await resolveUserFeatureGate(db, "user-1", "nonexistent.key");
  assert.equal(state, "coming-soon");
});

it("resolveUserFeatureGate: db that throws → coming-soon (no throw)", async () => {
  const db = {
    feature: {
      findUnique: async () => {
        throw new Error("DB connection failure");
      },
    },
  } as unknown as FeatureGateDb;
  const state = await resolveUserFeatureGate(db, "user-1", "feat.one");
  assert.equal(state, "coming-soon");
});

it("resolveTelemetrySinkFromRow: posthog → posthog; off, null, undefined, garbage → off", () => {
  assert.equal(resolveTelemetrySinkFromRow("posthog"), "posthog");
  assert.equal(resolveTelemetrySinkFromRow("off"), "off");
  assert.equal(resolveTelemetrySinkFromRow(null), "off");
  assert.equal(resolveTelemetrySinkFromRow(undefined), "off");
  assert.equal(resolveTelemetrySinkFromRow("garbage"), "off");
});

it("emitGateEvent with sink off → returns without calling anything", async () => {
  let called = false;
  const db = {
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "off" }),
    },
  } as unknown as FeatureGateDb;
  await emitGateEvent(
    db,
    { feature: "feat.one", outcome: "used", plan: "Pro" },
    async () => {
      called = true;
    },
  );
  assert.equal(called, false);
});

it("emitGateEvent with sink row missing → returns without calling anything", async () => {
  let called = false;
  const db = {
    siteSettings: {
      findUnique: async () => null,
    },
  } as unknown as FeatureGateDb;
  await emitGateEvent(
    db,
    { feature: "feat.one", outcome: "used", plan: "Pro" },
    async () => {
      called = true;
    },
  );
  assert.equal(called, false);
});

it("emitGateEvent with a throwing sink transport → swallows (no throw)", async () => {
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const db = {
      siteSettings: {
        findUnique: async () => ({ featureTelemetrySink: "posthog" }),
      },
    } as unknown as FeatureGateDb;
    await emitGateEvent(
      db,
      { feature: "feat.one", outcome: "used", plan: "Pro" },
      async () => {
        throw new Error("Transport failed");
      },
    );
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.[0], "gate-telemetry");
  } finally {
    console.error = originalError;
  }
});

it("resolveUserFeatureGate: unreleased feature with entitled user → coming-soon", async () => {
  const db = {
    feature: {
      findUnique: async () => ({ key: "feat.unreleased", active: false }),
    },
    user: {
      findUnique: async () => ({
        plan: "free",
        subscriptions: [
          {
            status: "ACTIVE",
            expiresAt: null,
            plan: {
              name: "Pro",
              featureTranslations: [
                { enabled: true, feature: { key: "feat.unreleased" } },
              ],
            },
          },
        ],
      }),
    },
  } as unknown as FeatureGateDb;
  const state = await resolveUserFeatureGate(db, "user-1", "feat.unreleased");
  assert.equal(state, "coming-soon");
});

it("resolveUserFeatureGate: missing user row → coming-soon", async () => {
  const db = {
    feature: {
      findUnique: async () => ({ key: "feat.one", active: true }),
    },
    user: {
      findUnique: async () => null,
    },
  } as unknown as FeatureGateDb;
  const state = await resolveUserFeatureGate(db, "user-nonexistent", "feat.one");
  assert.equal(state, "coming-soon");
});

it("resolveUserFeatureGate: legacy tier fallback resolves correctly", async () => {
  const db = {
    feature: {
      findUnique: async () => ({ key: "care.feed.log", active: true }),
    },
    user: {
      findUnique: async () => ({
        plan: "free",
        subscriptions: [],
      }),
    },
    plan: {
      findMany: async () => [
        {
          name: "Free – Legacy",
          featureTranslations: [
            { enabled: true, feature: { key: "care.feed.log" } },
          ],
        },
        {
          name: "Pro – Legacy",
          featureTranslations: [],
        },
      ],
    },
  } as unknown as FeatureGateDb;
  const state = await resolveUserFeatureGate(db, "user-1", "care.feed.log");
  assert.equal(state, "entitled");

  const unmappedState = await resolveUserFeatureGate(db, "user-1", "unmapped.key");
  assert.equal(unmappedState, "upsell");
});

it("emitGateEvent: db.siteSettings throwing swallows error and logs gate-telemetry", async () => {
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const db = {
      siteSettings: {
        findUnique: async () => {
          throw new Error("Settings DB failure");
        },
      },
    } as unknown as FeatureGateDb;
    await emitGateEvent(db, { feature: "feat.one", outcome: "used", plan: "Pro" });
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.[0], "gate-telemetry");
  } finally {
    console.error = originalError;
  }
});
