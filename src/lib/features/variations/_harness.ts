import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as maintenancePolicy from "../../admin/maintenance-policy";
import {
  resolveUserFeatureGate,
  resolveUserGates,
  withFeatureGate,
  type FeatureGateDb,
  type FeatureGateState,
} from "../gate";

export type Scenario = FeatureGateState | "unauthenticated";

export type Dependencies = Record<string, unknown>;

// Page tests for one category pass a record for just their keys; the other categories a page
// also gates stay entitled so those tests keep asserting only their own feature.
export const PEER_CATEGORY_KEYS = [
  "photo.upload",
  "photo.gallery.view",
  "photo.profile.set",
  "photo.delete",
  "universe.view",
  "journey.check_in",
  "journey.streaks.view",
  "journey.badges.view",
];

export function makeDb(
  states: FeatureGateState | Record<string, FeatureGateState>,
  key?: string,
): FeatureGateDb {
  const byKey: Record<string, FeatureGateState> =
    typeof states === "string"
      ? { [key!]: states }
      : { ...Object.fromEntries(PEER_CATEGORY_KEYS.map((peer) => [peer, "entitled" as const])), ...states };
  const entitledKeys = Object.keys(byKey).filter((featureKey) => byKey[featureKey] === "entitled");
  return {
    feature: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        where.key in byKey ? { key: where.key, active: byKey[where.key] !== "coming-soon" } : null,
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
                { enabled: true, feature: { key: "some.other.feature" } },
                ...entitledKeys.map((featureKey) => ({ enabled: true, feature: { key: featureKey } })),
              ],
            },
          },
        ],
      }),
    },
    siteSettings: { findUnique: async () => ({ featureTelemetrySink: "off" }) },
  } as unknown as FeatureGateDb;
}

export function loadModule<T = Record<string, unknown>>(
  sourcePath: string,
  dependencies: Dependencies,
  globals: Record<string, unknown> = {},
): T {
  const source = ts.transpileModule(
    readFileSync(new URL(`../../../${sourcePath}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(source, {
    exports,
    FormData,
    File,
    console: { error: () => undefined, warn: () => undefined },
    process: { env: {} },
    ...globals,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

export function sessionFor(scenario: Scenario): { id: string; plan: string } | null {
  return scenario === "unauthenticated" ? null : { id: "user-1", plan: "Pro" };
}

export function gateStateFor(scenario: Scenario): FeatureGateState {
  return scenario === "unauthenticated" ? "upsell" : scenario;
}

export type Capture = {
  order: string[];
  redirects: string[];
  /** Care-category page resolutions only; care.test.ts asserts these exactly. */
  gateCalls: Array<[string, string]>;
  /** Every page-level resolution, whatever the category. */
  allGateCalls: Array<[string, string]>;
};

export function newCapture(): Capture {
  return { order: [], redirects: [], gateCalls: [], allGateCalls: [] };
}

export function gateStub(db: FeatureGateDb, sessionUser: { id: string; plan: string } | null, capture: Capture) {
  return {
    withFeatureGate: (key: string, work: () => Promise<unknown>) => {
      capture.order.push(`gate:${key}`);
      return withFeatureGate(key, work, {
        db,
        sessionUser,
        redirectFn: (url: string) => {
          capture.redirects.push(url);
          throw new Error(`redirect:${url}`);
        },
      });
    },
    resolveUserFeatureGate: (userId: string, key: string) => {
      capture.gateCalls.push([userId, key]);
      capture.allGateCalls.push([userId, key]);
      return resolveUserFeatureGate(db, userId, key);
    },
    resolveUserGates: (userId: string | null | undefined, keys: readonly string[]) => {
      if (userId) {
        for (const key of keys) {
          capture.allGateCalls.push([userId, key]);
          if (key.startsWith("care.")) capture.gateCalls.push([userId, key]);
        }
      }
      return resolveUserGates(db, userId, keys);
    },
  };
}

export function mutationBoundaryStub(capture: Capture) {
  return {
    withMutation: async (_ctx: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => {
      capture.order.push("withMutation");
      try {
        return await work();
      } catch (error) {
        if (error instanceof maintenancePolicy.MaintenanceError) return maintenancePolicy.maintenanceFailure();
        throw error;
      }
    },
    recordMutationSuccess: async () => {},
  };
}

export const nextStubs: Dependencies = {
  "next/navigation": {
    redirect: (url: string) => {
      throw new Error(`redirect:${url}`);
    },
    notFound: () => {
      throw new Error("notFound");
    },
  },
  "next/cache": { revalidatePath: () => {} },
  "next/dist/client/components/redirect-error": {
    isRedirectError: (error: Error) => error.message.startsWith("redirect:"),
  },
};

export { maintenancePolicy };
