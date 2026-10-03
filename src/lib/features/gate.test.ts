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
  resolveUserGates,
  registerGateTelemetryTransport,
} from "./gate";
import { redirect as nextRedirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { MaintenanceError, maintenanceFailure } from "../admin/maintenance-policy";
import { TestContextError } from "../admin/test-session";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

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
      findMany: async () => [{ key: "feat.one", active: true }],
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
      findMany: async () => [{ key: "feat.one", active: true }],
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
      findMany: async () => [],
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
      findMany: async () => {
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
      findMany: async () => [{ key: "feat.unreleased", active: false }],
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
      findMany: async () => [{ key: "feat.one", active: true }],
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
      findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in.map((key) => ({ key, active: true })),
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
      findMany: async () => [{ key: "feat.one", active: true }],
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
      sessionUser: { id: "user-1" },
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
  await flush();
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
      findMany: async () => [{ key: "feat.one", active: true }],
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
  assert.equal(redirectedTo, "/features/feat.one");
  await flush();
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
      findMany: async () => [{ key: "feat.inactive", active: false }],
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
  assert.equal(redirectedTo, "/features/feat.inactive?state=coming-soon");
  await flush();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    feature: "feat.inactive",
    outcome: "coming-soon",
    plan: null,
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
  await flush();
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
  await flush();
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
      findMany: async () => [{ key: "feat.one", active: true }],
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
      sessionUser: async () => ({ id: "user-func" }),
      redirectFn: () => {},
      sinkTransport: async (_sink, event) => {
        events.push(event);
      },
    },
  );

  assert.equal(result, "func-user-success");
  await flush();
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
        findMany: async () => [{ key: "feat.one", active: true }],
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
        sessionUser: { id: "user-1" },
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
      findMany: async () => {
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
  await flush();
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
      findMany: async () => [{ key: "feat.one", active: false }],
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
      findMany: async () => [{ key: "feat.one", active: true }],
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

// ---------------------------------------------------------------- final-review fixes


function captureErrors() {
  const original = console.error;
  const errors: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  return { errors, restore: () => (console.error = original) };
}

function subscriber(keys: string[], planName = "Keeper") {
  return {
    plan: "free",
    subscriptions: [
      {
        status: "ACTIVE",
        expiresAt: null,
        plan: { name: planName, featureTranslations: keys.map((key) => ({ enabled: true, feature: { key } })) },
      },
    ],
  };
}

function countingGateDb(options: {
  active?: Record<string, boolean>;
  user?: unknown;
  legacyPlans?: () => Promise<unknown[]>;
  sink?: string;
}) {
  const counts = { feature: 0, user: 0, plan: 0, siteSettings: 0 };
  const db = {
    feature: {
      findMany: async ({ where }: { where: { key: { in: string[] } } }) => {
        counts.feature++;
        return where.key.in
          .filter((key) => options.active && key in options.active)
          .map((key) => ({ key, active: options.active![key] }));
      },
      findUnique: async () => assert.fail("per-key lookups are gone"),
    },
    user: {
      findUnique: async () => {
        counts.user++;
        return options.user ?? null;
      },
    },
    plan: {
      findMany: async () => {
        counts.plan++;
        return options.legacyPlans ? options.legacyPlans() : [];
      },
    },
    siteSettings: {
      findUnique: async () => {
        counts.siteSettings++;
        return { featureTelemetrySink: options.sink ?? "off" };
      },
    },
  } as unknown as FeatureGateDb;
  return { db, counts };
}

it("I1: a resolver failure is logged with the feature key and still fails closed", async () => {
  const log = captureErrors();
  try {
    const db = { feature: { findMany: async () => { throw new Error("DB down"); } }, user: { findUnique: async () => null } } as unknown as FeatureGateDb;
    assert.equal(await resolveUserFeatureGate(db, "user-1", "feat.one"), "coming-soon");
    assert.equal(log.errors.length, 1);
    assert.equal(log.errors[0][0], "feature-gate");
    assert.equal(log.errors[0][1], "feat.one");
  } finally {
    log.restore();
  }
});

it("I1: a batch failure in resolveUserGates is logged as 'batch' and every key reads coming-soon", async () => {
  const log = captureErrors();
  try {
    const { db } = countingGateDb({ active: { "k.a": true } });
    (db as unknown as { user: { findUnique: () => Promise<never> } }).user.findUnique = async () => {
      throw new Error("user read down");
    };
    assert.deepEqual(await resolveUserGates(db, "user-1", ["k.a", "k.b"]), { "k.a": "coming-soon", "k.b": "coming-soon" });
    assert.deepEqual(log.errors.map((entry) => entry.slice(0, 2)), [["feature-gate", "batch"]]);
  } finally {
    log.restore();
  }
});

it("I1: a subscriber resolves without reading legacy plans, even when they are missing", async () => {
  const { db, counts } = countingGateDb({
    active: { "k.a": true },
    user: subscriber(["k.a"]),
    legacyPlans: async () => assert.fail("legacy plans must not be read for a subscriber"),
  });
  assert.equal(await resolveUserFeatureGate(db, "user-1", "k.a"), "entitled");
  assert.equal(counts.plan, 0);
});

it("I1: a tier user with missing legacy plans fails closed and the failure is logged", async () => {
  const log = captureErrors();
  try {
    const { db, counts } = countingGateDb({ active: { "k.a": true }, user: { plan: "pro", subscriptions: [] } });
    assert.equal(await resolveUserFeatureGate(db, "user-1", "k.a"), "coming-soon");
    assert.equal(counts.plan, 1);
    assert.equal(log.errors[0]?.[0], "feature-gate");
  } finally {
    log.restore();
  }
});

it("I3: active maintenance during the session read skips the gate so the mutation boundary returns its typed failure", async () => {
  let redirected: string | null = null;
  const result = await withFeatureGate(
    "feat.one",
    async () => {
      // what withMutation does when its maintenance guard trips
      try {
        throw new MaintenanceError();
      } catch (error) {
        if (error instanceof MaintenanceError) return maintenanceFailure();
        throw error;
      }
    },
    {
      db: countingGateDb({}).db,
      sessionUser: async () => {
        throw new MaintenanceError();
      },
      redirectFn: (url) => {
        redirected = url;
      },
    },
  );
  assert.deepEqual(result, maintenanceFailure());
  assert.equal(redirected, null);
});

it("I3: a test-context error during the session read also defers to the action's boundary", async () => {
  let ran = false;
  await withFeatureGate("feat.one", async () => { ran = true; }, {
    db: countingGateDb({}).db,
    sessionUser: async () => {
      throw new TestContextError();
    },
    redirectFn: () => assert.fail("must not redirect to an upsell"),
  });
  assert.equal(ran, true);
});

it("I3: an ended test session's /testing-ended redirect propagates out of the decorator", async () => {
  let ran = false;
  await assert.rejects(
    withFeatureGate("feat.one", async () => { ran = true; }, {
      db: countingGateDb({}).db,
      sessionUser: async () => nextRedirect("/testing-ended"),
      redirectFn: () => assert.fail("must not redirect to an upsell"),
    }),
    (error: unknown) => isRedirectError(error) && String((error as { digest: string }).digest).includes("/testing-ended"),
  );
  assert.equal(ran, false);
});

it("I5: the decorator never waits on the telemetry read before running the action", async () => {
  const { db } = countingGateDb({ active: { "feat.one": true }, user: subscriber(["feat.one"]) });
  (db as unknown as { siteSettings: { findUnique: () => Promise<never> } }).siteSettings.findUnique = () => new Promise<never>(() => {});
  assert.equal(await withFeatureGate("feat.one", async () => "ran", { db, sessionUser: { id: "user-1" }, redirectFn: () => {} }), "ran");
});

it("I5: the decorator reports the plan name from the resolved entitlements", async () => {
  const events: GateEvent[] = [];
  const { db } = countingGateDb({ active: { "feat.one": true }, user: subscriber(["feat.one"], "Keeper Plus"), sink: "posthog" });
  await withFeatureGate("feat.one", async () => "ran", {
    db,
    sessionUser: { id: "user-1" },
    redirectFn: () => {},
    sinkTransport: (_sink, event) => {
      events.push(event);
    },
  });
  await flush();
  assert.deepEqual(events, [{ feature: "feat.one", outcome: "used", plan: "Keeper Plus" }]);
});

it("I5: a page resolution emits shown/upsell/coming-soon per key from a single settings read", async () => {
  const events: GateEvent[] = [];
  const { db, counts } = countingGateDb({
    active: { "k.yes": true, "k.no": true, "k.later": false },
    user: subscriber(["k.yes"], "Keeper"),
    sink: "posthog",
  });
  registerGateTelemetryTransport((_sink, event) => {
    events.push(event);
  });
  try {
    await resolveUserGates(db, "user-1", ["k.yes", "k.no", "k.later"]);
    await flush();
  } finally {
    registerGateTelemetryTransport(undefined);
  }
  assert.equal(counts.siteSettings, 1);
  assert.deepEqual(events, [
    { feature: "k.yes", outcome: "shown", plan: "Keeper" },
    { feature: "k.no", outcome: "upsell", plan: "Keeper" },
    { feature: "k.later", outcome: "coming-soon", plan: "Keeper" },
  ]);
});

it("I5: page resolutions inside a decorated action are not reported as impressions", async () => {
  const events: GateEvent[] = [];
  const { db, counts } = countingGateDb({ active: { "feat.one": true }, user: subscriber(["feat.one"]), sink: "posthog" });
  await withFeatureGate("feat.one", async () => resolveUserGates(db, "user-1", ["feat.one"]), {
    db,
    sessionUser: { id: "user-1" },
    redirectFn: () => {},
    sinkTransport: (_sink, event) => {
      events.push(event);
    },
  });
  await flush();
  assert.equal(counts.siteSettings, 1);
  assert.deepEqual(events.map((event) => event.outcome), ["used"]);
});

it("M-signed-out-inactive: signed-out visitors see coming-soon for unreleased keys and upsell for released ones", async () => {
  const { db, counts } = countingGateDb({ active: { "k.on": true, "k.off": false } });
  assert.deepEqual(await resolveUserGates(db, null, ["k.on", "k.off", "k.unknown"]), {
    "k.on": "upsell",
    "k.off": "coming-soon",
    "k.unknown": "coming-soon",
  });
  assert.equal(counts.user, 0);
});

it("I6: resolutions nested inside a decorated action reuse the decorator's read (zero extra queries)", async () => {
  const { db, counts } = countingGateDb({
    active: { "care.feed.log": true, "settings.profile.manage": true, "journey.check_in": true, "journey.badges.view": false },
    user: subscriber(["care.feed.log", "settings.profile.manage"]),
  });
  const nested = await withFeatureGate(
    "care.feed.log",
    async () => {
      const before = { ...counts };
      const single = await resolveUserFeatureGate(db, "user-1", "settings.profile.manage");
      const batch = await resolveUserGates(db, "user-1", ["journey.check_in", "journey.badges.view"]);
      return { single, batch, before };
    },
    { db, sessionUser: { id: "user-1" }, redirectFn: () => {} },
  );
  assert.equal(nested.single, "entitled");
  assert.deepEqual(nested.batch, { "journey.check_in": "upsell", "journey.badges.view": "coming-soon" });
  assert.equal(counts.feature, nested.before.feature);
  assert.equal(counts.user, nested.before.user);
  assert.deepEqual({ feature: counts.feature, user: counts.user, plan: counts.plan }, { feature: 1, user: 1, plan: 0 });
});

it("I6: a nested resolution for another user does not reuse the decorator's snapshot", async () => {
  const { db, counts } = countingGateDb({ active: { "feat.one": true }, user: subscriber(["feat.one"]) });
  await withFeatureGate("feat.one", async () => resolveUserFeatureGate(db, "user-2", "feat.one"), {
    db,
    sessionUser: { id: "user-1" },
    redirectFn: () => {},
  });
  assert.equal(counts.user, 2);
});
