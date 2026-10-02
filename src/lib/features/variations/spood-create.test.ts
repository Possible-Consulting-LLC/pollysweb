import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as maintenancePolicy from "../../admin/maintenance-policy";
import { FeatureGate } from "../../../components/features/feature-gate";
import {
  resolveUserFeatureGate,
  withFeatureGate,
  type FeatureGateDb,
  type FeatureGateState,
} from "../gate";

const KEY = "spood.create";
const ALLOWANCE_ERROR =
  "Free accounts include 1 active spood. Upgrade to Pro to add more — or memorialize a passed spood to free a slot.";

type Scenario = FeatureGateState | "unauthenticated";

function makeDb(state: FeatureGateState): FeatureGateDb {
  const translationKey = state === "entitled" ? KEY : "some.other.feature";
  return {
    feature: { findUnique: async () => ({ key: KEY, active: state !== "coming-soon" }) },
    user: {
      findUnique: async () => ({
        plan: "free",
        subscriptions: [
          {
            status: "ACTIVE",
            expiresAt: null,
            plan: {
              name: "Pro",
              featureTranslations: [{ enabled: true, feature: { key: translationKey } }],
            },
          },
        ],
      }),
    },
    siteSettings: { findUnique: async () => ({ featureTelemetrySink: "off" }) },
  } as unknown as FeatureGateDb;
}

function loadAction(scenario: Scenario, billing: { canAddSpider: boolean; freeLimit: number }) {
  const source = ts.transpileModule(
    readFileSync(new URL("../../../app/actions/auth.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
  ).outputText;

  const order: string[] = [];
  const redirects: string[] = [];
  const db = makeDb(scenario === "unauthenticated" ? "upsell" : scenario);
  const sessionUser = scenario === "unauthenticated" ? null : { id: "user-1", plan: "Pro" };

  const dependencies: Record<string, unknown> = {
    "@/lib/admin/maintenance-policy": maintenancePolicy,
    "@/lib/admin/maintenance-access": { guardMaintenance: async () => {}, prepareCredentialChange: async () => {} },
    "@/lib/maintenance-write": {
      maintenanceTransaction: async () => {
        order.push("transaction");
        return { ok: true, value: { id: "spider-1" } };
      },
    },
    "@/lib/mutation-boundary": {
      withMutation: async (_ctx: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => {
        order.push("withMutation");
        try {
          return await work();
        } catch (error) {
          if (error instanceof maintenancePolicy.MaintenanceError) return maintenancePolicy.maintenanceFailure();
          throw error;
        }
      },
      recordMutationSuccess: async () => {},
    },
    "@/lib/features/gate": {
      withFeatureGate: (key: string, work: () => Promise<unknown>) => {
        order.push(`gate:${key}`);
        return withFeatureGate(key, work, {
          db,
          sessionUser,
          redirectFn: (url: string) => {
            redirects.push(url);
            throw new Error(`redirect:${url}`);
          },
        });
      },
    },
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
    "next/navigation": { redirect: (url: string) => { throw new Error(`redirect:${url}`); } },
    "next/cache": { revalidatePath: () => {} },
    "next/dist/client/components/redirect-error": {
      isRedirectError: (error: Error) => error.message.startsWith("redirect:"),
    },
    zod: { z: {} },
  };

  const exports: Record<string, unknown> = {};
  runInNewContext(source, {
    exports,
    FormData,
    File,
    console: { error: () => undefined, warn: () => undefined },
    process: { env: {} },
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });

  const action = exports.createSpiderAction as (
    prev: undefined,
    form: FormData,
  ) => Promise<{ error?: string; redirectTo?: string; message?: string }>;
  const form = new FormData();
  form.set("name", "Charlotte");
  return { run: () => action(undefined, form), order, redirects };
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

function loadNewPage(state: FeatureGateState | "unauthenticated", billing: { canAddSpider: boolean }) {
  const source = ts.transpileModule(
    readFileSync(new URL("../../../app/(app)/spoods/new/page.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;

  const gateCalls: Array<[string, string]> = [];
  const billingCalls: string[] = [];
  const db = makeDb(state === "unauthenticated" ? "upsell" : state);
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
    "@/lib/features/gate": {
      resolveUserFeatureGate: (userId: string, key: string) => {
        gateCalls.push([userId, key]);
        return resolveUserFeatureGate(db, userId, key);
      },
    },
    "@/components/features/feature-gate": { FeatureGate },
  };
  const exports: { default?: () => Promise<unknown> } = {};
  runInNewContext(source, {
    exports,
    process: { env: {} },
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return {
    render: async () =>
      renderToStaticMarkup((await exports.default!()) as Parameters<typeof renderToStaticMarkup>[0]),
    gateCalls,
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
  const source = ts.transpileModule(
    readFileSync(new URL("../../../components/home/hub-scene.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const gateCalls: Array<[string, string]> = [];
  const db = makeDb(state);
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": ({ href, children }: { href: string; children: unknown }) => jsx.jsx("a", { href, children }),
    "@/components/features/feature-gate": { FeatureGate },
    "@/lib/session": { getSessionUser: async () => sessionUser },
    "@/lib/features/gate": {
      resolveUserFeatureGate: (userId: string, key: string) => {
        gateCalls.push([userId, key]);
        return resolveUserFeatureGate(db, userId, key);
      },
    },
  };
  const exports: {
    HubScene?: (props?: { addSpoodState?: FeatureGateState }) => Promise<unknown>;
    HubSceneView?: (props: { addSpoodState: FeatureGateState }) => unknown;
  } = {};
  runInNewContext(source, {
    exports,
    process: { env: {} },
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return {
    gateCalls,
    render: async (props?: { addSpoodState?: FeatureGateState }) =>
      renderToStaticMarkup((await exports.HubScene!(props)) as Parameters<typeof renderToStaticMarkup>[0]),
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
