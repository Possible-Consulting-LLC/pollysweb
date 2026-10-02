import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureGate } from "../../../components/features/feature-gate";
import * as utils from "../../utils";
import * as writeValidation from "../../write-validation";
import type { FeatureGateState } from "../gate";
import {
  PEER_CATEGORY_KEYS,
  gateStateFor,
  gateStub,
  loadModule,
  maintenancePolicy,
  makeDb,
  mutationBoundaryStub,
  newCapture,
  nextStubs,
  sessionFor,
  type Capture,
  type Scenario,
} from "./_harness";

const SPOOD_KEYS = [
  "spood.about.view",
  "spood.about.edit",
  "spood.list.view",
  "spood.story.view",
  "spood.memorialize",
  "spood.memorial.restore",
] as const;
const SETTINGS_KEYS = [
  "settings.profile.manage",
  "settings.theme.customize",
  "settings.password.change",
  "settings.email.change",
  "settings.social.link",
] as const;
const ALL_KEYS: readonly string[] = [...SPOOD_KEYS, ...SETTINGS_KEYS];
const STATES: FeatureGateState[] = ["entitled", "upsell", "coming-soon"];

const escape = (key: string) => key.replace(/\./g, "\\.");
const el = (tag: string, props: Record<string, unknown> = {}) => jsx.jsx(tag as "div", props);
const passthrough = ({ children }: { children?: unknown }) => jsx.jsx("div", { children });
const markup = (node: unknown) => renderToStaticMarkup(node as Parameters<typeof renderToStaticMarkup>[0]);
const has = (html: string, testid: string) => html.includes(`data-testid="${testid}"`);
const link = ({ href, children }: { href: string; children?: unknown }) => jsx.jsx("a", { href, children });

function gatesWith(key: string, state: FeatureGateState): Record<string, FeatureGateState> {
  return { ...Object.fromEntries(ALL_KEYS.map((k) => [k, "entitled"])), [key]: state };
}

function assertGateOutcome(html: string, key: string, state: FeatureGateState) {
  if (state === "upsell") assert.match(html, new RegExp(`href="/features/${escape(key)}"`));
  else assert.doesNotMatch(html, new RegExp(`/features/${escape(key)}`));
  if (state === "coming-soon") assert.match(html, /coming soon/i);
  else assert.doesNotMatch(html, /coming soon/i);
}

test("harness peer-category defaults include every settings and spood key", () => {
  for (const key of ALL_KEYS) assert.ok(PEER_CATEGORY_KEYS.includes(key), key);
});

// ---------------------------------------------------------------- server actions

type Action = (...args: unknown[]) => Promise<unknown>;
type Loaded = { exports: Record<string, Action>; capture: Capture };

function loadAboutAction(scenario: Scenario, states: Record<string, FeatureGateState>): Loaded {
  const capture = newCapture();
  const { order } = capture;
  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/maintenance-write": {
      writableSpiderTransaction: async (_user: string, _spider: string, work: (tx: unknown) => unknown) => {
        order.push("transaction");
        return work({ spider: { update: async () => ({}) } });
      },
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/app/actions/care-shared": {
      getCareWriteUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
      ownedSpider: async () => ({ id: "spider-1", name: "Webster" }),
      revalidateSpider: () => {},
    },
    "@/lib/utils": utils,
    "@/lib/constants": { SEX_OPTIONS: ["Female", "Male", "Unknown"] },
    "@/lib/write-validation": writeValidation,
  };
  return { exports: loadModule("app/actions/about.ts", dependencies), capture };
}

function loadMemorialActions(scenario: Scenario, states: Record<string, FeatureGateState>): Loaded {
  const capture = newCapture();
  const { order } = capture;
  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/maintenance-write": {
      maintenanceTransaction: async () => {
        order.push("transaction");
        return { ok: true, value: { id: "spider-1" } };
      },
      writableSpiderTransaction: async (_user: string, _spider: string, work: (tx: unknown) => unknown) => {
        order.push("transaction");
        return work({ spider: { update: async () => ({}) } });
      },
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/lib/care-celebrations": { baselineCelebrations: async () => [], finishCareCelebrations: async () => [] },
    "fs/promises": { unlink: async () => {} },
    path: {},
    "next/cache": { revalidatePath: () => {} },
    "@/lib/utils": utils,
    "@/lib/history-mutations": {},
    "@/lib/db": { prisma: { spider: { findFirst: async () => ({ id: "spider-1", name: "Webster", memorializedAt: new Date() }) } } },
    "@/lib/uploads": {},
    "@/lib/spider-slots": { runWithSpiderSlot: async (_tx: unknown, _user: string, work: () => unknown) => ({ ok: true, value: await work() }) },
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
      resolveActivityDateTime: async () => new Date(),
    },
    zod: { z },
  };
  return { exports: loadModule("app/actions/care-habitat.ts", dependencies), capture };
}

function loadAuthActions(scenario: Scenario, states: Record<string, FeatureGateState>): Loaded {
  const capture = newCapture();
  const { order } = capture;
  const dependencies: Record<string, unknown> = {
    ...nextStubs,
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/admin/maintenance-access": { guardMaintenance: async () => {}, prepareCredentialChange: async () => {} },
    "@/lib/maintenance-write": {
      maintenanceTransaction: async () => {
        order.push("write");
        return { count: 1 };
      },
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/lib/rate-limit": { allowAction: async () => true, RATE_LIMIT_MESSAGE: "slow down" },
    "@/lib/password-policy": { validatePasswordChange: () => "stop-after-gate" },
    "@/lib/session": {
      requireUser: async () => {
        order.push("user");
        return { id: "user-1", name: "Keeper" };
      },
      getActionUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
    },
    "@/lib/utils": utils,
    "@/lib/write-validation": writeValidation,
    "@/lib/constants": { DEFAULT_SPOOOD_AVATAR_SRC: "/default.png", isDefaultSpoodAvatar: () => true, normalizeTheme: (value: string) => value },
    "@/lib/uploads": {},
    "@/lib/spider-slots": {},
    "@/lib/registration-validation": {},
    "@/lib/auth": {},
    "@/lib/db": {},
    "@/lib/email-delivery": {},
    "@/lib/email-challenge": {},
    "next-auth": { AuthError: Error },
    zod: { z },
  };
  return { exports: loadModule("app/actions/auth.ts", dependencies), capture };
}

function loadEmailChangeAction(scenario: Scenario, states: Record<string, FeatureGateState>): Loaded {
  const capture = newCapture();
  const { order } = capture;
  const dependencies: Record<string, unknown> = {
    ...nextStubs,
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/lib/session": {
      getActionUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
    },
    "@/lib/db": {},
    "@/lib/password-policy": {},
    "@/lib/rate-limit": { allowAction: async () => true, RATE_LIMIT_MESSAGE: "slow down" },
    "@/lib/email-delivery": {},
    "@/lib/email-challenge": {},
    zod: { z },
  };
  return { exports: loadModule("app/actions/email-change.ts", dependencies), capture };
}

function loadDisconnectAction(scenario: Scenario, states: Record<string, FeatureGateState>): Loaded {
  const capture = newCapture();
  const { order } = capture;
  const dependencies: Record<string, unknown> = {
    ...nextStubs,
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/lib/session": {
      getActionUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
    },
    "@/lib/db": {},
    "@/lib/auth": {},
    "@/lib/password-policy": {},
    "@/lib/rate-limit": { allowAction: async () => true, RATE_LIMIT_MESSAGE: "slow down" },
    "@/lib/social-disconnect-policy": {},
    "@/lib/social-disconnect": { disconnectProvider: async () => {}, DisconnectError: class extends Error {} },
  };
  return { exports: loadModule("app/actions/disconnect-provider.ts", dependencies), capture };
}

function loadSocialActions(scenario: Scenario, states: Record<string, FeatureGateState>): Loaded {
  const capture = newCapture();
  const { order } = capture;
  const dependencies: Record<string, unknown> = {
    ...nextStubs,
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(makeDb(states), sessionFor(scenario), capture),
    "@/lib/auth": {
      signIn: async () => {
        order.push("signIn");
      },
      signOut: async () => {},
    },
    "@/lib/session": {
      getActionUser: async () => {
        order.push("user");
        return { id: "user-1" };
      },
    },
    "@/lib/db": { prisma: { account: { findFirst: async () => ({ id: "linked" }) } } },
    "@/lib/social-auth": { configuredSocialProviders: () => ["google"] },
    "@/lib/admin/reauth-store": { clearAdminSocialChallenge: async () => {} },
  };
  return { exports: loadModule("app/actions/social-auth.ts", dependencies, { process: { env: {} } }), capture };
}

const form = (entries: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
};

const ACTIONS: Array<{
  key: string;
  fn: string;
  load: (scenario: Scenario, states: Record<string, FeatureGateState>) => Loaded;
  args: () => unknown[];
}> = [
  { key: "spood.about.edit", fn: "updateSpiderAbout", load: loadAboutAction, args: () => ["spider-1", form({ name: "Webster" })] },
  { key: "spood.memorialize", fn: "memorializeSpider", load: loadMemorialActions, args: () => ["spider-1", form({ passedOn: "2026-10-01" })] },
  { key: "spood.memorial.restore", fn: "restoreMemorializedSpider", load: loadMemorialActions, args: () => ["spider-1", "ctx"] },
  { key: "settings.profile.manage", fn: "updateSettingsAction", load: loadAuthActions, args: () => [form({ name: "Keeper" })] },
  { key: "settings.theme.customize", fn: "updateThemeAction", load: loadAuthActions, args: () => [form({ theme: "midnight" })] },
  { key: "settings.password.change", fn: "updatePasswordAction", load: loadAuthActions, args: () => [undefined, form()] },
  { key: "settings.email.change", fn: "requestEmailChangeAction", load: loadEmailChangeAction, args: () => [undefined, form({ email: "not-an-email" })] },
  { key: "settings.social.link", fn: "disconnectProviderAction", load: loadDisconnectAction, args: () => [undefined, form()] },
  { key: "settings.social.link", fn: "linkSocialProvider", load: loadSocialActions, args: () => [form({ provider: "google" })] },
  { key: "settings.email.change", fn: "reauthenticateForEmailChange", load: loadSocialActions, args: () => [form({ provider: "google" })] },
];

for (const { key, fn, load, args } of ACTIONS) {
  const run = (scenario: Scenario) => {
    const { exports, capture } = load(scenario, { [key]: gateStateFor(scenario) });
    return { call: () => exports[fn](...args()), capture };
  };

  test(`${fn} (${key}): entitled user passes the gate and enters the mutation boundary`, async () => {
    const { call, capture } = run("entitled");
    await call().catch((error: Error) => assert.match(error.message, /^redirect:(?!\/features\/)/));
    assert.deepEqual(capture.order.slice(0, 3), [`gate:${key}`, "withMutation", "user"]);
    assert.ok(capture.redirects.every((url) => !url.startsWith("/features/")), capture.redirects.join());
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

test("updateSettingsAction (settings.profile.manage): an entitled save writes the profile and redirects to saved", async () => {
  const { exports, capture } = loadAuthActions("entitled", { "settings.profile.manage": "entitled" });
  await assert.rejects(exports.updateSettingsAction(form({ name: "Keeper" })), /redirect:\/settings\?saved=1$/);
  assert.ok(capture.order.includes("write"));
});

test("updateThemeAction (settings.theme.customize): an entitled change is written", async () => {
  const { exports, capture } = loadAuthActions("entitled", { "settings.theme.customize": "entitled" });
  assert.equal(((await exports.updateThemeAction(form({ theme: "midnight" }))) as { ok: boolean }).ok, true);
  assert.ok(capture.order.includes("write"));
});

test("memorialize and restore gate independently of each other", async () => {
  const { exports } = loadMemorialActions("entitled", { "spood.memorialize": "entitled", "spood.memorial.restore": "upsell" });
  assert.equal(((await exports.memorializeSpider("spider-1", form({ passedOn: "2026-10-01" }))) as { ok: boolean }).ok, true);
  await assert.rejects(exports.restoreMemorializedSpider("spider-1", "ctx"), /redirect:\/features\/spood\.memorial\.restore$/);
});

test("social link and email-change gate independently on the shared social-auth module", async () => {
  const { exports } = loadSocialActions("entitled", { "settings.social.link": "entitled", "settings.email.change": "upsell" });
  await exports.linkSocialProvider(form({ provider: "google" }));
  await assert.rejects(exports.reauthenticateForEmailChange(form({ provider: "google" })), /redirect:\/features\/settings\.email\.change$/);
});

// ---------------------------------------------------------------- rememberUserTimeZone (settings.profile.manage)

function loadTimeZoneHelper(state: FeatureGateState, storedZone: string | null) {
  const capture = newCapture();
  const writes: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    "@/lib/maintenance-write": {
      maintenanceTransaction: async (work: (tx: unknown) => unknown) => {
        writes.push(await work({ user: { update: async (args: unknown) => args } }));
      },
    },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/db": { prisma: { user: { findUnique: async () => ({ timezone: storedZone }) } } },
    "@/lib/session": {},
    "@/lib/rate-limit": {},
    "@/lib/write-validation": writeValidation,
    "@/lib/spider-write-policy": {},
    "@/lib/utils": utils,
    "@/lib/features/gate": gateStub(makeDb({ "settings.profile.manage": state }), sessionFor("entitled"), capture),
  };
  const exports = loadModule<{ rememberUserTimeZone: (userId: string, data: FormData) => Promise<void> }>(
    "app/actions/care-shared.ts",
    dependencies,
  );
  return { exports, writes, capture };
}

for (const state of STATES) {
  test(`rememberUserTimeZone (settings.profile.manage): ${state} user ${state === "entitled" ? "has" : "does not have"} the zone persisted`, async () => {
    const { exports, writes, capture } = loadTimeZoneHelper(state, null);
    await exports.rememberUserTimeZone("user-1", form({ clientTimeZone: "America/Los_Angeles" }));
    assert.equal(writes.length, state === "entitled" ? 1 : 0);
    assert.deepEqual(capture.gateCalls, [["user-1", "settings.profile.manage"]]);
  });
}

test("rememberUserTimeZone only consults the gate when it is about to write a zone", async () => {
  const stored = loadTimeZoneHelper("upsell", "UTC");
  await stored.exports.rememberUserTimeZone("user-1", form({ clientTimeZone: "America/Los_Angeles" }));
  assert.deepEqual(stored.capture.gateCalls, []);
  const absent = loadTimeZoneHelper("upsell", null);
  await absent.exports.rememberUserTimeZone("user-1", form());
  assert.deepEqual(absent.capture.gateCalls, []);
});

// ---------------------------------------------------------------- follow-up 2: add-spood photo upload (photo.upload)

function loadCreateSpider(photoState: FeatureGateState) {
  const capture = newCapture();
  const { order } = capture;
  const db = makeDb({ "spood.create": "entitled", "photo.upload": photoState });
  const dependencies: Record<string, unknown> = {
    ...nextStubs,
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/admin/maintenance-access": { guardMaintenance: async () => {}, prepareCredentialChange: async () => {} },
    "@/lib/maintenance-write": {
      maintenanceTransaction: async () => {
        order.push("transaction");
        return { ok: true, value: { id: "spider-1" } };
      },
    },
    "@/lib/mutation-boundary": mutationBoundaryStub(capture),
    "@/lib/features/gate": gateStub(db, sessionFor("entitled"), capture),
    "@/lib/rate-limit": { allowAction: async () => true, RATE_LIMIT_MESSAGE: "slow down" },
    "@/lib/stripe": { getBillingProfile: async () => ({ canAddSpider: true, freeLimit: 1 }) },
    "@/lib/care-celebrations": { baselineCelebrations: async () => [], finishCareCelebrations: async () => [] },
    "@/lib/session": { getActionUser: async () => ({ id: "user-1" }), requireUser: async () => ({ id: "user-1" }) },
    "@/lib/write-validation": {
      boundedText: (value: unknown) => String(value ?? "").trim(),
      optionalText: (value: unknown) => String(value ?? "").trim() || undefined,
    },
    "@/lib/constants": { DEFAULT_SPOOOD_AVATAR_SRC: "/default.png", isDefaultSpoodAvatar: () => true },
    "@/lib/utils": { parseLocalDateInput: (value: string) => new Date(value) },
    "@/lib/uploads": {
      saveImageUpload: async () => {
        order.push("upload");
        return { url: "/uploaded.jpg" };
      },
      cleanupUnattachedUpload: async () => {},
    },
    "@/lib/spider-slots": {},
    "@/lib/password-policy": {},
    "@/lib/registration-validation": {},
    "@/lib/auth": {},
    "@/lib/db": {},
    "@/lib/email-delivery": {},
    "@/lib/email-challenge": {},
    "next-auth": { AuthError: Error },
    zod: { z: {} },
  };
  const exports = loadModule<{
    createSpiderAction: (prev: undefined, data: FormData) => Promise<{ error?: string; redirectTo?: string }>;
  }>("app/actions/auth.ts", dependencies);
  return {
    capture,
    create: (withPhoto: boolean) => {
      const data = form({ name: "Charlotte" });
      if (withPhoto) data.set("photo", new File(["x"], "portrait.png", { type: "image/png" }));
      return exports.createSpiderAction(undefined, data);
    },
  };
}

test("createSpiderAction: an entitled photo.upload user's welcome photo is saved", async () => {
  const { create, capture } = loadCreateSpider("entitled");
  const result = await create(true);
  assert.equal(result.redirectTo, "/spoods/spider-1");
  assert.ok(capture.order.includes("upload"));
});

for (const state of ["upsell", "coming-soon"] as const) {
  test(`createSpiderAction: a ${state} photo.upload user still gets a spood, but the upload is never saved`, async () => {
    const { create, capture } = loadCreateSpider(state);
    const result = await create(true);
    assert.equal(result.redirectTo, "/spoods/spider-1?photo=skipped");
    assert.ok(!capture.order.includes("upload"));
    assert.ok(capture.order.includes("transaction"), "the spood itself is still created");
  });
}

test("createSpiderAction: photo.upload is only consulted when a file was actually submitted", async () => {
  const { create, capture } = loadCreateSpider("upsell");
  const result = await create(false);
  assert.equal(result.redirectTo, "/spoods/spider-1");
  assert.deepEqual(capture.gateCalls, []);
});

function loadAvatarPicker() {
  const dependencies: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsx,
    "@/components/features/feature-gate": { FeatureGate },
    "@/lib/constants": {
      DEFAULT_SPOOOD_AVATAR_SRC: "/a.svg",
      DEFAULT_SPOOOD_AVATARS: [{ id: "a", label: "Aria", src: "/a.svg" }],
    },
    "@/lib/utils": { cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") },
    "@/lib/prepare-photo": { PHOTO_HELP: "Up to 10 MB." },
    "./prepared-photo-input": { PreparedPhotoInput: () => el("input", { "data-testid": "photo-input", type: "file" }) },
  };
  return loadModule<{ SpoodAvatarPicker: React.ComponentType<Record<string, unknown>> }>(
    "components/spoods/avatar-picker.tsx",
    dependencies,
  ).SpoodAvatarPicker;
}

for (const state of STATES) {
  test(`avatar picker (photo.upload): upload controls are ${state === "entitled" ? "shown" : "hidden"} when ${state}`, () => {
    const Picker = loadAvatarPicker();
    const html = markup(React.createElement(Picker, { uploadGate: state }));
    assert.equal(has(html, "photo-input"), state === "entitled");
    assert.equal(html.includes("Upload a photo"), state === "entitled");
    assert.match(html, /Use Aria portrait/, "default portraits stay available");
    assertGateOutcome(html, "photo.upload", state);
  });
}

test("add-spood form hands its photo.upload state to the avatar picker", () => {
  const seen: unknown[] = [];
  const dependencies: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsx,
    "next/navigation": { useRouter: () => ({ push: () => {}, refresh: () => {} }) },
    "@/components/mutation-form": { MutationForm: ({ children }: { children?: unknown }) => jsx.jsx("form", { children }) },
    "@/components/mutation-context": { MutationContextInput: () => null },
    "@/components/constellation/celebrations": { celebrateCare: () => {} },
    "@/app/actions/auth": { createSpiderAction: async () => ({}) },
    "@/components/spoods/avatar-picker": {
      SpoodAvatarPicker: (props: { uploadGate: unknown }) => {
        seen.push(props.uploadGate);
        return null;
      },
    },
    "@/components/spoods/species-fields": { SpeciesFields: () => null },
    "@/components/spoods/life-stage-field": { LifeStageField: () => null },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/field": { Field: passthrough, Input: "input", Select: "select", Textarea: "textarea" },
    "@/lib/constants": { ENCLOSURE_TYPES: [], SEX_OPTIONS: [] },
    "@/lib/utils": { localTodayInputValue: () => "2026-10-02" },
    "@/lib/upload-limits": { getPhotoSizeError: () => null },
  };
  const { AddSpoodForm } = loadModule<{ AddSpoodForm: React.ComponentType<Record<string, unknown>> }>(
    "components/spoods/add-spood-form.tsx",
    dependencies,
  );
  for (const state of STATES) markup(React.createElement(AddSpoodForm, { photoUploadGate: state }));
  assert.deepEqual(seen, STATES);
});

function loadNewPage(photoState: FeatureGateState) {
  const capture = newCapture();
  const db = makeDb({ "spood.create": "entitled", "photo.upload": photoState });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": link,
    "@/components/layout/nav": { AppHeader: () => el("h1") },
    "@/components/spoods/add-spood-form": {
      AddSpoodForm: ({ photoUploadGate }: { photoUploadGate: string }) =>
        el("form", { "data-testid": "add-spood-form", "data-photo-gate": photoUploadGate }),
    },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": { Card: passthrough },
    "@/components/features/feature-gate": { FeatureGate },
    "@/lib/billing": { FREE_SPIDER_LIMIT: 1, PLAN_PRICES: { monthly: { amountLabel: "$3" }, yearly: { amountLabel: "$30" } } },
    "@/lib/stripe": { getBillingProfile: async () => ({ canAddSpider: true, spiderCount: 0, memorialCount: 0 }) },
    "@/lib/session": { requireUser: async () => ({ id: "user-1" }) },
    "@/lib/features/gate": gateStub(db, sessionFor("entitled"), capture),
  };
  const page = loadModule<{ default: () => Promise<unknown> }>("app/(app)/spoods/new/page.tsx", dependencies);
  return async () => markup(await page.default());
}

for (const state of STATES) {
  test(`spoods/new page: photo.upload ${state} reaches the add form`, async () => {
    const html = await loadNewPage(state)();
    assert.match(html, new RegExp(`data-photo-gate="${state}"`));
  });
}

// ---------------------------------------------------------------- follow-up 1: housekeeping quick-log (housekeeping.log)

const CARE_KEYS = [
  "care.feed.log",
  "care.hydrate.log",
  "care.molt.log",
  "care.observe.log",
  "care.play.log",
  "care.body_condition.log",
  "care.premolt.manage",
  "care.status.view",
];

function loadSpoodCard() {
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": link,
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/care-status-grid": { CareStatusGrid: () => el("div") },
    "@/components/spoods/quick-log": {
      QuickLogButtons: ({ actions }: { actions: string[] }) =>
        el("div", { "data-testid": "quick-log", "data-actions": actions.join(",") }),
    },
    "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": { Card: passthrough, StatusPill: ({ status }: { status: string }) => el("span", { children: status }) },
    "@/lib/care": { friendlyNeedCopy: () => "needs care" },
    "@/lib/utils": { parseHydrationMethods: () => [] },
  };
  return loadModule<{
    CARE_FEATURE_KEYS: readonly string[];
    SpoodCareCard: (props: Record<string, unknown>) => unknown;
    SpoodCareDetails: (props: Record<string, unknown>) => unknown;
    SpoodIdentity: (props: Record<string, unknown>) => unknown;
  }>("components/spoods/spood-card.tsx", dependencies);
}

const SPIDER = {
  id: "spider-1",
  name: "Webster",
  sex: "Female",
  commonName: "Tarantula",
  species: "Grammostola",
  instar: "I3",
  status: "Normal",
  memorializedAt: null as Date | null,
  passedOn: null,
  memorialNote: null,
  profilePhoto: null,
  notes: null,
  source: null,
  enclosure: { name: "Terrarium" },
  feedings: [],
  mistings: [],
  photos: [],
};
const VIEW = {
  spider: SPIDER,
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

const careGates = (extra: Record<string, FeatureGateState> = {}) => ({
  ...Object.fromEntries(CARE_KEYS.map((key) => [key, "entitled"])),
  ...extra,
});

for (const state of STATES) {
  test(`quick-log housekeeping (housekeeping.log): ${state}`, () => {
    const { SpoodCareDetails } = loadSpoodCard();
    const html = markup(
      SpoodCareDetails({ view: VIEW, gates: careGates({ "housekeeping.log": state }), showStatus: false }),
    );
    const actions = /data-actions="([^"]*)"/.exec(html)?.[1].split(",") ?? [];
    assert.equal(actions.includes("housekeeping"), state === "entitled", html);
    for (const other of ["feed", "hydrate", "molt", "note", "play"]) assert.ok(actions.includes(other), `${other}: ${html}`);
    assertGateOutcome(html, "housekeeping.log", state);
  });
}

test("quick-log housekeeping: callers that never resolve housekeeping.log keep the button open", () => {
  const { SpoodCareDetails } = loadSpoodCard();
  const html = markup(SpoodCareDetails({ view: VIEW, gates: careGates(), showStatus: false }));
  assert.match(html, /data-actions="[^"]*housekeeping/);
});

test("quick-log housekeeping: a locked housekeeping action renders only its notice when it is the sole action", () => {
  const { SpoodCareDetails } = loadSpoodCard();
  const html = markup(
    SpoodCareDetails({
      view: VIEW,
      gates: careGates({ "housekeeping.log": "upsell" }),
      showStatus: false,
      actions: ["housekeeping"],
    }),
  );
  assert.doesNotMatch(html, /data-testid="quick-log"/);
  assert.match(html, /href="\/features\/housekeeping\.log"/);
});

// ---------------------------------------------------------------- spood identity details (spood.about.view)

test("spood identity hides sex, species and life stage unless the profile details may be viewed", () => {
  const { SpoodIdentity } = loadSpoodCard();
  const shown = markup(SpoodIdentity({ view: VIEW }));
  assert.match(shown, /Female · Tarantula · I3/);
  const hidden = markup(SpoodIdentity({ view: VIEW, showProfileDetails: false }));
  assert.doesNotMatch(hidden, /Female|Tarantula|I3/);
  assert.match(hidden, /Webster/);
});

function loadHomePage(states: Record<string, FeatureGateState>) {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": link,
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/layout/nav": { AppHeader: ({ title }: { title: string }) => el("h1", { children: title }) },
    "@/components/spoods/spood-card": loadSpoodCard(),
    "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": {
      Card: passthrough,
      StatusPill: ({ status }: { status: string }) => el("span", { children: status }),
      EmptyState: ({ title }: { title: string }) => el("div", { children: title }),
      SectionHeader: ({ title }: { title: string }) => el("h2", { children: title }),
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
      listSpidersForUser: async () => [VIEW],
    },
    "@/lib/utils": {
      daysBetween: () => 3,
      formatDateTimeInZone: () => "now",
      resolveDisplayTimeZone: () => "UTC",
    },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: "spider-1" }) },
    "@/lib/session": { requireUser: async () => ({ id: "user-1" }) },
    "@/lib/db": { prisma: {} },
    "@/lib/features/gate": gateStub(db, sessionFor("entitled"), capture),
  };
  const page = loadModule<{ default: () => Promise<unknown> }>("app/(app)/home/page.tsx", dependencies);
  return { capture, render: async () => markup(await page.default()) };
}

for (const state of STATES) {
  test(`home page card: spood.about.view is ${state}`, async () => {
    const page = loadHomePage({ ...gatesWith("spood.about.view", state), ...careGates(), "journey.streaks.view": "entitled" });
    const html = await page.render();
    const entitled = state === "entitled";
    assert.match(html, /Needs attention/);
    assert.match(html, /href="\/spoods\/spider-1">Profile</, "the home care card itself renders");
    assert.ok(page.capture.allGateCalls.some(([user, key]) => user === "user-1" && key === "spood.about.view"));
    assert.match(html, /Webster/, "the spood stays listed on the home card");
    assert.equal(/Female · Tarantula · I3/.test(html), entitled);
    if (!entitled) assert.doesNotMatch(html, /Female|Tarantula|I3/);
  });
}

// ---------------------------------------------------------------- spood profile page

function loadProfilePage(
  states: Record<string, FeatureGateState>,
  scenario: Scenario = "entitled",
  options: { memorialized?: boolean; proAccess?: boolean; firstSpiderId?: string } = {},
) {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const stub = (testid: string) => () => el("div", { "data-testid": testid });
  const view = {
    ...VIEW,
    spider: { ...SPIDER, memorializedAt: options.memorialized ? new Date("2026-09-01T00:00:00Z") : null },
  };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": link,
    "next/navigation": { notFound: () => { throw new Error("notFound"); } },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/spood-card": {
      CARE_FEATURE_KEYS: [],
      GatedQuickLogButtons: ({ gates }: { gates: Record<string, string> }) =>
        el("div", { "data-testid": "quick-log", "data-housekeeping": gates["housekeeping.log"] }),
    },
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
    "@/lib/spiders": { getSpiderCare: async () => view },
    "@/lib/care": { isPremoltLike: () => false },
    "@/lib/spider-write-policy": {
      getSpiderWriteState: async () => ({ proAccess: options.proAccess ?? true, firstSpiderId: options.firstSpiderId ?? "spider-1" }),
    },
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

test("spood profile page resolves every spood gate for the signed-in user", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"));
  await page.render();
  const asked = page.capture.allGateCalls.filter(([, key]) => key.startsWith("spood."));
  assert.deepEqual(asked.map(([user]) => user), asked.map(() => "user-1"));
  assert.deepEqual(
    asked.map(([, key]) => key).sort(),
    ["spood.about.edit", "spood.about.view", "spood.memorial.restore", "spood.memorialize"],
  );
});

test("spood profile page: a user without an id sees upsells and never hits the gate resolver", async () => {
  const page = loadProfilePage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.match(html, /href="\/features\/spood\.about\.view"/);
  assert.ok(!has(html, "about-form") && !has(html, "memorial-panel"));
  assert.doesNotMatch(html, /Tarantula/);
});

for (const state of STATES) {
  test(`spood profile page: spood.about.view is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("spood.about.view", state)).render();
    const entitled = state === "entitled";
    assert.equal(has(html, "about-form"), entitled);
    assert.equal(html.includes("Tarantula"), entitled, "the header subtitle and About details are withheld");
    assert.doesNotMatch(html, /Life stage/);
    assertGateOutcome(html, "spood.about.view", state);
  });

  test(`spood profile page: spood.about.edit is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("spood.about.edit", state)).render();
    const entitled = state === "entitled";
    assert.equal(has(html, "about-form"), entitled);
    assert.equal(html.includes("Life stage"), !entitled, "read-only details replace the form");
    assertGateOutcome(html, "spood.about.edit", state);
  });

  test(`spood profile page: spood.memorialize is ${state}`, async () => {
    const html = await loadProfilePage(gatesWith("spood.memorialize", state)).render();
    assert.equal(has(html, "memorial-panel"), state === "entitled");
    assertGateOutcome(html, "spood.memorialize", state);
  });

  test(`spood profile page: spood.memorial.restore is ${state} for a memorialized spood`, async () => {
    const html = await loadProfilePage(gatesWith("spood.memorial.restore", state), "entitled", { memorialized: true }).render();
    assert.equal(has(html, "memorial-panel"), state === "entitled");
    assertGateOutcome(html, "spood.memorial.restore", state);
  });

  test(`spood profile page: housekeeping.log ${state} reaches the quick-log row`, async () => {
    const html = await loadProfilePage({ ...gatesWith("none", "entitled"), "housekeeping.log": state }).render();
    assert.match(html, new RegExp(`data-housekeeping="${state}"`));
  });
}

test("spood profile page: memorialize and restore controls are absent for the wrong memorial state", async () => {
  const active = await loadProfilePage(gatesWith("none", "entitled")).render();
  assert.doesNotMatch(active, /spood\.memorial\.restore/);
  const memorialized = await loadProfilePage(gatesWith("spood.memorialize", "upsell"), "entitled", { memorialized: true }).render();
  assert.doesNotMatch(memorialized, /spood\.memorialize"/);
});

test("spood profile page: a read-only spood shows no about-edit or memorial upsell notices", async () => {
  const states = { ...gatesWith("none", "entitled"), "spood.about.edit": "upsell", "spood.memorialize": "upsell" } as Record<string, FeatureGateState>;
  const html = await loadProfilePage(states, "entitled", { proAccess: false, firstSpiderId: "other-spider" }).render();
  assert.doesNotMatch(html, /\/features\/spood\.about\.edit/);
  assert.doesNotMatch(html, /\/features\/spood\.memorialize/);
});

// ---------------------------------------------------------------- spoods list page

function loadListPage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const fetched = { list: 0 };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": link,
    "@/components/layout/nav": { AppHeader: ({ title }: { title: string }) => el("h1", { children: title }) },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/spood-card": {
      CARE_FEATURE_KEYS: CARE_KEYS,
      SpoodIdentity: ({ showProfileDetails }: { showProfileDetails: boolean }) =>
        el("div", { "data-testid": "identity", "data-details": String(showProfileDetails) }),
      SpoodCareDetails: ({ gates }: { gates: Record<string, string> }) =>
        el("div", { "data-testid": "details", "data-housekeeping": gates["housekeeping.log"] }),
    },
    "@/components/spoods/spood-search": { SpoodSearch: () => el("input", { "data-testid": "search" }) },
    "@/components/spoods/spood-accordion": {
      SpoodAccordion: ({ items }: { items: Array<{ identity: unknown; content: unknown }> }) =>
        jsx.jsx("div", { children: items.map((item) => [item.identity, item.content]) }),
    },
    "@/components/ui/button": { Button: passthrough, buttonVariants: () => "btn" },
    "@/components/ui/card": { EmptyState: () => el("div"), SectionHeader: () => el("h2") },
    "@/components/ui/field": { Field: passthrough, Select: passthrough },
    "@/lib/spiders": {
      listSpidersForUser: async () => {
        fetched.list++;
        return [VIEW];
      },
    },
    "@/lib/session": { requireUser: async () => ({ id: scenario === "unauthenticated" ? null : "user-1" }) },
    "@/lib/constants": { PREMOLT_STATUSES: [], SEX_OPTIONS: [] },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: "spider-1" }) },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>("app/(app)/spoods/page.tsx", dependencies);
  return {
    capture,
    fetched,
    render: async () => markup(await page.default({ searchParams: Promise.resolve({}) })),
  };
}

test("spoods list page resolves the list, about, and housekeeping gates for the signed-in user", async () => {
  const page = loadListPage(gatesWith("none", "entitled"));
  await page.render();
  const asked = page.capture.allGateCalls.map(([, key]) => key);
  for (const key of ["spood.list.view", "spood.about.view", "housekeeping.log"]) assert.ok(asked.includes(key), key);
  assert.ok(page.capture.allGateCalls.every(([user]) => user === "user-1"));
});

test("spoods list page: a user without an id sees the list upsell and the collection is never read", async () => {
  const page = loadListPage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.equal(page.fetched.list, 0);
  assert.match(html, /href="\/features\/spood\.list\.view"/);
});

for (const state of STATES) {
  test(`spoods list page: spood.list.view is ${state}`, async () => {
    const page = loadListPage(gatesWith("spood.list.view", state));
    const html = await page.render();
    const entitled = state === "entitled";
    assert.equal(has(html, "identity"), entitled);
    assert.equal(has(html, "search"), entitled);
    assert.equal(page.fetched.list > 0, entitled, "the collection is not read unless entitled");
    assertGateOutcome(html, "spood.list.view", state);
  });

  test(`spoods list page: spood.about.view is ${state}`, async () => {
    const html = await loadListPage(gatesWith("spood.about.view", state)).render();
    assert.match(html, new RegExp(`data-details="${state === "entitled"}"`));
    assert.ok(has(html, "identity"), "the collection itself stays visible");
    assertGateOutcome(html, "spood.about.view", state);
  });

  test(`spoods list page: housekeeping.log ${state} reaches the quick-log row`, async () => {
    const html = await loadListPage({ ...gatesWith("none", "entitled"), "housekeeping.log": state }).render();
    assert.match(html, new RegExp(`data-housekeeping="${state}"`));
  });
}

// ---------------------------------------------------------------- story page (spood.story.view + lightbox follow-up)

const STORY_SPIDER = {
  id: "spider-1",
  name: "Webster",
  profilePhoto: null,
  acquisitionDate: null,
  source: null,
  molts: [],
  observations: [],
  feedings: [
    {
      id: "f1",
      date: new Date("2026-10-01T12:00:00Z"),
      quantity: 1,
      preyType: "cricket",
      outcome: "Ate",
      photoUrl: "/meal.jpg",
      preySize: null,
      notes: null,
    },
  ],
  mistings: [],
  bodyConditions: [],
  enclosure: null,
  photos: [],
};

function loadStoryPage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const fetched = { story: 0 };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": link,
    "next/navigation": { notFound: () => { throw new Error("notFound"); } },
    "@/lib/constants": { observationLabel: (kind: string) => kind },
    "@/components/spoods/spood-image": { SpoodImage: () => el("img") },
    "@/components/activity/activity-editor": {
      ActivityEditorRow: () => el("div", { "data-testid": "event-editor" }),
    },
    "@/components/features/feature-gate": { FeatureGate },
    "@/components/spoods/photo-gallery": {
      PhotoOpenButton: ({ children }: { children?: unknown }) => jsx.jsx("div", { "data-testid": "photo-open", children }),
    },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": { Card: passthrough },
    "@/lib/utils": { ...utils, resolveDisplayTimeZone: async () => "UTC" },
    "@/lib/spiders": {
      getUserDefaults: async () => ({ timezone: "UTC" }),
      getSpiderStory: async () => {
        fetched.story++;
        return { includeAcquisition: false, nextCursor: null, spider: STORY_SPIDER };
      },
    },
    "@/lib/session": { requireUser: async () => ({ id: scenario === "unauthenticated" ? null : "user-1" }) },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true, firstSpiderId: "spider-1" }) },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>("app/(app)/spoods/[id]/story/page.tsx", dependencies);
  return {
    capture,
    fetched,
    render: async () =>
      markup(await page.default({ params: Promise.resolve({ id: "spider-1" }), searchParams: Promise.resolve({}) })),
  };
}

test("story page resolves the story, gallery, and inline-edit gates in one call", async () => {
  const page = loadStoryPage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(
    page.capture.allGateCalls.map(([, key]) => key).sort(),
    ["activity.delete", "activity.edit", "photo.gallery.view", "spood.story.view"],
  );
});

for (const state of STATES) {
  test(`story page: spood.story.view is ${state}`, async () => {
    const page = loadStoryPage(gatesWith("spood.story.view", state));
    const html = await page.render();
    const entitled = state === "entitled";
    assert.equal(has(html, "event-editor"), entitled);
    assert.equal(page.fetched.story > 0, entitled, "the story is not read unless entitled");
    assertGateOutcome(html, "spood.story.view", state);
  });

  test(`story page: photo.gallery.view ${state} controls the lightbox button`, async () => {
    const html = await loadStoryPage(gatesWith("photo.gallery.view", state)).render();
    assert.equal(has(html, "photo-open"), state === "entitled");
    assert.ok(has(html, "event-editor"), "the story itself stays visible");
    assertGateOutcome(html, "photo.gallery.view", state);
  });
}

test("story page: a user without an id gets the story upsell and never hits the gate resolver", async () => {
  const page = loadStoryPage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  assert.equal(page.fetched.story, 0);
  assert.match(html, /href="\/features\/spood\.story\.view"/);
  assert.ok(!has(html, "photo-open"));
});

// ---------------------------------------------------------------- settings page

function loadSettingsPage(states: Record<string, FeatureGateState>, scenario: Scenario = "entitled") {
  const capture: Capture = newCapture();
  const db = makeDb(states);
  const stub = (testid: string) => () => el("div", { "data-testid": testid });
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": link,
    "@/components/mutation-form": { MutationForm: ({ children }: { children?: unknown }) => jsx.jsx("form", { "data-testid": "profile-form", children }) },
    "@/components/mutation-context": { MutationContextInput: () => null },
    "@/lib/admin/actor": { requireAdminActor: async () => { throw new Error("not an admin"); } },
    "@/components/settings/disconnect-provider-form": { DisconnectProviderForm: stub("disconnect-form") },
    "@/lib/social-disconnect-policy": { remainingSignInAvailable: () => true, recentSocialAuthentication: () => true },
    "@/app/actions/auth": { logoutAction: () => {}, updateSettingsAction: () => {}, updateThemeAction: () => {} },
    "@/components/layout/nav": { AppHeader: () => el("h1") },
    "@/components/settings/password-form": { PasswordForm: stub("password-form") },
    "@/components/auth/social-buttons": { SocialButtons: stub("social-buttons") },
    "@/app/actions/social-auth": { linkSocialProvider: () => {} },
    "@/components/settings/theme-toggle": { ThemeToggle: stub("theme-toggle") },
    "@/components/ui/button": { Button: passthrough, buttonVariants: () => "btn" },
    "@/components/ui/card": { Card: passthrough, SectionHeader: ({ title }: { title: string }) => el("h2", { children: title }) },
    "@/components/ui/field": { Field: passthrough, Input: "input" },
    "@/components/ui/datetime-field": { TimezoneSelect: () => el("select") },
    "@/lib/billing": { FREE_SPIDER_LIMIT: 1 },
    "@/lib/billing-policy": { needsBillingRecovery: () => false },
    "@/lib/constants": { normalizeTheme: (value: string) => value },
    "@/lib/stripe": {
      getBillingProfile: async () => ({ plan: "free", spiderCount: 1, memorialCount: 0, isDemo: false }),
    },
    "@/lib/spiders": {
      getUserDefaults: async () => ({ name: "Keeper", email: "keeper@example.test", timezone: "UTC", theme: "cosmic", feedDefaultDays: 3, mistDefaultDays: 1 }),
    },
    "@/lib/session": {
      requireUserContext: async () => ({
        user: { id: scenario === "unauthenticated" ? null : "user-1", emailChangeReauthAt: undefined },
        identity: { testSessionId: null },
      }),
    },
    "@/lib/db": {
      prisma: {
        user: { findUnique: async () => ({ passwordHash: "hash", emailVerified: new Date() }) },
        account: { findMany: async () => [{ provider: "google" }] },
      },
    },
    "@/lib/social-auth": { configuredSocialProviders: () => ["google", "facebook"] },
    "@/lib/social-error": { socialErrorMessage: () => null },
    "@/components/auth/email-verification-notice": { EmailVerificationNotice: stub("verification-notice") },
    "@/components/settings/email-change-form": { EmailChangeForm: stub("email-form") },
    "@/lib/email-verification": { legacyVerificationDeadline: () => null },
    "@/components/features/feature-gate": { FeatureGate },
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
  };
  const page = loadModule<{ default: (props: unknown) => Promise<unknown> }>(
    "app/(app)/settings/page.tsx",
    dependencies,
    { process: { env: {} }, Intl },
  );
  return {
    capture,
    render: async () => markup(await page.default({ searchParams: Promise.resolve({}) })),
  };
}

const SETTINGS_CONTROLS: Array<{ key: (typeof SETTINGS_KEYS)[number]; control: string }> = [
  { key: "settings.profile.manage", control: "profile-form" },
  { key: "settings.theme.customize", control: "theme-toggle" },
  { key: "settings.password.change", control: "password-form" },
  { key: "settings.email.change", control: "email-form" },
  { key: "settings.social.link", control: "social-buttons" },
];

test("settings page resolves all five settings gates in one call for the signed-in user", async () => {
  const page = loadSettingsPage(gatesWith("none", "entitled"));
  await page.render();
  assert.deepEqual(page.capture.allGateCalls.map(([user]) => user), SETTINGS_KEYS.map(() => "user-1"));
  assert.deepEqual(page.capture.allGateCalls.map(([, key]) => key).sort(), [...SETTINGS_KEYS].sort());
});

test("settings page: an entitled user keeps every control and sees no gate notices", async () => {
  const html = await loadSettingsPage(gatesWith("none", "entitled")).render();
  for (const { control } of SETTINGS_CONTROLS) assert.ok(has(html, control), control);
  assert.ok(has(html, "disconnect-form"));
  assert.doesNotMatch(html, /\/features\//);
  assert.doesNotMatch(html, /coming soon/i);
});

test("settings page: a user without an id gets upsells for every settings control", async () => {
  const page = loadSettingsPage(gatesWith("none", "entitled"), "unauthenticated");
  const html = await page.render();
  assert.deepEqual(page.capture.allGateCalls, []);
  for (const { key, control } of SETTINGS_CONTROLS) {
    assert.ok(!has(html, control), control);
    assert.match(html, new RegExp(`href="/features/${escape(key)}"`));
  }
});

for (const { key, control } of SETTINGS_CONTROLS) {
  for (const state of STATES) {
    test(`settings page: ${key} is ${state}`, async () => {
      const html = await loadSettingsPage(gatesWith(key, state)).render();
      assert.equal(has(html, control), state === "entitled");
      for (const other of SETTINGS_CONTROLS.filter((peer) => peer.key !== key)) {
        assert.ok(has(html, other.control), `${other.control} must stay available`);
      }
      assertGateOutcome(html, key, state);
    });
  }
}

test("settings page: social.link gates the disconnect control together with the connect buttons", async () => {
  const html = await loadSettingsPage(gatesWith("settings.social.link", "upsell")).render();
  assert.ok(!has(html, "disconnect-form"));
  assert.ok(!has(html, "social-buttons"));
});

test("settings page: the theme toggle stays independent of the profile form in both directions", async () => {
  const noProfile = await loadSettingsPage(gatesWith("settings.profile.manage", "upsell")).render();
  assert.ok(has(noProfile, "theme-toggle") && !has(noProfile, "profile-form"));
  const noTheme = await loadSettingsPage(gatesWith("settings.theme.customize", "upsell")).render();
  assert.ok(has(noTheme, "profile-form") && !has(noTheme, "theme-toggle"));
  const neither = await loadSettingsPage({
    ...gatesWith("settings.profile.manage", "upsell"),
    "settings.theme.customize": "upsell",
  }).render();
  assert.ok(!has(neither, "profile-form") && !has(neither, "theme-toggle"));
});
