import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureGate } from "../../../components/features/feature-gate";
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

const PHOTO_KEYS = ["photo.upload", "photo.gallery.view", "photo.profile.set", "photo.delete"] as const;
const JOURNEY_KEYS = ["universe.view", "journey.check_in", "journey.streaks.view", "journey.badges.view"] as const;
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

const escape = (key: string) => key.replace(/\./g, "\\.");
const el = (tag: string, props: Record<string, unknown> = {}) => jsx.jsx(tag as "div", props);
const passthrough = ({ children }: { children?: unknown }) => jsx.jsx("div", { children });
const markup = (node: unknown) => renderToStaticMarkup(node as Parameters<typeof renderToStaticMarkup>[0]);

function gatesWith(key: string, state: FeatureGateState): Record<string, FeatureGateState> {
  return Object.fromEntries(
    [...CARE_KEYS, ...PHOTO_KEYS, ...JOURNEY_KEYS].map((k) => [k, k === key ? state : "entitled"]),
  );
}

function assertGateOutcome(html: string, key: string, state: FeatureGateState) {
  if (state === "upsell") assert.match(html, new RegExp(`href="/features/${escape(key)}"`));
  else assert.doesNotMatch(html, new RegExp(`/features/${escape(key)}`));
  if (state === "coming-soon") assert.match(html, /coming soon/i);
  else assert.doesNotMatch(html, /coming soon/i);
}

test("peer-category defaults in the harness include the photo and journey keys", () => {
  for (const key of [...PHOTO_KEYS, ...JOURNEY_KEYS]) {
    assert.ok(PEER_CATEGORY_KEYS.includes(key), `${key} must default to entitled in peer-category fixtures`);
  }
});

// ---------------------------------------------------------------- resolveUserGates

test("resolveUserGates resolves each key to its own state for a signed-in user", async () => {
  const db = makeDb({ "a.one": "entitled", "a.two": "coming-soon", "a.three": "entitled" });
  const gates = await resolveUserGates(db, "user-1", ["a.one", "a.two", "a.three", "a.unknown"]);
  assert.deepEqual(gates, {
    "a.one": "entitled",
    "a.two": "coming-soon",
    "a.three": "entitled",
    "a.unknown": "coming-soon",
  });
});

test("resolveUserGates marks a registered but unentitled key as upsell", async () => {
  const db = makeDb({ "a.one": "upsell" });
  assert.deepEqual(await resolveUserGates(db, "user-1", ["a.one"]), { "a.one": "upsell" });
});

for (const userId of [null, undefined, ""]) {
  test(`resolveUserGates gives released keys an upsell and unreleased keys coming-soon without reading a user for userId=${JSON.stringify(userId)}`, async () => {
    const healthy = makeDb({ "a.one": "upsell", "a.two": "coming-soon" });
    const db = { ...healthy, user: { findUnique: () => assert.fail("no user to read") } } as unknown as FeatureGateDb;
    assert.deepEqual(await resolveUserGates(db, userId, ["a.one", "a.two", "a.unknown"]), {
      "a.one": "upsell",
      "a.two": "coming-soon",
      "a.unknown": "coming-soon",
    });
  });
}

test("resolveUserGates fails every key closed when the batched feature read throws", async () => {
  const healthy = makeDb({ "a.one": "entitled", "a.two": "entitled" });
  const db = {
    ...healthy,
    feature: {
      findMany: async () => {
        throw new Error("db down");
      },
      findUnique: () => assert.fail("no per-key fallback"),
    },
  } as unknown as FeatureGateDb;
  assert.deepEqual(await resolveUserGates(db, "user-1", ["a.one", "a.two"]), {
    "a.one": "coming-soon",
    "a.two": "coming-soon",
  });
});

test("resolveUserGates fails safe when the whole db is unavailable", async () => {
  const db = new Proxy({}, { get: () => { throw new Error("db down"); } }) as unknown as FeatureGateDb;
  assert.deepEqual(await resolveUserGates(db, "user-1", ["a.one", "a.two"]), {
    "a.one": "coming-soon",
    "a.two": "coming-soon",
  });
});

test("resolveUserGates returns an empty record for no keys", async () => {
  assert.deepEqual(await resolveUserGates(makeDb({}), "user-1", []), {});
});

// ---------------------------------------------------------------- actions

type ActionResult = { ok: boolean; error?: string; message?: string };

function writableTx(order: string[]) {
  const row = () => ({ id: "photo-1" });
  return new Proxy(
    {},
    {
      get: (_target, model: string) => ({
        create: async () => (order.push(`${model}.create`), row()),
        update: async (args: { data: Record<string, unknown> }) => (order.push(`${model}.update`), args),
      }),
    },
  );
}

function loadHabitat(scenario: Scenario, states: Record<string, FeatureGateState>) {
  const capture = newCapture();
  const { order } = capture;
  const db = makeDb(states);
  const tx = writableTx(order);
  const storedPhoto = {
    id: "photo-1",
    spiderId: "spider-1",
    url: "spood-storage:user-1/new.png",
    spider: { id: "spider-1", name: "Webster", profilePhoto: "spood-storage:user-1/old.png" },
  };
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
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
    "@/lib/care-celebrations": { baselineCelebrations: async () => [], finishCareCelebrations: async () => [] },
    "fs/promises": { unlink: async () => {} },
    path: { basename: (value: string) => value, join: (...parts: string[]) => parts.join("/") },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/utils": {},
    "@/lib/history-mutations": {},
    "@/lib/db": { prisma: { photo: { findFirst: async () => storedPhoto } } },
    "@/lib/uploads": {
      saveImageUpload: async () => {
        order.push("upload");
        return { url: "spood-storage:user-1/new.png" };
      },
      cleanupUnattachedUpload: async () => {},
      cleanupDetachedPhoto: async () => "done",
      detachStoredPhotoRecord: async () => ({ url: storedPhoto.url, cleanupPrepared: false }),
    },
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

function photoForm(extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("photo", new File(["image"], "image.png", { type: "image/png" }));
  for (const [name, value] of Object.entries(extra)) form.set(name, value);
  return form;
}

const PHOTO_ACTIONS: Array<{
  key: string;
  fn: string;
  args: () => unknown[];
  entitledOrder: string[];
}> = [
  {
    key: "photo.upload",
    fn: "addSpiderPhoto",
    args: () => ["spider-1", photoForm()],
    entitledOrder: ["gate:photo.upload", "withMutation", "user", "upload", "transaction", "photo.create"],
  },
  {
    key: "photo.profile.set",
    fn: "setSpiderProfilePhoto",
    args: () => ["photo-1", "ctx"],
    entitledOrder: ["gate:photo.profile.set", "withMutation", "user", "transaction", "spider.update", "photo.update"],
  },
  {
    key: "photo.delete",
    fn: "deleteSpiderPhoto",
    args: () => ["photo-1", "ctx"],
    entitledOrder: ["gate:photo.delete", "withMutation", "user", "transaction"],
  },
];

for (const { key, fn, args, entitledOrder } of PHOTO_ACTIONS) {
  const run = (scenario: Scenario) => {
    const { exports, capture } = loadHabitat(scenario, { [key]: gateStateFor(scenario) });
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

for (const state of STATES) {
  test(`addSpiderPhoto: "set as profile" is honored only when photo.profile.set is entitled (${state})`, async () => {
    const { exports, capture } = loadHabitat("entitled", { "photo.upload": "entitled", "photo.profile.set": state });
    const result = await exports.addSpiderPhoto("spider-1", photoForm({ setAsProfile: "on" }));
    assert.equal(result.ok, true, result.error);
    assert.equal(capture.order.includes("spider.update"), state === "entitled");
    assert.ok(capture.order.includes("photo.create"));
    assert.deepEqual(capture.redirects, []);
  });
}

function loadConstellationAction(scenario: Scenario, state: FeatureGateState) {
  const capture = newCapture();
  const { order } = capture;
  const key = "journey.check_in";
  const db = makeDb({ [key]: state });
  const review = {
    completedToday: false,
    reviewItems: [],
    todayKey: "2026-10-02",
    timeZone: "UTC",
    writeState: { proAccess: true, firstSpiderId: null },
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/maintenance-write": {
      maintenanceTransaction: async (work: (tx: unknown) => unknown) => {
        order.push("transaction");
        return work({ $executeRaw: async () => 1 });
      },
      drainCareCompletion: async (read: () => Promise<unknown>) => read(),
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
    "next/cache": { revalidatePath: () => {} },
    "./care-shared": {
      getCareWriteUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
    },
    "@/lib/constellation-data": { getCareReviewState: async () => review },
    "@/lib/care-celebrations": { baselineCelebrations: async () => [], finishCareCelebrations: async () => [] },
  };
  const exports = loadModule<Record<string, (...args: unknown[]) => Promise<ActionResult>>>(
    "app/actions/constellation.ts",
    dependencies,
  );
  return { exports, capture };
}

{
  const key = "journey.check_in";
  const run = (scenario: Scenario) => {
    const { exports, capture } = loadConstellationAction(scenario, gateStateFor(scenario));
    return { call: () => exports.completeCareDay(new FormData()), capture };
  };

  test(`completeCareDay (${key}): entitled user passes the gate and reaches the write`, async () => {
    const { call, capture } = run("entitled");
    const result = await call();
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(capture.redirects, []);
    assert.deepEqual(capture.order, [`gate:${key}`, "withMutation", "user", "transaction"]);
  });

  test(`completeCareDay (${key}): not-entitled user is redirected to the upsell before any mutation work`, async () => {
    const { call, capture } = run("upsell");
    await assert.rejects(call(), new RegExp(`redirect:/features/${escape(key)}$`));
    assert.deepEqual(capture.redirects, [`/features/${key}`]);
    assert.deepEqual(capture.order, [`gate:${key}`]);
  });

  test(`completeCareDay (${key}): coming-soon feature redirects with ?state=coming-soon before any mutation work`, async () => {
    const { call, capture } = run("coming-soon");
    await assert.rejects(call(), /\?state=coming-soon$/);
    assert.deepEqual(capture.redirects, [`/features/${key}?state=coming-soon`]);
    assert.deepEqual(capture.order, [`gate:${key}`]);
  });

  test(`completeCareDay (${key}): unauthenticated session gets the upsell redirect before any mutation work`, async () => {
    const { call, capture } = run("unauthenticated");
    await assert.rejects(call(), /redirect:/);
    assert.deepEqual(capture.redirects, [`/features/${key}`]);
    assert.deepEqual(capture.order, [`gate:${key}`]);
  });
}

// ---------------------------------------------------------------- photo gallery route

function loadPhotoRoute(states: Record<string, FeatureGateState>, userId: string | null, profilePhotos: string[] = []) {
  const db = makeDb(states);
  const served: Array<string | null> = [];
  const capture = newCapture();
  const gate = gateStub(db, userId ? { id: userId, plan: "Pro" } : null, capture);
  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-access": { guardMaintenance: async () => {} },
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/admin/test-session-store": { resolveRequestIdentity: async () => ({ effectiveUserId: userId }) },
    "@/lib/db": {
      prisma: {
        spider: {
          findFirst: async ({ where }: { where: { userId: string; profilePhoto: string } }) =>
            where.userId === userId && profilePhotos.includes(where.profilePhoto) ? { id: "spider-1" } : null,
        },
      },
    },
    "@/lib/features/gate": gate,
    "@/lib/supabase": { getSupabaseAdmin: () => assert.fail("must not download") },
    "@/lib/photo-media-route": {
      servePrivatePhoto: async (_request: Request, deps: { userId: string | null }) => {
        served.push(deps.userId);
        return new Response("image", { status: deps.userId ? 200 : 401 });
      },
    },
    "@/lib/photo-media": { SPOODS_BUCKET: "spood-storage" },
    "@/lib/photo-reference-owner": { ownsPhotoReference: async () => true },
  };
  const route = loadModule<{ GET: (request: Request) => Promise<Response> }>(
    "app/api/photos/route.ts",
    dependencies,
    { Response, URL },
  );
  return {
    get: (ref = "x") => route.GET(new Request(`https://example.test/api/photos?ref=${encodeURIComponent(ref)}`)),
    served,
    gateCalls: capture.allGateCalls,
  };
}

for (const state of ["upsell", "coming-soon"] as const) {
  test(`photo gallery route (photo.gallery.view): a spood profile photo renders for a ${state} user without resolving the gate`, async () => {
    const route = loadPhotoRoute({ "photo.gallery.view": state }, "user-1", ["profile-ref"]);
    assert.equal((await route.get("profile-ref")).status, 200);
    assert.deepEqual(route.served, ["user-1"]);
    assert.deepEqual(route.gateCalls, []);
  });

  test(`photo gallery route (photo.gallery.view): a gallery reference still 403s for a ${state} user even when a profile photo exists`, async () => {
    const route = loadPhotoRoute({ "photo.gallery.view": state }, "user-1", ["profile-ref"]);
    assert.equal((await route.get("gallery-ref")).status, 403);
    assert.deepEqual(route.served, []);
    assert.deepEqual(route.gateCalls, [["user-1", "photo.gallery.view"]]);
  });
}

test("photo gallery route (photo.gallery.view): entitled user is served", async () => {
  const route = loadPhotoRoute({ "photo.gallery.view": "entitled" }, "user-1");
  assert.equal((await route.get()).status, 200);
  assert.deepEqual(route.served, ["user-1"]);
});

for (const state of ["upsell", "coming-soon"] as const) {
  test(`photo gallery route (photo.gallery.view): ${state} user gets 403 and nothing is served`, async () => {
    const route = loadPhotoRoute({ "photo.gallery.view": state }, "user-1");
    const response = await route.get();
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(route.served, []);
  });
}

test("photo gallery route (photo.gallery.view): unauthenticated request still reaches the existing 401 path", async () => {
  const route = loadPhotoRoute({ "photo.gallery.view": "entitled" }, null);
  assert.equal((await route.get()).status, 401);
  assert.deepEqual(route.served, [null]);
});

// ---------------------------------------------------------------- gallery component

function loadRealGallery() {
  const dependencies: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsx,
    "lucide-react": new Proxy({}, { get: () => () => null }),
    "date-fns": { format: () => "" },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/mutation-context": { useMutationContext: () => "ctx" },
    "@/app/actions/care": {},
    "@/lib/utils": { cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/modal-dialog": { ModalDialog: passthrough },
    "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
  };
  return loadModule<{ PhotoGallery: React.ComponentType<Record<string, unknown>> }>(
    "components/spoods/photo-gallery.tsx",
    dependencies,
    { document: {} },
  ).PhotoGallery;
}

test("photo gallery shows grid delete buttons only when management and photo.delete are both allowed", () => {
  const PhotoGallery = loadRealGallery();
  const photos = [1, 2].map((i) => ({ id: String(i), url: `/p${i}.jpg`, caption: `Moment ${i}`, takenAt: "2026-10-02T12:00:00Z" }));
  const deletes = (props: Record<string, unknown>) =>
    (markup(React.createElement(PhotoGallery, { photos, ...props })).match(/aria-label="Delete photo/g) ?? []).length;
  assert.equal(deletes({}), 0, "omitted allow flags fail closed");
  assert.equal(deletes({ allowManage: true }), 0);
  assert.equal(deletes({ allowManage: true, allowDelete: true }), 2);
  assert.equal(deletes({ allowManage: true, allowDelete: false }), 0);
  assert.equal(deletes({ allowManage: false, allowDelete: true }), 0);
  assert.equal(deletes({ allowManage: true, allowDelete: true, allowSetProfile: false }), 2);
});

// ---------------------------------------------------------------- pages

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
  enclosure: null,
  feedings: [],
  mistings: [],
  photos: [{ id: "photo-1", url: "/p.jpg", caption: "Hi", takenAt: new Date("2026-10-02T12:00:00Z") }],
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
    "@/components/spoods/spood-card": { CARE_FEATURE_KEYS: CARE_KEYS, GatedQuickLogButtons: () => null },
    "@/components/spoods/premolt-toggle": { PremoltToggle: stub("premolt-toggle") },
    "@/components/spoods/about-form": { AboutForm: stub("about-form") },
    "@/components/spoods/profile-forms": {
      BodyConditionForm: stub("body-condition-form"),
      EnclosureForm: stub("enclosure-form"),
      MaintenanceForm: stub("maintenance-form"),
      PhotoUploadForm: ({ allowSetAsProfile }: { allowSetAsProfile?: boolean }) =>
        el("div", { "data-testid": "photo-upload-form", "data-allow-profile": String(allowSetAsProfile) }),
    },
    "@/components/spoods/memorial-panel": { MemorialPanel: stub("memorial-panel") },
    "@/components/spoods/photo-gallery": {
      PhotoGallery: ({ allowManage, allowSetProfile, allowDelete }: Record<string, boolean>) =>
        el("div", {
          "data-testid": "photo-gallery",
          "data-manage": String(allowManage),
          "data-set-profile": String(allowSetProfile),
          "data-delete": String(allowDelete),
        }),
    },
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
    renderWith: async (params: Promise<{ id: string }>) =>
      markup(await page.default({ params, searchParams: Promise.resolve({}) })),
  };
}

test("spood profile page resolves every photo gate for the signed-in user", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"));
  await page.render();
  const photoCalls = page.capture.allGateCalls.filter(([, key]) => key.startsWith("photo."));
  assert.deepEqual(photoCalls.map(([user]) => user), PHOTO_KEYS.map(() => "user-1"));
  assert.deepEqual(photoCalls.map(([, key]) => key).sort(), [...PHOTO_KEYS].sort());
});

test("spood profile page: a user without an id sees photo upsells and never hits the gate resolver", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  for (const key of ["photo.upload", "photo.gallery.view"]) assert.match(html, new RegExp(`href="/features/${escape(key)}"`));
  assert.doesNotMatch(html, /photo-upload-form|photo-gallery/);
});

test("spood profile page starts gate resolution before route params resolve (no waterfall)", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"));
  let release!: (value: { id: string }) => void;
  const params = new Promise<{ id: string }>((resolve) => { release = resolve; });
  const rendered = page.renderWith(params);
  await new Promise((resolve) => setImmediate(resolve));
  const started = page.capture.allGateCalls.length;
  release({ id: "spider-1" });
  await rendered;
  assert.ok(started >= CARE_KEYS.length + PHOTO_KEYS.length, `gate resolution must start before params resolve (started ${started})`);
});

for (const state of STATES) {
  test(`spood profile page: photo.upload is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("photo.upload", state)).render();
    assert.equal(html.includes('data-testid="photo-upload-form"'), state === "entitled");
    assert.ok(html.includes('data-testid="photo-gallery"'));
    assertGateOutcome(html, "photo.upload", state);
  });

  test(`spood profile page: photo.gallery.view is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("photo.gallery.view", state)).render();
    assert.equal(html.includes('data-testid="photo-gallery"'), state === "entitled");
    assert.ok(html.includes('data-testid="photo-upload-form"'));
    assertGateOutcome(html, "photo.gallery.view", state);
  });

  test(`spood profile page: photo.profile.set is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("photo.profile.set", state)).render();
    const entitled = state === "entitled";
    assert.ok(html.includes(`data-set-profile="${entitled}"`), html);
    assert.ok(html.includes(`data-allow-profile="${entitled}"`), html);
    assert.ok(html.includes('data-delete="true"'));
    assertGateOutcome(html, "photo.profile.set", state);
  });

  test(`spood profile page: photo.delete is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("photo.delete", state)).render();
    assert.ok(html.includes(`data-delete="${state === "entitled"}"`), html);
    assert.ok(html.includes('data-set-profile="true"'));
    assert.ok(html.includes('data-allow-profile="true"'));
    assertGateOutcome(html, "photo.delete", state);
  });
}

function loadConstellationPage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const stub = (testid: string) => () => el("div", { "data-testid": testid });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children }),
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/layout/nav": { AppHeader: ({ title }: { title: string }) => el("h1", { children: title }) },
    "@/components/constellation/care-review": { CareReview: stub("care-review") },
    "@/components/constellation/recent-care-meter": { RecentCareMeter: stub("recent-care-meter") },
    "@/components/constellation/reward-gallery": { RewardGallery: stub("reward-gallery") },
    "@/lib/constellation-data": {
      getConstellationData: async () => ({
        daysTogether: 3,
        todayKey: "2026-10-02",
        completedDayKeys: [],
        streak: { current: 1 },
        reviewItems: [{ id: "spider-1" }],
        completedToday: false,
        stories: [],
        storyProgress: {},
      }),
    },
    "@/lib/session": { requireUser: async () => ({ id: scenario === "unauthenticated" ? null : "user-1" }) },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: () => Promise<unknown> }>("app/(app)/constellation/page.tsx", dependencies);
  return { capture, render: async () => markup(await page.default()) };
}

const INNER: Array<[string, string]> = [
  ["journey.streaks.view", "recent-care-meter"],
  ["journey.check_in", "care-review"],
  ["journey.badges.view", "reward-gallery"],
];

test("constellation page resolves every journey gate for the signed-in user", async () => {
  const page = loadConstellationPage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(page.capture.allGateCalls.map(([user]) => user), JOURNEY_KEYS.map(() => "user-1"));
  assert.deepEqual(page.capture.allGateCalls.map(([, key]) => key).sort(), [...JOURNEY_KEYS].sort());
});

test("constellation page: a user without an id sees the care-journey upsell and never hits the gate resolver", async () => {
  const page = loadConstellationPage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.match(html, /href="\/features\/universe\.view"/);
  assert.doesNotMatch(html, /recent-care-meter|care-review|reward-gallery/);
});

for (const state of STATES) {
  test(`constellation page: universe.view is ${state}`, async () => {
    const html = await loadConstellationPage(gatesWith("universe.view", state)).render();
    assert.match(html, /Your Care Journey/);
    for (const [, testid] of INNER) assert.equal(html.includes(`data-testid="${testid}"`), state === "entitled");
    assertGateOutcome(html, "universe.view", state);
  });

  for (const [key, testid] of INNER) {
    test(`constellation page: ${key} is ${state}`, async () => {
      const html = await loadConstellationPage(gatesWith(key, state)).render();
      assert.equal(html.includes(`data-testid="${testid}"`), state === "entitled");
      for (const [, other] of INNER.filter(([, id]) => id !== testid)) assert.ok(html.includes(`data-testid="${other}"`));
      assertGateOutcome(html, key, state);
    });
  }
}

function loadHomePage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children }),
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/layout/nav": { AppHeader: ({ title }: { title: string }) => el("h1", { children: title }) },
    "@/components/spoods/spood-card": { CARE_FEATURE_KEYS: CARE_KEYS, SpoodCareCard: () => null },
    "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": {
      Card: passthrough,
      StatusPill: () => el("span"),
      EmptyState: ({ title }: { title: string }) => el("div", { children: title }),
      SectionHeader: ({ title }: { title: string }) => el("h2", { children: title }),
    },
    "@/components/constellation/streak-card": { StreakCard: () => el("div", { "data-testid": "streak-card" }) },
    "@/components/auth/email-verification-notice": { EmailVerificationNotice: () => el("div") },
    "@/lib/email-verification": { legacyVerificationDeadline: () => null },
    "@/lib/care-progress-data": { withCareProgress: async (_u: string, _d: string, _z: string, items: unknown) => items },
    "@/lib/constellation": { calendarDayKey: () => "2026-10-02" },
    "@/lib/constellation-data": { getStreakPreview: async () => ({ completedToday: false }), reviewItemsFor: () => [] },
    "@/lib/spiders": {
      getRecentActivity: async () => [],
      getUserDefaults: async () => ({ timezone: "UTC", name: "Ada", createdAt: new Date(), feedDefaultDays: 7 }),
      listSpidersForUser: async () => [],
    },
    "@/lib/utils": {
      daysBetween: () => 3,
      formatDateTimeInZone: () => "now",
      resolveDisplayTimeZone: () => "UTC",
    },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: null }) },
    "@/lib/session": { requireUser: async () => ({ id: scenario === "unauthenticated" ? null : "user-1" }) },
    "@/lib/db": { prisma: {} },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: () => Promise<unknown> }>("app/(app)/home/page.tsx", dependencies);
  return { capture, render: async () => markup(await page.default()) };
}

test("home page resolves the journey.streaks.view gate for the signed-in user", async () => {
  const page = loadHomePage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(
    page.capture.allGateCalls.filter(([, key]) => key.startsWith("journey.")),
    [["user-1", "journey.streaks.view"]],
  );
});

test("home page: a user without an id sees the streak upsell and never hits the gate resolver", async () => {
  const page = loadHomePage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.match(html, /href="\/features\/journey\.streaks\.view"/);
  assert.doesNotMatch(html, /streak-card/);
});

for (const state of STATES) {
  test(`home page: journey.streaks.view is ${state}`, async () => {
    const html = await loadHomePage(gatesWith("journey.streaks.view", state)).render();
    assert.equal(html.includes('data-testid="streak-card"'), state === "entitled");
    assert.match(html, /Good (morning|afternoon|evening), Ada/);
    assertGateOutcome(html, "journey.streaks.view", state);
  });
}

test("spoods list page starts gate resolution before search params resolve (no waterfall)", async () => {
  const capture: Capture = newCapture();
  const db = makeDb(gatesWith("none", "entitled"));
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children }),
    "@/components/layout/nav": { AppHeader: () => el("h1") },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/spood-card": { CARE_FEATURE_KEYS: CARE_KEYS, SpoodCareDetails: () => null, SpoodIdentity: () => null },
    "@/components/spoods/spood-search": { SpoodSearch: () => el("input") },
    "@/components/spoods/spood-accordion": { SpoodAccordion: () => el("div") },
    "@/components/ui/button": { Button: passthrough, buttonVariants: () => "btn" },
    "@/components/ui/card": { EmptyState: () => el("div"), SectionHeader: () => el("h2") },
    "@/components/ui/field": { Field: passthrough, Select: passthrough },
    "@/lib/spiders": { listSpidersForUser: async () => [] },
    "@/lib/session": { requireUser: async () => ({ id: "user-1" }) },
    "@/lib/constants": { PREMOLT_STATUSES: [], SEX_OPTIONS: [] },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: null }) },
    "@/lib/features/gate": gateStub(db, sessionFor("entitled"), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>("app/(app)/spoods/page.tsx", dependencies);
  let release!: (value: object) => void;
  const searchParams = new Promise<object>((resolve) => { release = resolve; });
  const rendered = page.default({ searchParams });
  await new Promise((resolve) => setImmediate(resolve));
  const started = capture.allGateCalls.length;
  release({});
  await rendered;
  assert.ok(started >= CARE_KEYS.length);
});

// ---------------------------------------------------------------- celebration payload suppression

type CelebrationItem = { key: string; kind: string; message: string };

function loadCelebrations(gate: unknown) {
  const badge = { key: "streak:7", title: "Week", message: "7 care days in a row!", symbol: "x", kind: "badge" };
  const tx = {
    $executeRaw: async () => 1,
    celebratedReward: { deleteMany: async () => ({ count: 0 }), createMany: async () => ({ count: 1 }) },
  };
  const dependencies: Record<string, unknown> = {
    "./maintenance-write": {
      drainCareCompletion: (work: () => Promise<unknown>) => work(),
      guardDerivedMaintenance: async () => {},
    },
    "./reward-data": { readRewardState: async () => ({ streak: { current: 7 }, stories: {} }) },
    "node:crypto": { randomUUID: () => "id" },
    "./db": { prisma: { $transaction: async (work: (t: unknown) => unknown) => work(tx) } },
    "./constellation": { calendarDayKey: () => "2026-10-02" },
    "./care-revalidation-data": { reconcileCareDays: async () => ({ restored: ["2026-10-02"] }) },
    "./constellation-data": { getCareReviewState: async () => ({ timeZone: "UTC", todayKey: "2026-10-02" }), getConstellationData: async () => ({}) },
    "./care-progress": { earnedCelebrations: () => [badge] },
    "./features/gate": gate,
  };
  return loadModule<{
    finishCareCelebrations: (userId: string, baseline: boolean, date?: Date, manual?: boolean) => Promise<CelebrationItem[]>;
  }>("lib/care-celebrations.ts", dependencies);
}

const celebrate = async (gate: unknown) => {
  const result = await loadCelebrations(gate).finishCareCelebrations("user-1", true, undefined, true);
  return Array.from(result).map((item) => item.key);
};
const gatesFor = (states: Record<string, FeatureGateState>) => gateStub(makeDb(states), sessionFor("entitled"), newCapture());
const NO_JOURNEY = { "journey.check_in": "upsell", "journey.streaks.view": "upsell", "journey.badges.view": "upsell" } as const;

test("entitled user keeps the full celebration payload (star and badge)", async () => {
  assert.deepEqual(await celebrate(gatesFor({})), ["care-day:2026-10-02", "streak:7"]);
});

for (const state of ["upsell", "coming-soon"] as const) {
  test(`user without journey keys (${state}) gets an empty celebration payload`, async () => {
    const all = { "journey.check_in": state, "journey.streaks.view": state, "journey.badges.view": state };
    assert.deepEqual(await celebrate(gatesFor(all)), []);
  });
}

test("badge toasts are dropped without journey.badges.view but the star stays", async () => {
  assert.deepEqual(await celebrate(gatesFor({ ...NO_JOURNEY, "journey.check_in": "entitled", "journey.badges.view": "upsell" })), ["care-day:2026-10-02"]);
});

test("star copy needs journey.check_in or journey.streaks.view; badges need journey.badges.view", async () => {
  assert.deepEqual(await celebrate(gatesFor({ ...NO_JOURNEY, "journey.streaks.view": "entitled" })), ["care-day:2026-10-02"]);
  assert.deepEqual(await celebrate(gatesFor({ ...NO_JOURNEY, "journey.badges.view": "entitled" })), ["streak:7"]);
});

test("celebration suppression resolves the three journey keys once per invocation", async () => {
  const capture = newCapture();
  await celebrate(gateStub(makeDb({}), sessionFor("entitled"), capture));
  assert.deepEqual(capture.allGateCalls.map(([, key]) => key).sort(), ["journey.badges.view", "journey.check_in", "journey.streaks.view"]);
});

test("celebration suppression fails safe when gate resolution throws or rejects", async () => {
  assert.deepEqual(await celebrate({ resolveUserGates: () => { throw new Error("gate down"); } }), []);
  assert.deepEqual(await celebrate({ resolveUserGates: async () => { throw new Error("gate down"); } }), []);
});

test("celebration suppression fails safe when every gate lookup errors inside the resolver", async () => {
  const db = new Proxy({}, { get: () => { throw new Error("db down"); } }) as unknown as FeatureGateDb;
  assert.deepEqual(await celebrate(gateStub(db, sessionFor("entitled"), newCapture())), []);
});
