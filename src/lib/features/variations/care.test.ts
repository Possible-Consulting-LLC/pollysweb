import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureGate } from "../../../components/features/feature-gate";
import * as writeValidation from "../../write-validation";
import type { FeatureGateState } from "../gate";
import {
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

type ActionResult = { ok: boolean; error?: string; message?: string };

const ACTIONS: Array<{
  key: string;
  fn: string;
  args: (form: FormData) => unknown[];
  fill: (form: FormData) => void;
}> = [
  {
    key: "care.feed.log",
    fn: "quickFeed",
    args: (form) => ["spider-1", form],
    fill: (form) => form.set("preyType", "crickets"),
  },
  {
    key: "care.hydrate.log",
    fn: "quickMist",
    args: (form) => ["spider-1", form],
    fill: (form) => form.append("method", "Misted enclosure"),
  },
  {
    key: "care.observe.log",
    fn: "quickObservation",
    args: (form) => ["spider-1", form],
    fill: (form) => form.set("notes", "Webbing everywhere"),
  },
  {
    key: "care.play.log",
    fn: "quickInteraction",
    args: (form) => ["spider-1", form],
    fill: (form) => form.set("method", "Watched together"),
  },
  {
    key: "care.body_condition.log",
    fn: "logBodyCondition",
    args: (form) => ["spider-1", form],
    fill: (form) => form.set("condition", "Plump"),
  },
  {
    key: "care.molt.log",
    fn: "logMolt",
    args: (form) => ["spider-1", form],
    fill: (form) => form.set("successful", "on"),
  },
  {
    key: "care.premolt.manage",
    fn: "updatePremoltStatus",
    args: () => ["spider-1", "Premolt", "ctx"],
    fill: () => {},
  },
];

function loadCareAction(scenario: Scenario, key: string) {
  const capture = newCapture();
  const { order } = capture;
  const db = makeDb(gateStateFor(scenario), key);
  const row = () => ({ date: new Date("2026-10-02T12:00:00Z") });
  const tx = new Proxy({}, { get: () => ({ create: async () => row(), update: async () => row() }) });

  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/maintenance-write": {
      writableSpiderTransaction: async (_user: string, _spider: string, work: (tx: unknown) => unknown) => {
        order.push("transaction");
        return work(tx);
      },
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
    "@/lib/care-celebrations": {
      baselineCelebrations: async () => [],
      finishCareCelebrations: async () => [],
    },
    "@/lib/history-mutations": {
      mutateMolt: async (_spider: string, work: (tx: unknown) => unknown) => {
        order.push("transaction");
        return work(tx);
      },
    },
    "@/lib/care": { isValidPremoltStatus: () => true },
    "@/lib/spood-details": { resolveMoltStages: () => ({ previousInstar: "I3", newInstar: "I4" }) },
    "@/lib/interaction": { interactionNotes: () => "A little moment" },
    "@/lib/write-validation": writeValidation,
    "@/app/actions/care-shared": {
      getCareWriteUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
      ownedSpider: async () => ({ id: "spider-1", name: "Webster", instar: "I3" }),
      revalidateSpider: () => {},
      asOptionalString: (value: FormDataEntryValue | null) => (value ? String(value) : undefined),
      resolveActivityDateTime: async () => new Date("2026-10-02T12:00:00Z"),
    },
    zod: { z },
  };
  const exports = loadModule<Record<string, (...args: unknown[]) => Promise<ActionResult>>>(
    "app/actions/care-events.ts",
    dependencies,
  );
  return { exports, capture };
}

for (const { key, fn, args, fill } of ACTIONS) {
  const run = (scenario: Scenario) => {
    const { exports, capture } = loadCareAction(scenario, key);
    const form = new FormData();
    fill(form);
    return { call: () => exports[fn](...args(form)), capture };
  };

  test(`${fn} (${key}): entitled user passes the gate and reaches the write`, async () => {
    const { call, capture } = run("entitled");
    const result = await call();
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(capture.redirects, []);
    assert.deepEqual(capture.order, [`gate:${key}`, "withMutation", "user", "transaction"]);
  });

  test(`${fn} (${key}): not-entitled user is redirected to the upsell before any mutation work`, async () => {
    const { call, capture } = run("upsell");
    await assert.rejects(call(), new RegExp(`redirect:/features/${key.replace(/\./g, "\\.")}$`));
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

const CARE_KEYS = [
  "care.feed.log",
  "care.hydrate.log",
  "care.molt.log",
  "care.observe.log",
  "care.play.log",
  "care.body_condition.log",
  "care.premolt.manage",
  "care.status.view",
] as const;

const STATES: FeatureGateState[] = ["entitled", "upsell", "coming-soon"];

function gatesWith(key: string, state: FeatureGateState): Record<string, FeatureGateState> {
  return Object.fromEntries(CARE_KEYS.map((k) => [k, k === key ? state : "entitled"]));
}

function assertGateOutcome(html: string, key: string, state: FeatureGateState) {
  if (state === "upsell") assert.match(html, new RegExp(`href="/features/${key.replace(/\./g, "\\.")}"`));
  else assert.doesNotMatch(html, new RegExp(`/features/${key.replace(/\./g, "\\.")}`));
  if (state === "coming-soon") assert.match(html, /coming soon/i);
  else assert.doesNotMatch(html, /coming soon/i);
}

const el = (tag: string, props: Record<string, unknown> = {}) => jsx.jsx(tag as "div", props);
const passthrough = ({ children }: { children?: unknown }) => jsx.jsx("div", { children });

const CARD_STUBS = {
  "react/jsx-runtime": jsx,
  "next/link": ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children }),
  "@/components/features/feature-gate": { FeatureGate },
  "@/components/spoods/care-status-grid": { CareStatusGrid: () => el("div", { "data-testid": "care-status-grid" }) },
  "@/components/spoods/quick-log": {
    QuickLogButtons: ({ actions }: { actions: string[] }) =>
      el("div", { "data-testid": "quick-log", "data-actions": actions.join(",") }),
  },
  "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
  "@/components/ui/button": { buttonVariants: () => "btn" },
  "@/components/ui/card": { Card: passthrough, StatusPill: ({ status }: { status: string }) => el("span", { children: status }) },
  "@/lib/care": { friendlyNeedCopy: () => "needs care", isPremoltLike: () => false },
  "@/lib/utils": { parseHydrationMethods: () => [] },
};

type SpoodCardModule = {
  SpoodCareDetails: (props: Record<string, unknown>) => unknown;
  CARE_FEATURE_KEYS: readonly string[];
};

const loadSpoodCard = () => loadModule<SpoodCardModule>("components/spoods/spood-card.tsx", CARD_STUBS);
const markup = (node: unknown) => renderToStaticMarkup(node as Parameters<typeof renderToStaticMarkup>[0]);

const VIEW = {
  spider: {
    id: "spider-1",
    name: "Webster",
    sex: "Female",
    commonName: "Tarantula",
    species: "Grammostola",
    instar: "I3",
    status: "Normal",
    memorializedAt: null,
    profilePhoto: null,
    enclosure: null,
    feedings: [],
    mistings: [],
    photos: [],
  },
  careStatus: "Feed soon",
  mistDue: false,
  daysSinceFeed: 2,
  daysSinceMist: 1,
  latestBehavior: "Calm",
  latestBodyCondition: null,
  lastFedAt: null,
  lastSuccessfulFedAt: null,
  lastMistedAt: null,
  daysSinceMolt: null,
  timeZone: "UTC",
};

test("care gate keys exposed to pages cover exactly the eight care features", () => {
  assert.deepEqual([...loadSpoodCard().CARE_FEATURE_KEYS].sort(), [...CARE_KEYS].sort());
});

const QUICK_ACTIONS: Array<[string, string]> = [
  ["care.feed.log", "feed"],
  ["care.hydrate.log", "hydrate"],
  ["care.molt.log", "molt"],
  ["care.observe.log", "note"],
  ["care.play.log", "play"],
];

for (const [key, action] of QUICK_ACTIONS) {
  for (const state of STATES) {
    test(`quick-log ${action} (${key}): ${state}`, () => {
      const { SpoodCareDetails } = loadSpoodCard();
      // pages that show housekeeping in the quick-log row pass its state (an omitted state fails closed)
      const gates = { ...gatesWith(key, state), "housekeeping.log": "entitled" };
      const html = markup(SpoodCareDetails({ view: VIEW, gates, showStatus: false }));
      const actions = /data-actions="([^"]*)"/.exec(html)?.[1].split(",") ?? [];
      if (state === "entitled") assert.ok(actions.includes(action), html);
      else assert.ok(!actions.includes(action), html);
      for (const other of QUICK_ACTIONS.filter(([, a]) => a !== action)) assert.ok(actions.includes(other[1]), html);
      assert.ok(actions.includes("housekeeping"));
      assertGateOutcome(html, key, state);
    });
  }
}

test("quick-log renders no buttons component when every gated action is locked and none remain", () => {
  const { SpoodCareDetails } = loadSpoodCard();
  const gates = Object.fromEntries(CARE_KEYS.map((k) => [k, "upsell"]));
  const html = markup(SpoodCareDetails({ view: VIEW, gates, showStatus: false, actions: ["feed", "hydrate"] }));
  assert.doesNotMatch(html, /data-testid="quick-log"/);
  assert.match(html, /href="\/features\/care\.feed\.log"/);
  assert.match(html, /href="\/features\/care\.hydrate\.log"/);
});

for (const state of STATES) {
  test(`care status grid (care.status.view) in spood details: ${state}`, () => {
    const { SpoodCareDetails } = loadSpoodCard();
    const html = markup(SpoodCareDetails({ view: VIEW, gates: gatesWith("care.status.view", state), showQuickActions: false }));
    assert.equal(html.includes('data-testid="care-status-grid"'), state === "entitled");
    assertGateOutcome(html, "care.status.view", state);
  });
}

type PageCapture = { gateCalls: Array<[string, string]> };

function loadProfilePage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const card = loadSpoodCard();
  const stubForm = (testid: string) => () => el("form", { "data-testid": testid });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": CARD_STUBS["next/link"],
    "next/navigation": { notFound: () => { throw new Error("notFound"); } },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/spood-card": card,
    "@/components/spoods/premolt-toggle": { PremoltToggle: stubForm("premolt-toggle") },
    "@/components/spoods/about-form": { AboutForm: stubForm("about-form") },
    "@/components/spoods/profile-forms": {
      BodyConditionForm: stubForm("body-condition-form"),
      EnclosureForm: stubForm("enclosure-form"),
      MaintenanceForm: stubForm("maintenance-form"),
      PhotoUploadForm: stubForm("photo-upload-form"),
    },
    "@/components/spoods/memorial-panel": { MemorialPanel: stubForm("memorial-panel") },
    "@/components/spoods/photo-gallery": { PhotoGallery: () => el("div") },
    "@/components/spoods/spood-image": CARD_STUBS["@/components/spoods/spood-image"],
    "@/components/ui/button": CARD_STUBS["@/components/ui/button"],
    "@/components/ui/card": { ...CARD_STUBS["@/components/ui/card"], SectionHeader: ({ title }: { title: string }) => el("h2", { children: title }) },
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
    gateCalls: capture.gateCalls,
    render: async () =>
      markup(await page.default({ params: Promise.resolve({ id: "spider-1" }), searchParams: Promise.resolve({}) })),
  } satisfies PageCapture & { render: () => Promise<string> };
}

test("spood profile page resolves every care gate for the signed-in user", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(
    page.gateCalls.map(([user]) => user),
    CARE_KEYS.map(() => "user-1"),
  );
  assert.deepEqual(page.gateCalls.map(([, key]) => key).sort(), [...CARE_KEYS].sort());
});

test("spood profile page: a user without an id sees upsells and never hits the gate resolver", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.gateCalls, []);
  for (const key of CARE_KEYS) assert.match(html, new RegExp(`href="/features/${key.replace(/\./g, "\\.")}"`));
  assert.doesNotMatch(html, /premolt-toggle|body-condition-form|data-testid="quick-log"[^>]*data-actions="[^"]*feed/);
});

for (const state of STATES) {
  test(`spood profile page: care.premolt.manage is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("care.premolt.manage", state)).render();
    assert.equal(html.includes('data-testid="premolt-toggle"'), state === "entitled");
    assertGateOutcome(html, "care.premolt.manage", state);
  });

  test(`spood profile page: care.body_condition.log is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("care.body_condition.log", state)).render();
    assert.equal(html.includes('data-testid="body-condition-form"'), state === "entitled");
    assertGateOutcome(html, "care.body_condition.log", state);
  });

  test(`spood profile page: care.status.view is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("care.status.view", state)).render();
    assert.equal(html.includes("Last successful meal"), state === "entitled");
    assertGateOutcome(html, "care.status.view", state);
  });

  for (const [key, action] of QUICK_ACTIONS) {
    test(`spood profile page: ${key} quick-log is ${state}`, async () => {
      const html = await loadProfilePage(gatesWith(key, state)).render();
      const actions = /data-actions="([^"]*)"/.exec(html)?.[1].split(",") ?? [];
      assert.equal(actions.includes(action), state === "entitled", html);
      assertGateOutcome(html, key, state);
    });
  }
}

function loadHomePage(states: Record<string, FeatureGateState>, views: unknown[] = [VIEW]) {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const card = loadSpoodCard();
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": CARD_STUBS["next/link"],
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/layout/nav": { AppHeader: ({ title }: { title: string }) => el("h1", { children: title }) },
    "@/components/spoods/spood-card": card,
    "@/components/spoods/spood-image": CARD_STUBS["@/components/spoods/spood-image"],
    "@/components/ui/button": CARD_STUBS["@/components/ui/button"],
    "@/components/ui/card": {
      ...CARD_STUBS["@/components/ui/card"],
      EmptyState: ({ title, action }: { title: string; action?: unknown }) => el("div", { children: [title, action] }),
      SectionHeader: ({ title, subtitle }: { title: string; subtitle?: string }) =>
        el("h2", { children: [title, subtitle ? ` — ${subtitle}` : ""] }),
    },
    "@/components/constellation/streak-card": { StreakCard: () => el("div") },
    "@/components/auth/email-verification-notice": { EmailVerificationNotice: () => el("div") },
    "@/lib/email-verification": { legacyVerificationDeadline: () => null },
    "@/lib/care-progress-data": { withCareProgress: async (_u: string, _d: string, _z: string, items: unknown) => items },
    "@/lib/constellation": { calendarDayKey: () => "2026-10-02" },
    "@/lib/constellation-data": { getStreakPreview: async () => ({ completedToday: false }), reviewItemsFor: () => [] },
    "@/lib/spiders": {
      getRecentActivity: async () => [],
      getUserDefaults: async () => ({ timezone: "UTC", name: "Ada", createdAt: new Date(), feedDefaultDays: 7 }),
      listSpidersForUser: async () => views,
    },
    "@/lib/utils": {
      daysBetween: () => 3,
      formatDateTimeInZone: () => "now",
      resolveDisplayTimeZone: () => "UTC",
      parseHydrationMethods: () => [],
    },
    "@/lib/care": { friendlyNeedCopy: () => "needs care" },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: "spider-1" }) },
    "@/lib/session": { requireUser: async () => ({ id: "user-1" }) },
    "@/lib/db": { prisma: {} },
    "@/lib/features/gate": gateStub(db, sessionFor("entitled"), capture),
  };
  const page = loadModule<{ default: () => Promise<unknown> }>("app/(app)/home/page.tsx", dependencies);
  return { gateCalls: capture.gateCalls, render: async () => markup(await page.default()) };
}

test("home page resolves every care gate for the signed-in user", async () => {
  const page = loadHomePage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(page.gateCalls.map(([, key]) => key).sort(), [...CARE_KEYS].sort());
});

for (const state of STATES) {
  test(`home page: care.status.view is ${state}`, async () => {
    const html = await loadHomePage(gatesWith("care.status.view", state)).render();
    assert.equal(html.includes("could use a moment"), state === "entitled");
    assert.equal(html.includes('data-testid="quick-log"'), state === "entitled");
    assertGateOutcome(html, "care.status.view", state);
  });

  test(`home page: quick-log on the home card honors care.feed.log (${state})`, async () => {
    const html = await loadHomePage(gatesWith("care.feed.log", state)).render();
    const actions = /data-actions="([^"]*)"/.exec(html)?.[1].split(",") ?? [];
    assert.equal(actions.includes("feed"), state === "entitled", html);
    assert.ok(actions.includes("hydrate"));
    assertGateOutcome(html, "care.feed.log", state);
  });
}

test("home page keeps the add-first-spood call to action when care.status.view is locked and there are no spoods", async () => {
  const html = await loadHomePage(gatesWith("care.status.view", "upsell"), []).render();
  assert.match(html, /No spoods yet/);
  assert.match(html, /href="\/spoods\/new"/);
});

function loadSpoodsListPage(states: Record<string, FeatureGateState>) {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": CARD_STUBS["next/link"],
    "@/components/layout/nav": { AppHeader: () => el("h1") },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/spood-card": { ...loadSpoodCard(), SpoodIdentity: () => el("div") },
    "@/components/spoods/spood-search": { SpoodSearch: () => el("input") },
    "@/components/spoods/spood-accordion": {
      SpoodAccordion: ({ items }: { items: Array<{ content: unknown }> }) =>
        jsx.jsx("div", { children: items.map((item) => item.content) }),
    },
    "@/components/ui/button": { Button: passthrough, buttonVariants: () => "btn" },
    "@/components/ui/card": { EmptyState: () => el("div"), SectionHeader: () => el("h2") },
    "@/components/ui/field": { Field: passthrough, Select: passthrough },
    "@/lib/spiders": { listSpidersForUser: async () => [VIEW] },
    "@/lib/session": { requireUser: async () => ({ id: "user-1" }) },
    "@/lib/constants": { PREMOLT_STATUSES: [], SEX_OPTIONS: [] },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: "spider-1" }) },
    "@/lib/features/gate": gateStub(db, sessionFor("entitled"), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>("app/(app)/spoods/page.tsx", dependencies);
  return {
    gateCalls: capture.gateCalls,
    render: async () => markup(await page.default({ searchParams: Promise.resolve({}) })),
  };
}

test("spoods list page resolves every care gate for the signed-in user", async () => {
  const page = loadSpoodsListPage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(page.gateCalls.map(([, key]) => key).sort(), [...CARE_KEYS].sort());
});

for (const state of STATES) {
  test(`spoods list page: care.status.view is ${state}`, async () => {
    const html = await loadSpoodsListPage(gatesWith("care.status.view", state)).render();
    assert.equal(html.includes('data-testid="care-status-grid"'), state === "entitled");
    assertGateOutcome(html, "care.status.view", state);
  });

  test(`spoods list page: care.molt.log is ${state}`, async () => {
    const html = await loadSpoodsListPage(gatesWith("care.molt.log", state)).render();
    const actions = /data-actions="([^"]*)"/.exec(html)?.[1].split(",") ?? [];
    assert.equal(actions.includes("molt"), state === "entitled", html);
    assertGateOutcome(html, "care.molt.log", state);
  });
}
