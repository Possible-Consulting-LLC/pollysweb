import assert from "node:assert/strict";
import { it } from "node:test";
import {
  resolveFeatureGate,
  resolveUserFeatureGate,
  emitGateEvent,
  resolveTelemetrySinkFromRow,
  type FeatureGateDb,
  type GateEvent,
  withFeatureGate,
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

it("withFeatureGate: entitled user executes work, returns handler result, and emits used", async () => {
  const events: GateEvent[] = [];
  let redirectCalled = false;
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
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "posthog" }),
    },
  } as unknown as FeatureGateDb;

  const result = await withFeatureGate(
    "feat.one",
    async () => "handler-result",
    {
      db,
      sessionUser: { id: "user-1", plan: "Pro" },
      redirectFn: () => {
        redirectCalled = true;
      },
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(result, "handler-result");
  assert.equal(redirectCalled, false);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.one",
    outcome: "used",
    plan: "Pro",
  });
});

it("withFeatureGate: upsell redirects to /features/<key>, emits upsell, and does NOT call work", async () => {
  const events: GateEvent[] = [];
  let redirectedTo: string | null = null;
  let workCalled = false;
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
                { enabled: true, feature: { key: "other.feat" } },
              ],
            },
          },
        ],
      }),
    },
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "posthog" }),
    },
  } as unknown as FeatureGateDb;

  await withFeatureGate(
    "feat.one",
    async () => {
      workCalled = true;
      return "should-not-run";
    },
    {
      db,
      sessionUser: { id: "user-1", plan: "Free" },
      redirectFn: (url: string) => {
        redirectedTo = url;
      },
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(workCalled, false);
  assert.equal(redirectedTo, "/features/feat.one");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.one",
    outcome: "upsell",
    plan: "Free",
  });
});

it("withFeatureGate: coming-soon redirects to /features/<key>?state=coming-soon, emits coming-soon, and does NOT call work", async () => {
  const events: GateEvent[] = [];
  let redirectedTo: string | null = null;
  let workCalled = false;
  const db = {
    feature: {
      findUnique: async () => ({ key: "feat.inactive", active: false }),
    },
    user: {
      findUnique: async () => ({
        plan: "pro",
        subscriptions: [],
      }),
    },
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "posthog" }),
    },
  } as unknown as FeatureGateDb;

  await withFeatureGate(
    "feat.inactive",
    async () => {
      workCalled = true;
      return "should-not-run";
    },
    {
      db,
      sessionUser: { id: "user-1", plan: "Pro" },
      redirectFn: (url: string) => {
        redirectedTo = url;
      },
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(workCalled, false);
  assert.equal(redirectedTo, "/features/feat.inactive?state=coming-soon");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.inactive",
    outcome: "coming-soon",
    plan: "Pro",
  });
});

it("withFeatureGate: unauthenticated session (sessionUser null) redirects to /features/<key>, emits upsell, and does NOT call work", async () => {
  const events: GateEvent[] = [];
  let redirectedTo: string | null = null;
  let workCalled = false;
  const db = {
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "posthog" }),
    },
  } as unknown as FeatureGateDb;

  await withFeatureGate(
    "feat.one",
    async () => {
      workCalled = true;
      return "should-not-run";
    },
    {
      db,
      sessionUser: null,
      redirectFn: (url: string) => {
        redirectedTo = url;
      },
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(workCalled, false);
  assert.equal(redirectedTo, "/features/feat.one");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.one",
    outcome: "upsell",
    plan: null,
  });
});

it("withFeatureGate: unauthenticated session with null id ({ id: null }) redirects to /features/<key>, emits upsell, and does NOT call work", async () => {
  const events: GateEvent[] = [];
  let redirectedTo: string | null = null;
  let workCalled = false;
  const db = {
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "posthog" }),
    },
  } as unknown as FeatureGateDb;

  await withFeatureGate(
    "feat.one",
    async () => {
      workCalled = true;
      return "should-not-run";
    },
    {
      db,
      sessionUser: { id: null },
      redirectFn: (url: string) => {
        redirectedTo = url;
      },
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(workCalled, false);
  assert.equal(redirectedTo, "/features/feat.one");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.one",
    outcome: "upsell",
    plan: null,
  });
});

it("withFeatureGate: sessionUser as async function is resolved correctly", async () => {
  const events: GateEvent[] = [];
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
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "posthog" }),
    },
  } as unknown as FeatureGateDb;

  const result = await withFeatureGate(
    "feat.one",
    async () => "func-user-success",
    {
      db,
      sessionUser: async () => ({ id: "user-func", plan: "Pro" }),
      redirectFn: () => {},
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(result, "func-user-success");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.one",
    outcome: "used",
    plan: "Pro",
  });
});

it("withFeatureGate: sink failure does not throw and allows entitled work to proceed", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
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
      siteSettings: {
        findUnique: async () => ({ featureTelemetrySink: "posthog" }),
      },
    } as unknown as FeatureGateDb;

    const result = await withFeatureGate(
      "feat.one",
      async () => "success-despite-sink-fail",
      {
        db,
        sessionUser: { id: "user-1", plan: "Pro" },
        redirectFn: () => {},
        sinkTransport: async () => {
          throw new Error("Sink network error");
        },
      },
    );

    assert.equal(result, "success-despite-sink-fail");
  } finally {
    console.error = originalError;
  }
});

it("withFeatureGate: db failure in resolver safely falls back to coming-soon redirect and does not call work", async () => {
  const events: GateEvent[] = [];
  let redirectedTo: string | null = null;
  let workCalled = false;
  const db = {
    feature: {
      findUnique: async () => {
        throw new Error("DB down");
      },
    },
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "posthog" }),
    },
  } as unknown as FeatureGateDb;

  await withFeatureGate(
    "feat.one",
    async () => {
      workCalled = true;
      return "should-not-run";
    },
    {
      db,
      sessionUser: { id: "user-1" },
      redirectFn: (url: string) => {
        redirectedTo = url;
      },
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(workCalled, false);
  assert.equal(redirectedTo, "/features/feat.one?state=coming-soon");
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.one",
    outcome: "coming-soon",
    plan: null,
  });
});

it("withFeatureGate: redirectFn error (e.g. Next.js NEXT_REDIRECT) propagates out of decorator", async () => {
  const db = {
    feature: {
      findUnique: async () => ({ key: "feat.one", active: false }),
    },
    user: {
      findUnique: async () => ({ plan: "free", subscriptions: [] }),
    },
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "off" }),
    },
  } as unknown as FeatureGateDb;

  class NextRedirectError extends Error {
    digest = "NEXT_REDIRECT";
  }

  await assert.rejects(
    async () => {
      await withFeatureGate(
        "feat.one",
        async () => "result",
        {
          db,
          sessionUser: { id: "user-1" },
          redirectFn: () => {
            throw new NextRedirectError("NEXT_REDIRECT");
          },
        },
      );
    },
    (err: unknown) => {
      return err instanceof NextRedirectError;
    },
  );
});

it("withFeatureGate: work rejection propagates out of decorator", async () => {
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
    siteSettings: {
      findUnique: async () => ({ featureTelemetrySink: "off" }),
    },
  } as unknown as FeatureGateDb;

  await assert.rejects(
    async () => {
      await withFeatureGate(
        "feat.one",
        async () => {
          throw new Error("Mutation failed");
        },
        {
          db,
          sessionUser: { id: "user-1" },
          redirectFn: () => {},
        },
      );
    },
    { message: "Mutation failed" },
  );
});
