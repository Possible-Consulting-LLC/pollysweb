import assert from "node:assert/strict";
import { test } from "node:test";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureGate } from "../../../components/features/feature-gate";
import type { FeatureGateState } from "../gate";
import {
  gateStateFor,
  gateStub,
  loadModule,
  maintenancePolicy,
  makeDb,
  mutationBoundaryStub,
  nextStubs,
  newCapture,
  sessionFor,
  type Scenario,
} from "./_harness";

const KEY = "spood.create";
const ALLOWANCE_ERROR =
  "Free accounts include 1 active spood. Upgrade to Pro to add more — or memorialize a passed spood to free a slot.";

function loadAction(scenario: Scenario, billing: { canAddSpider: boolean; freeLimit: number }) {
  const capture = newCapture();
  const { order, redirects } = capture;
  const db = makeDb(gateStateFor(scenario), KEY);

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
    "@/lib/features/gate": gateStub(db, sessionFor(scenario), capture),
    "@/lib/rate-limit": {
      allowAction: async () => {
        order.push("rate-limit");
        return true;
      },
      RATE_LIMIT_MESSAGE: "slow down",
    },
    "@/lib/stripe": {
      getBillingProfile: async () => {
        order.push("billing");
        return billing;
      },
    },
    "@/lib/care-celebrations": {
      baselineCelebrations: async () => [],
      finishCareCelebrations: async () => [],
    },
    "@/lib/session": { getActionUser: async () => ({ id: "user-1" }), requireUser: async () => ({ id: "user-1" }) },
    "@/lib/write-validation": {
      boundedText: (value: unknown) => String(value ?? "").trim(),
      optionalText: (value: unknown) => String(value ?? "").trim() || undefined,
    },
    "@/lib/constants": { DEFAULT_SPOOOD_AVATAR_SRC: "/default.png", isDefaultSpoodAvatar: () => true },
    "@/lib/utils": { parseLocalDateInput: (value: string) => new Date(value) },
    "@/lib/uploads": {},
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
    createSpiderAction: (
      prev: undefined,
      form: FormData,
    ) => Promise<{ error?: string; redirectTo?: string; message?: string }>;
  }>("app/actions/auth.ts", dependencies);
  const form = new FormData();
  form.set("name", "Charlotte");
  return { run: () => exports.createSpiderAction(undefined, form), order, redirects };
}

test("createSpiderAction: entitled user passes the gate and enters the create path", async () => {
  const { run, order, redirects } = loadAction("entitled", { canAddSpider: true, freeLimit: 1 });
  const result = await run();
  assert.equal(result.redirectTo, "/spoods/spider-1");
  assert.equal(result.message, "Charlotte has joined your collection!");
  assert.deepEqual(redirects, []);
  assert.deepEqual(order, ["gate:spood.create", "withMutation", "rate-limit", "billing", "transaction"]);
});

test("createSpiderAction: entitled but allowance-full user gets the existing allowance error (after the gate)", async () => {
  const { run, order, redirects } = loadAction("entitled", { canAddSpider: false, freeLimit: 1 });
  const result = await run();
  assert.equal(result.error, ALLOWANCE_ERROR);
  assert.deepEqual(redirects, []);
  assert.deepEqual(order, ["gate:spood.create", "withMutation", "rate-limit", "billing"]);
});

test("createSpiderAction: not-entitled user is redirected to the feature upsell before any mutation work", async () => {
  const { run, order, redirects } = loadAction("upsell", { canAddSpider: false, freeLimit: 1 });
  await assert.rejects(run(), /redirect:\/features\/spood\.create$/);
  assert.deepEqual(redirects, ["/features/spood.create"]);
  assert.deepEqual(order, ["gate:spood.create"]);
});

test("createSpiderAction: coming-soon feature redirects with ?state=coming-soon before any mutation work", async () => {
  const { run, order, redirects } = loadAction("coming-soon", { canAddSpider: true, freeLimit: 1 });
  await assert.rejects(run(), /redirect:\/features\/spood\.create\?state=coming-soon$/);
  assert.deepEqual(redirects, ["/features/spood.create?state=coming-soon"]);
  assert.deepEqual(order, ["gate:spood.create"]);
});

test("createSpiderAction: unauthenticated session gets the upsell redirect before any mutation work", async () => {
  const { run, order, redirects } = loadAction("unauthenticated", { canAddSpider: true, freeLimit: 1 });
  await assert.rejects(run(), /redirect:\/features\/spood\.create$/);
  assert.deepEqual(redirects, ["/features/spood.create"]);
  assert.deepEqual(order, ["gate:spood.create"]);
});

function loadNewPage(state: Scenario, billing: { canAddSpider: boolean }) {
  const capture = newCapture();
  const billingCalls: string[] = [];
  const db = makeDb(gateStateFor(state), KEY);
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children: unknown }) => jsx.jsx("a", { href, children }),
    "@/components/layout/nav": { AppHeader: ({ title }: { title: string }) => jsx.jsx("h1", { children: title }) },
    "@/components/spoods/add-spood-form": { AddSpoodForm: () => jsx.jsx("form", { "data-testid": "add-spood-form" }) },
    "@/components/ui/button": { buttonVariants: () => "btn" },
    "@/components/ui/card": { Card: ({ children }: { children: unknown }) => jsx.jsx("div", { children }) },
    "@/lib/billing": { FREE_SPIDER_LIMIT: 1, PLAN_PRICES: { monthly: { amountLabel: "$3" }, yearly: { amountLabel: "$30" } } },
    "@/lib/stripe": {
      getBillingProfile: async (userId: string) => {
        billingCalls.push(userId);
        return { ...billing, spiderCount: 1, memorialCount: 0 };
      },
    },
    "@/lib/session": {
      requireUser: async () => (state === "unauthenticated" ? { id: null } : { id: "user-1" }),
    },
    "@/lib/features/gate": gateStub(db, sessionFor(state), capture),
    "@/components/features/feature-gate": { FeatureGate },
  };
  const exports = loadModule<{ default: () => Promise<unknown> }>("app/(app)/spoods/new/page.tsx", dependencies);
  return {
    render: async () =>
      renderToStaticMarkup((await exports.default()) as Parameters<typeof renderToStaticMarkup>[0]),
    gateCalls: capture.gateCalls,
    billingCalls,
  };
}

test("spoods/new page: entitled user with a free slot renders the add form", async () => {
  const page = loadNewPage("entitled", { canAddSpider: true });
  const html = await page.render();
  assert.match(html, /data-testid="add-spood-form"/);
  assert.deepEqual(page.gateCalls, [["user-1", KEY]]);
});

test("spoods/new page: entitled but allowance-full user still sees the existing allowance card", async () => {
  const page = loadNewPage("entitled", { canAddSpider: false });
  const html = await page.render();
  assert.match(html, /Free plan includes 1 active spood/);
  assert.match(html, /href="\/upgrade"/);
  assert.doesNotMatch(html, /add-spood-form/);
  assert.doesNotMatch(html, /\/features\/spood\.create/);
});

test("spoods/new page: not-entitled user sees the inline upsell, not the form or allowance copy", async () => {
  const page = loadNewPage("upsell", { canAddSpider: true });
  const html = await page.render();
  assert.match(html, /href="\/features\/spood\.create"/);
  assert.doesNotMatch(html, /add-spood-form/);
  assert.doesNotMatch(html, /Free plan includes/);
});

test("spoods/new page: coming-soon feature renders the placeholder, not the form", async () => {
  const page = loadNewPage("coming-soon", { canAddSpider: true });
  const html = await page.render();
  assert.match(html, /coming soon/i);
  assert.doesNotMatch(html, /add-spood-form/);
});

test("spoods/new page: a user without an id is treated as upsell and never hits the gate resolver", async () => {
  const page = loadNewPage("unauthenticated", { canAddSpider: true });
  const html = await page.render();
  assert.match(html, /href="\/features\/spood\.create"/);
  assert.doesNotMatch(html, /add-spood-form/);
  assert.deepEqual(page.gateCalls, []);
  assert.deepEqual(page.billingCalls, []);
});

function loadHubScene(sessionUser: { id?: string | null } | null, state: FeatureGateState) {
  const capture = newCapture();
  const db = makeDb(state, KEY);
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children: unknown }) => jsx.jsx("a", { href, children }),
    "@/components/features/feature-gate": { FeatureGate },
    "@/lib/session": { getSessionUser: async () => sessionUser },
    "@/lib/features/gate": gateStub(db, null, capture),
  };
  const exports = loadModule<{
    HubScene: (props?: { addSpoodState?: FeatureGateState }) => Promise<unknown>;
  }>("components/home/hub-scene.tsx", dependencies);
  return {
    gateCalls: capture.gateCalls,
    render: async (props?: { addSpoodState?: FeatureGateState }) =>
      renderToStaticMarkup((await exports.HubScene(props)) as Parameters<typeof renderToStaticMarkup>[0]),
  };
}

test("hub scene: entitled user keeps the Add a Spood link", async () => {
  const hub = loadHubScene({ id: "user-1" }, "entitled");
  const html = await hub.render();
  assert.match(html, /href="\/spoods\/new"/);
  assert.deepEqual(hub.gateCalls, [["user-1", KEY]]);
});

test("hub scene: not-entitled user sees the upsell instead of the Add a Spood link", async () => {
  const html = await loadHubScene({ id: "user-1" }, "upsell").render();
  assert.doesNotMatch(html, /href="\/spoods\/new"/);
  assert.match(html, /href="\/features\/spood\.create"/);
});

test("hub scene: coming-soon feature shows the placeholder instead of the link", async () => {
  const html = await loadHubScene({ id: "user-1" }, "coming-soon").render();
  assert.doesNotMatch(html, /href="\/spoods\/new"/);
  assert.match(html, /coming soon/i);
});

test("hub scene: signed-out viewer is treated as upsell without resolving the gate", async () => {
  const hub = loadHubScene(null, "entitled");
  const html = await hub.render();
  assert.doesNotMatch(html, /href="\/spoods\/new"/);
  assert.match(html, /href="\/features\/spood\.create"/);
  assert.deepEqual(hub.gateCalls, []);
});

test("hub scene: an explicit addSpoodState prop skips session resolution", async () => {
  const hub = loadHubScene(null, "upsell");
  const html = await hub.render({ addSpoodState: "entitled" });
  assert.match(html, /href="\/spoods\/new"/);
  assert.deepEqual(hub.gateCalls, []);
});
