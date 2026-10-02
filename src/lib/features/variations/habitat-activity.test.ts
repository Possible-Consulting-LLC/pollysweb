import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureGate } from "../../../components/features/feature-gate";
import { LEGACY_PLAN_SPECS } from "../../admin/legacy-entitlements";
import * as utils from "../../utils";
import * as writeValidation from "../../write-validation";
import { resolveUserGates, type FeatureGateDb, type FeatureGateState } from "../gate";
import {
  PEER_CATEGORY_KEYS,
  gateStateFor,
  gateStub,
  loadModule,
  maintenancePolicy,
  makeDb,
  mutationBoundaryStub,
  newCapture,
  sessionFor,
  type Capture,
  type Scenario,
} from "./_harness";

const HABITAT_KEYS = ["enclosure.view", "enclosure.manage", "housekeeping.log"] as const;
const ACTIVITY_KEYS = ["activity.full_history.view", "activity.edit", "activity.delete"] as const;
const STATES: FeatureGateState[] = ["entitled", "upsell", "coming-soon"];

const escape = (key: string) => key.replace(/\./g, "\\.");
const el = (tag: string, props: Record<string, unknown> = {}) => jsx.jsx(tag as "div", props);
const passthrough = ({ children }: { children?: unknown }) => jsx.jsx("div", { children });
const markup = (node: unknown) => renderToStaticMarkup(node as Parameters<typeof renderToStaticMarkup>[0]);

function gatesWith(key: string, state: FeatureGateState): Record<string, FeatureGateState> {
  return Object.fromEntries([...HABITAT_KEYS, ...ACTIVITY_KEYS].map((k) => [k, k === key ? state : "entitled"]));
}

function assertGateOutcome(html: string, key: string, state: FeatureGateState) {
  if (state === "upsell") assert.match(html, new RegExp(`href="/features/${escape(key)}"`));
  else assert.doesNotMatch(html, new RegExp(`/features/${escape(key)}`));
  if (state === "coming-soon") assert.match(html, /coming soon/i);
  else assert.doesNotMatch(html, /coming soon/i);
}

test("harness peer-category defaults include every habitat and activity key", () => {
  for (const key of [...HABITAT_KEYS, ...ACTIVITY_KEYS]) assert.ok(PEER_CATEGORY_KEYS.includes(key), key);
});

// ---------------------------------------------------------------- resolveUserGates: constant query count

function countingDb(featureKeys: string[]) {
  const counts = { featureFindMany: 0, featureFindUnique: 0, userFindUnique: 0, planFindMany: 0, siteSettings: 0 };
  const db = {
    feature: {
      findMany: async ({ where }: { where: { key: { in: string[] } } }) => {
        counts.featureFindMany++;
        return where.key.in.filter((key) => featureKeys.includes(key)).map((key) => ({ key, active: true }));
      },
      findUnique: async () => {
        counts.featureFindUnique++;
        return null;
      },
    },
    user: {
      findUnique: async () => {
        counts.userFindUnique++;
        return {
          plan: "free",
          subscriptions: [
            {
              status: "ACTIVE",
              expiresAt: null,
              plan: {
                name: "Pro",
                featureTranslations: featureKeys.slice(0, 2).map((key) => ({ enabled: true, feature: { key } })),
              },
            },
          ],
        };
      },
    },
    plan: {
      findMany: async () => {
        counts.planFindMany++;
        return Object.values(LEGACY_PLAN_SPECS).map((spec) => ({ name: spec.name, featureTranslations: [] }));
      },
    },
    siteSettings: {
      findUnique: async () => {
        counts.siteSettings++;
        return { featureTelemetrySink: "off" };
      },
    },
  } as unknown as FeatureGateDb;
  return { db, counts };
}

test("resolveUserGates reads a constant number of rows regardless of how many keys are asked for", async () => {
  const known = Array.from({ length: 12 }, (_, i) => `k.key${i}`);
  const totals: number[] = [];
  for (const asked of [known.slice(0, 1), known]) {
    const { db, counts } = countingDb(known);
    const gates = await resolveUserGates(db, "user-1", asked);
    assert.equal(Object.keys(gates).length, asked.length);
    assert.deepEqual(counts, { featureFindMany: 1, featureFindUnique: 0, userFindUnique: 1, planFindMany: 1, siteSettings: 0 });
    totals.push(Object.values(counts).reduce((sum, n) => sum + n, 0));
  }
  assert.equal(totals[0], totals[1]);
});

test("resolveUserGates derives each key's state from the single batched read", async () => {
  const known = ["k.a", "k.b", "k.c"];
  const { db } = countingDb(known);
  // the stub entitles the first two known keys; k.c is active but not in the plan; k.zzz is unregistered
  assert.deepEqual(await resolveUserGates(db, "user-1", ["k.a", "k.b", "k.c", "k.zzz"]), {
    "k.a": "entitled",
    "k.b": "entitled",
    "k.c": "upsell",
    "k.zzz": "coming-soon",
  });
});

test("resolveUserGates does not query for duplicate keys twice and still answers each key", async () => {
  const { db, counts } = countingDb(["k.a"]);
  assert.deepEqual(await resolveUserGates(db, "user-1", ["k.a", "k.a"]), { "k.a": "entitled" });
  assert.equal(counts.featureFindMany, 1);
});

test("resolveUserGates marks every key coming-soon when the signed-in user row is missing", async () => {
  const { db } = countingDb(["k.a"]);
  (db as unknown as { user: { findUnique: () => Promise<null> } }).user.findUnique = async () => null;
  assert.deepEqual(await resolveUserGates(db, "user-1", ["k.a"]), { "k.a": "coming-soon" });
});

test("resolveUserGates falls back to per-key lookups when the batched read fails, isolating failures", async () => {
  const { db } = countingDb(["k.a"]);
  const feature = (db as unknown as { feature: Record<string, unknown> }).feature;
  feature.findMany = async () => {
    throw new Error("batch down");
  };
  feature.findUnique = async ({ where }: { where: { key: string } }) => {
    if (where.key === "k.bad") throw new Error("row down");
    return { key: where.key, active: true };
  };
  assert.deepEqual(await resolveUserGates(db, "user-1", ["k.a", "k.bad"]), {
    "k.a": "entitled",
    "k.bad": "coming-soon",
  });
});

// ---------------------------------------------------------------- habitat actions

type ActionResult = { ok: boolean; error?: string; message?: string };

function recordingTx(order: string[]) {
  return new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_t, method: string) => async () => {
              order.push(`${model}.${method}`);
              return { id: "row-1" };
            },
          },
        ),
    },
  );
}

function loadHabitatActions(scenario: Scenario, states: Record<string, FeatureGateState>) {
  const capture = newCapture();
  const { order } = capture;
  const tx = recordingTx(order);
  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/maintenance-write": {
      maintenanceTransaction: async () => {},
      writableSpiderTransaction: async (_user: string, _spider: string, work: (tx: unknown) => unknown) => {
        order.push("transaction");
        return work(tx);
      },
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/lib/care-celebrations": { baselineCelebrations: async () => [], finishCareCelebrations: async () => [] },
    "fs/promises": { unlink: async () => {} },
    path: {},
    "next/cache": { revalidatePath: () => {} },
    "@/lib/utils": {},
    "@/lib/history-mutations": {
      mutateMaintenance: async (_enclosureId: string, work: (tx: unknown) => unknown) => {
        order.push("maintenance");
        return work(tx);
      },
    },
    "@/lib/db": { prisma: { spider: { findFirst: async () => ({ id: "spider-1", enclosure: { id: "enclosure-1" } }) } } },
    "@/lib/uploads": {},
    "@/lib/spider-slots": {},
    "@/lib/spider-write-policy": { assertSpiderWritable: async () => {} },
    "@/lib/write-validation": writeValidation,
    "@/app/actions/care-shared": {
      getCareWriteUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
      ownedSpider: async () => ({ id: "spider-1", name: "Webster" }),
      revalidateSpider: () => {},
      asOptionalString: (value: FormDataEntryValue | null) => (value ? String(value) : undefined),
      resolveActivityDateTime: async () => new Date("2026-10-02T12:00:00Z"),
    },
    zod: { z },
  };
  const exports = loadModule<Record<string, (...args: unknown[]) => Promise<ActionResult>>>(
    "app/actions/care-habitat.ts",
    dependencies,
  );
  return { exports, capture };
}

function loadActivityActions(scenario: Scenario, states: Record<string, FeatureGateState>) {
  const capture = newCapture();
  const { order } = capture;
  const tx = recordingTx(order);
  const feeding = { id: "event-1", date: new Date("2026-10-01T12:00:00Z"), spider: { id: "spider-1", name: "Webster" } };
  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/maintenance-write": {
      writableSpiderTransaction: async (_user: string, _spider: string, work: (tx: unknown) => unknown) => {
        order.push("transaction");
        return work(tx);
      },
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/lib/care-celebrations": {
      baselineCelebrations: async () => [],
      finishCareCelebrations: async () => [],
      forgetWithdrawnCelebrations: async () => {},
    },
    "next/cache": { revalidatePath: () => {} },
    zod: { z },
    "@/lib/db": { prisma: { feedingEvent: { findFirst: async () => feeding } } },
    "@/lib/history-mutations": { mutateMolt: async () => {}, mutateMaintenance: async () => {} },
    "@/app/actions/care-shared": {
      getCareWriteUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
      resolveActivityDateTime: async () => new Date("2026-10-02T12:00:00Z"),
    },
    "@/lib/spider-write-policy": { assertSpiderWritable: async () => {} },
    "@/lib/write-validation": writeValidation,
    "@/lib/uploads": { cleanupDetachedPhoto: async () => "done", detachStoredPhotoRecord: async () => ({}) },
  };
  const exports = loadModule<Record<string, (...args: unknown[]) => Promise<ActionResult>>>(
    "app/actions/activity.ts",
    dependencies,
  );
  return { exports, capture };
}

const ACTIONS: Array<{
  key: string;
  fn: string;
  load: typeof loadHabitatActions;
  args: () => unknown[];
  entitledOrder: string[];
}> = [
  {
    key: "enclosure.manage",
    fn: "upsertEnclosure",
    load: loadHabitatActions,
    args: () => {
      const form = new FormData();
      form.set("name", "Terrarium");
      return ["spider-1", form];
    },
    entitledOrder: ["gate:enclosure.manage", "withMutation", "user", "transaction", "enclosure.update"],
  },
  {
    key: "housekeeping.log",
    fn: "logEnclosureMaintenance",
    load: loadHabitatActions,
    args: () => {
      const form = new FormData();
      form.set("kind", "cleaning");
      return ["spider-1", form];
    },
    entitledOrder: ["gate:housekeeping.log", "withMutation", "user", "maintenance", "enclosureMaintenanceEvent.create"],
  },
  {
    key: "activity.edit",
    fn: "updateActivityAction",
    load: loadActivityActions,
    args: () => {
      const form = new FormData();
      form.set("preyType", "crickets");
      return ["feeding", "event-1", form];
    },
    entitledOrder: ["gate:activity.edit", "withMutation", "user", "transaction", "feedingEvent.update"],
  },
  {
    key: "activity.delete",
    fn: "deleteActivityAction",
    load: loadActivityActions,
    args: () => ["feeding", "event-1", "ctx"],
    entitledOrder: ["gate:activity.delete", "withMutation", "user", "transaction", "feedingEvent.delete"],
  },
];

for (const { key, fn, load, args, entitledOrder } of ACTIONS) {
  const run = (scenario: Scenario) => {
    const { exports, capture } = load(scenario, { [key]: gateStateFor(scenario) });
    return { call: () => exports[fn](...args()), capture };
  };

  test(`${fn} (${key}): entitled user passes the gate and reaches the write`, async () => {
    const { call, capture } = run("entitled");
    const result = await call();
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(capture.redirects, []);
    assert.deepEqual(capture.order, entitledOrder);
  });

  test(`${fn} (${key}): not-entitled user is redirected to the upsell before any mutation work`, async () => {
    const { call, capture } = run("upsell");
    await assert.rejects(call(), new RegExp(`redirect:/features/${escape(key)}$`));
    assert.deepEqual(capture.redirects, [`/features/${key}`]);
    assert.deepEqual(capture.order, [`gate:${key}`]);
  });

  test(`${fn} (${key}): coming-soon feature redirects with ?state=coming-soon before any mutation work`, async () => {
    const { call, capture } = run("coming-soon");
    await assert.rejects(call(), /\?state=coming-soon$/);
    assert.deepEqual(capture.redirects, [`/features/${key}?state=coming-soon`]);
    assert.deepEqual(capture.order, [`gate:${key}`]);
  });

  test(`${fn} (${key}): unauthenticated session gets the upsell redirect before any mutation work`, async () => {
    const { call, capture } = run("unauthenticated");
    await assert.rejects(call(), /redirect:/);
    assert.deepEqual(capture.redirects, [`/features/${key}`]);
    assert.deepEqual(capture.order, [`gate:${key}`]);
  });
}

test("activity.edit and activity.delete gate independently of each other", async () => {
  const edit = loadActivityActions("entitled", { "activity.edit": "entitled", "activity.delete": "upsell" });
  const form = new FormData();
  form.set("preyType", "crickets");
  assert.equal((await edit.exports.updateActivityAction("feeding", "event-1", form)).ok, true);
  await assert.rejects(edit.exports.deleteActivityAction("feeding", "event-1", "ctx"), /redirect:\/features\/activity\.delete$/);
});

// ---------------------------------------------------------------- activity editor component

function loadRealEditor() {
  const dependencies: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children }),
    "@/components/mutation-context": { useMutationContext: () => "ctx", MutationContextInput: () => null },
    "@/app/actions/activity": { updateActivityAction: async () => ({ ok: true }), deleteActivityAction: async () => ({ ok: true }) },
    "@/components/spoods/profile-forms": {
      useActionFeedback: () => ({ pending: false, message: null, error: null, run: async () => {} }),
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/field": { Field: passthrough, Input: "input", Select: "select", Textarea: "textarea" },
    "@/components/ui/datetime-field": { DateTimeField: () => null },
    "@/lib/constants": {
      BODY_CONDITIONS: [],
      FEEDING_OUTCOMES: [],
      HYDRATION_METHODS: [],
      OBSERVATION_KINDS: [],
      observationLabel: (kind: string) => kind,
      PREY_TYPES: [],
    },
    "@/components/spoods/molt-stage-fields": { MoltStageFields: () => null },
  };
  return loadModule<{
    ActivityEditorList: React.ComponentType<Record<string, unknown>>;
    ActivityEditorRow: React.ComponentType<Record<string, unknown>>;
  }>("components/activity/activity-editor.tsx", dependencies);
}

const EDIT_ITEM = {
  id: "event-1",
  type: "feeding",
  spiderId: "spider-1",
  spiderName: "Webster",
  title: "Fed 1× crickets",
  dateLabel: "Oct 1",
  fields: { date: "2026-10-01T12:00" },
};

test("activity editor shows Edit and standalone Delete controls according to the allow flags", () => {
  const { ActivityEditorList } = loadRealEditor();
  const render = (props: Record<string, unknown>) =>
    markup(React.createElement(ActivityEditorList, { items: [EDIT_ITEM], ...props }));
  const edit = (html: string) => />Edit</.test(html);
  const del = (html: string) => />Delete</.test(html);

  const all = render({});
  assert.ok(edit(all));
  assert.ok(!del(all), "delete lives inside the open edit form when editing is allowed");

  const deleteOnly = render({ allowEdit: false, allowDelete: true });
  assert.ok(!edit(deleteOnly));
  assert.ok(del(deleteOnly));

  const neither = render({ allowEdit: false, allowDelete: false });
  assert.ok(!edit(neither));
  assert.ok(!del(neither));

  const editOnly = render({ allowEdit: true, allowDelete: false });
  assert.ok(edit(editOnly));
  assert.ok(!del(editOnly));

  const readOnly = render({ writableSpiderIds: [], allowEdit: true, allowDelete: true });
  assert.ok(!edit(readOnly));
  assert.ok(!del(readOnly));
});

// ---------------------------------------------------------------- spood profile page (habitat)

const ENCLOSURE = {
  name: "Terrarium",
  type: "Arboreal",
  dimensions: "30x30x45",
  notes: null,
  setupDate: null,
  lastCleaned: null,
  lastRehoused: null,
};
const SPIDER = {
  id: "spider-1",
  name: "Webster",
  sex: "Female",
  commonName: "Tarantula",
  species: "Grammostola",
  instar: "I3",
  status: "Normal",
  memorializedAt: null,
  profilePhoto: null,
  enclosure: ENCLOSURE,
  feedings: [],
  mistings: [],
  photos: [],
};
const VIEW = {
  spider: SPIDER,
  careStatus: "Feed soon",
  mistDue: false,
  latestBodyCondition: null,
  lastFedAt: null,
  lastSuccessfulFedAt: null,
  lastMistedAt: null,
  daysSinceMolt: null,
  timeZone: "UTC",
};

function loadProfilePage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const stub = (testid: string) => () => el("div", { "data-testid": testid });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children }),
    "next/navigation": { notFound: () => { throw new Error("notFound"); } },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/spood-card": { CARE_FEATURE_KEYS: [], GatedQuickLogButtons: () => null },
    "@/components/spoods/premolt-toggle": { PremoltToggle: stub("premolt-toggle") },
    "@/components/spoods/about-form": { AboutForm: stub("about-form") },
    "@/components/spoods/profile-forms": {
      BodyConditionForm: stub("body-condition-form"),
      EnclosureForm: stub("enclosure-form"),
      MaintenanceForm: stub("maintenance-form"),
      PhotoUploadForm: stub("photo-upload-form"),
    },
    "@/components/spoods/memorial-panel": { MemorialPanel: stub("memorial-panel") },
    "@/components/spoods/photo-gallery": { PhotoGallery: stub("photo-gallery") },
    "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": {
      Card: passthrough,
      StatusPill: ({ status }: { status: string }) => el("span", { children: status }),
      SectionHeader: ({ title }: { title: string }) => el("h2", { children: title }),
    },
    "@/components/ui/disclosure-card": { DisclosureCard: passthrough },
    "@/components/ui/field": { Field: passthrough },
    "@/lib/utils": { formatCareWhen: () => "never", parseHydrationMethods: () => [], formatShortDate: () => "today" },
    "@/lib/spiders": { getSpiderCare: async () => VIEW },
    "@/lib/care": { isPremoltLike: () => false },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: "spider-1" }) },
    "@/lib/session": { requireUser: async () => ({ id: scenario === "unauthenticated" ? null : "user-1" }) },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>("app/(app)/spoods/[id]/page.tsx", dependencies);
  return {
    capture,
    render: async () =>
      markup(await page.default({ params: Promise.resolve({ id: "spider-1" }), searchParams: Promise.resolve({}) })),
  };
}

const has = (html: string, testid: string) => html.includes(`data-testid="${testid}"`);

test("spood profile page resolves every habitat gate for the signed-in user", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"));
  await page.render();
  const calls = page.capture.allGateCalls.filter(([, key]) => HABITAT_KEYS.includes(key as (typeof HABITAT_KEYS)[number]));
  assert.deepEqual(calls.map(([user]) => user), HABITAT_KEYS.map(() => "user-1"));
  assert.deepEqual(calls.map(([, key]) => key).sort(), [...HABITAT_KEYS].sort());
});

test("spood profile page: a user without an id sees enclosure upsell and never hits the gate resolver", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.match(html, /href="\/features\/enclosure\.view"/);
  assert.ok(!has(html, "enclosure-form") && !has(html, "maintenance-form"));
});

for (const state of STATES) {
  test(`spood profile page: enclosure.view is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("enclosure.view", state)).render();
    const entitled = state === "entitled";
    assert.equal(has(html, "enclosure-form"), entitled);
    assert.equal(has(html, "maintenance-form"), entitled);
    assert.equal(html.includes("Terrarium"), false, "enclosure details are not rendered unless entitled");
    assertGateOutcome(html, "enclosure.view", state);
  });

  test(`spood profile page: enclosure.manage is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("enclosure.manage", state)).render();
    assert.equal(has(html, "enclosure-form"), state === "entitled");
    assert.ok(has(html, "maintenance-form"));
    assert.equal(html.includes("Terrarium"), state !== "entitled", "read-only details replace the form");
    assertGateOutcome(html, "enclosure.manage", state);
  });

  test(`spood profile page: housekeeping.log is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("housekeeping.log", state)).render();
    assert.equal(has(html, "maintenance-form"), state === "entitled");
    assert.ok(has(html, "enclosure-form"));
    assertGateOutcome(html, "housekeeping.log", state);
  });
}

// ---------------------------------------------------------------- activity page

function loadActivityPage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const fetched = { activity: 0 };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "@/components/layout/nav": { AppHeader: ({ title }: { title: string }) => el("h1", { children: title }) },
    "@/components/activity/activity-editor": {
      ActivityEditorList: ({ allowEdit, allowDelete }: Record<string, boolean>) =>
        el("div", { "data-testid": "activity-list", "data-edit": String(allowEdit), "data-delete": String(allowDelete) }),
    },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/ui/card": {
      EmptyState: () => el("p", { children: "empty" }),
      SectionHeader: ({ title }: { title: string }) => el("h2", { children: title }),
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/field": { Field: passthrough, Select: "select" },
    "@/lib/spiders": {
      getRecentActivity: async () => {
        fetched.activity++;
        return [{ id: "e1", type: "feeding", spiderId: "spider-1", spiderName: "Webster", title: "Fed", detail: null, date: new Date("2026-10-01T12:00:00Z"), fields: {} }];
      },
      getUserDefaults: async () => ({ timezone: "UTC" }),
    },
    "@/lib/utils": { formatDateTimeInZone: () => "Oct 1", resolveDisplayTimeZone: async () => "UTC" },
    "@/lib/db": { prisma: { spider: { findMany: async () => [{ id: "spider-1", name: "Webster", memorializedAt: null }] } } },
    "@/lib/session": { requireUser: async () => ({ id: scenario === "unauthenticated" ? null : "user-1" }) },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: "spider-1" }) },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>("app/(app)/activity/page.tsx", dependencies);
  return {
    capture,
    fetched,
    render: async () => markup(await page.default({ searchParams: Promise.resolve({}) })),
  };
}

test("activity page resolves all three activity gates in one call for the signed-in user", async () => {
  const page = loadActivityPage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(page.capture.allGateCalls.map(([user]) => user), ACTIVITY_KEYS.map(() => "user-1"));
  assert.deepEqual(page.capture.allGateCalls.map(([, key]) => key).sort(), [...ACTIVITY_KEYS].sort());
});

test("activity page: a user without an id sees the history upsell and the feed is never read", async () => {
  const page = loadActivityPage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.equal(page.fetched.activity, 0);
  assert.match(html, /href="\/features\/activity\.full_history\.view"/);
  assert.ok(!has(html, "activity-list"));
});

for (const state of STATES) {
  test(`activity page: activity.full_history.view is ${state}`, async () => {
    const page = loadActivityPage(gatesWith("activity.full_history.view", state));
    const html = await page.render();
    assert.equal(has(html, "activity-list"), state === "entitled");
    assert.equal(page.fetched.activity, state === "entitled" ? 1 : 0, "feed data is only read when entitled");
    assertGateOutcome(html, "activity.full_history.view", state);
  });

  test(`activity page: activity.edit is ${state}`, async () => {
    const html = await loadActivityPage(gatesWith("activity.edit", state)).render();
    assert.match(html, new RegExp(`data-edit="${state === "entitled"}"`));
    assert.match(html, /data-delete="true"/);
    assertGateOutcome(html, "activity.edit", state);
  });

  test(`activity page: activity.delete is ${state}`, async () => {
    const html = await loadActivityPage(gatesWith("activity.delete", state)).render();
    assert.match(html, new RegExp(`data-delete="${state === "entitled"}"`));
    assert.match(html, /data-edit="true"/);
    assertGateOutcome(html, "activity.delete", state);
  });
}

// ---------------------------------------------------------------- story page (inline edit)

const STORY_SPIDER = {
  id: "spider-1",
  name: "Webster",
  profilePhoto: null,
  acquisitionDate: null,
  source: null,
  molts: [],
  observations: [],
  feedings: [
    { id: "f1", date: new Date("2026-10-01T12:00:00Z"), quantity: 1, preyType: "cricket", outcome: "Ate", photoUrl: null, preySize: null, notes: null },
  ],
  mistings: [],
  bodyConditions: [],
  enclosure: null,
  photos: [],
};

function loadStoryPage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled", proAccess = true) {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children }),
    "next/navigation": { notFound: () => { throw new Error("notFound"); } },
    "@/lib/constants": { observationLabel: (kind: string) => kind },
    "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
    "@/components/activity/activity-editor": {
      ActivityEditorRow: ({ allowEdit, allowDelete, readOnly }: Record<string, boolean>) =>
        el("div", {
          "data-testid": "event-editor",
          "data-edit": String(allowEdit),
          "data-delete": String(allowDelete),
          "data-readonly": String(readOnly),
        }),
    },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/photo-gallery": { PhotoOpenButton: passthrough },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": { Card: passthrough },
    "@/lib/utils": { ...utils, resolveDisplayTimeZone: async () => "UTC" },
    "@/lib/spiders": {
      getUserDefaults: async () => ({ timezone: "UTC" }),
      getSpiderStory: async () => ({ includeAcquisition: false, nextCursor: null, spider: STORY_SPIDER }),
    },
    "@/lib/session": { requireUser: async () => ({ id: scenario === "unauthenticated" ? null : "user-1" }) },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess, firstSpiderId: "other-spider" }) },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>("app/(app)/spoods/[id]/story/page.tsx", dependencies);
  return {
    capture,
    render: async () =>
      markup(await page.default({ params: Promise.resolve({ id: "spider-1" }), searchParams: Promise.resolve({}) })),
  };
}

test("story page resolves both inline-edit gates in one call for the signed-in user", async () => {
  const page = loadStoryPage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(page.capture.allGateCalls.map(([, key]) => key).sort(), ["activity.delete", "activity.edit"]);
});

test("story page: a user without an id gets read-only upsell state and never hits the gate resolver", async () => {
  const page = loadStoryPage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.match(html, /data-edit="false"/);
  assert.match(html, /data-delete="false"/);
  assert.match(html, /href="\/features\/activity\.edit"/);
});

for (const state of STATES) {
  test(`story page: activity.edit is ${state}`, async () => {
    const html = await loadStoryPage(gatesWith("activity.edit", state)).render();
    assert.match(html, new RegExp(`data-edit="${state === "entitled"}"`));
    assert.match(html, /data-delete="true"/);
    assertGateOutcome(html, "activity.edit", state);
  });

  test(`story page: activity.delete is ${state}`, async () => {
    const html = await loadStoryPage(gatesWith("activity.delete", state)).render();
    assert.match(html, new RegExp(`data-delete="${state === "entitled"}"`));
    assert.match(html, /data-edit="true"/);
    assertGateOutcome(html, "activity.delete", state);
  });
}

test("story page: a read-only spood shows no activity upsell notices", async () => {
  const html = await loadStoryPage(gatesWith("activity.edit", "upsell"), "entitled", false).render();
  assert.doesNotMatch(html, /\/features\/activity\.edit/);
});
