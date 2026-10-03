import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/db";
import { MaintenanceError } from "@/lib/admin/maintenance-policy";
import { TestContextError } from "@/lib/admin/test-session";
import {
  isEffectiveSubscription,
  loadLegacyPlanSource,
  resolveEffectiveEntitlements,
  type EntitlementUser,
  type LegacyPlanSource,
} from "@/lib/admin/legacy-entitlements";
import { FEATURE_REGISTRY } from "./registry";

export type FeatureGateState = "entitled" | "upsell" | "coming-soon";

export function resolveFeatureGate(input: { active: boolean; entitled: boolean }): FeatureGateState {
  if (!input.active) return "coming-soon";
  return input.entitled ? "entitled" : "upsell";
}

export type FeatureGateDb = Pick<
  Prisma.TransactionClient,
  "feature" | "user" | "plan" | "siteSettings"
>;

export type GateEvent = {
  feature: string;
  outcome: "shown" | "used" | "upsell" | "coming-soon";
  plan: string | null;
};

type SinkTransport = (sink: "posthog", event: GateEvent) => Promise<void> | void;

export function resolveTelemetrySinkFromRow(sink: string | null | undefined): "off" | "posthog" {
  return sink === "posthog" ? "posthog" : "off";
}

type ResolvedEntitlements = { entitled: ReadonlySet<string>; planName: string | null };

/** What one gate resolution learned; a decorated action reuses it for nested resolutions. */
type GateSnapshot = {
  db: FeatureGateDb;
  userId: string;
  /** null when the user row is missing (every key reads coming-soon). */
  user: ResolvedEntitlements | null;
  activeByKey: ReadonlyMap<string, boolean>;
};

const gateScope = new AsyncLocalStorage<GateSnapshot>();

const REGISTRY_KEYS: readonly string[] = FEATURE_REGISTRY.map((feature) => feature.key);

const allComingSoon = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((key) => [key, "coming-soon"])) as Record<K, FeatureGateState>;

async function loadFeatureActivity(db: FeatureGateDb, keys: readonly string[]): Promise<Map<string, boolean>> {
  const features = await db.feature.findMany({ where: { key: { in: [...keys] } } });
  return new Map(features.map((feature) => [feature.key, feature.active]));
}

async function loadUserRow(db: FeatureGateDb, userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        include: {
          plan: {
            include: {
              featureTranslations: { include: { feature: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });
}

// The effective subscription is checked first: legacy plans are only read (and only required)
// for users without one, so a missing legacy plan never locks out subscribers.
async function entitlementsFor(db: FeatureGateDb, user: unknown): Promise<ResolvedEntitlements> {
  const row = user as EntitlementUser;
  const now = new Date();
  const hasSubscription = row.subscriptions.some((subscription) => isEffectiveSubscription(subscription, now));
  const legacyPlans =
    !hasSubscription && typeof db.plan?.findMany === "function"
      ? await loadLegacyPlanSource(db as unknown as PrismaClient | Prisma.TransactionClient)
      : ({} as LegacyPlanSource);
  const entitlements = resolveEffectiveEntitlements(row, legacyPlans, now);
  return { entitled: new Set(entitlements.featureKeys), planName: entitlements.planName };
}

// Constant query count however many keys: one feature read, one user read (with subscriptions),
// and a legacy-plan read only for users without an effective subscription.
async function resolveSnapshot(db: FeatureGateDb, userId: string, keys: readonly string[]): Promise<GateSnapshot> {
  const [activeByKey, user] = await Promise.all([loadFeatureActivity(db, keys), loadUserRow(db, userId)]);
  if (!user) return { db, userId, user: null, activeByKey };
  const anyActive = keys.some((key) => activeByKey.get(key) === true);
  return { db, userId, user: anyActive ? await entitlementsFor(db, user) : null, activeByKey };
}

function statesFrom<K extends string>(snapshot: GateSnapshot, keys: readonly K[]): Record<K, FeatureGateState> {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      snapshot.user
        ? resolveFeatureGate({ active: snapshot.activeByKey.get(key) === true, entitled: snapshot.user.entitled.has(key) })
        : "coming-soon",
    ]),
  ) as Record<K, FeatureGateState>;
}

/** Inside a decorated action the decorator's resolution is reused; only unseen feature rows are read. */
async function resolveWithinScope<K extends string>(
  db: FeatureGateDb,
  userId: string,
  keys: readonly K[],
): Promise<Record<K, FeatureGateState> | null> {
  const scope = gateScope.getStore();
  if (!scope || scope.db !== db || scope.userId !== userId) return null;
  const missing = keys.filter((key) => !scope.activeByKey.has(key));
  if (missing.length === 0) return statesFrom(scope, keys);
  const fetched = await loadFeatureActivity(db, missing);
  const activeByKey = new Map(scope.activeByKey);
  for (const key of missing) activeByKey.set(key, fetched.get(key) === true);
  return statesFrom({ ...scope, activeByKey }, keys);
}

async function resolveStates<K extends string>(
  db: FeatureGateDb,
  userId: string,
  keys: readonly K[],
): Promise<{ states: Record<K, FeatureGateState>; planName: string | null; scoped: boolean }> {
  const scoped = await resolveWithinScope(db, userId, keys);
  if (scoped) return { states: scoped, planName: gateScope.getStore()?.user?.planName ?? null, scoped: true };
  const snapshot = await resolveSnapshot(db, userId, keys);
  return { states: statesFrom(snapshot, keys), planName: snapshot.user?.planName ?? null, scoped: false };
}

export async function resolveUserFeatureGate(
  db: FeatureGateDb,
  userId: string,
  featureKey: string,
): Promise<FeatureGateState>;
export async function resolveUserFeatureGate(
  userId: string,
  featureKey: string,
): Promise<FeatureGateState>;
export async function resolveUserFeatureGate(
  dbOrUserId: FeatureGateDb | string,
  userIdOrFeatureKey: string,
  maybeFeatureKey?: string,
): Promise<FeatureGateState> {
  const [db, userId, featureKey] =
    typeof dbOrUserId === "string"
      ? [prisma as FeatureGateDb, dbOrUserId, userIdOrFeatureKey]
      : [dbOrUserId, userIdOrFeatureKey, maybeFeatureKey!];

  try {
    return (await resolveStates(db, userId, [featureKey])).states[featureKey];
  } catch (error) {
    console.error("feature-gate", featureKey, error);
    return "coming-soon";
  }
}

const SHOWN_OUTCOME: Record<FeatureGateState, GateEvent["outcome"]> = {
  entitled: "shown",
  upsell: "upsell",
  "coming-soon": "coming-soon",
};

function fireAndForget(work: () => Promise<void> | void): void {
  try {
    const pending = work();
    if (pending && typeof pending.then === "function") {
      pending.then(undefined, (error: unknown) => console.error("gate-telemetry", error));
    }
  } catch (error) {
    console.error("gate-telemetry", error);
  }
}

/** Page/inline resolution: one batched read, one batched telemetry emission (fire-and-forget). */
export async function resolveUserGates<K extends string>(
  db: FeatureGateDb,
  userId: string | null | undefined,
  keys: readonly K[],
): Promise<Record<K, FeatureGateState>>;
export async function resolveUserGates<K extends string>(
  userId: string | null | undefined,
  keys: readonly K[],
): Promise<Record<K, FeatureGateState>>;
export async function resolveUserGates<K extends string>(
  dbOrUserId: FeatureGateDb | string | null | undefined,
  userIdOrKeys: string | null | undefined | readonly K[],
  maybeKeys?: readonly K[],
): Promise<Record<K, FeatureGateState>> {
  const [db, userId, keys] = Array.isArray(userIdOrKeys)
    ? [prisma as FeatureGateDb, dbOrUserId as string | null | undefined, userIdOrKeys as readonly K[]]
    : [dbOrUserId as FeatureGateDb, userIdOrKeys as string | null | undefined, maybeKeys!];

  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) return {} as Record<K, FeatureGateState>;

  let states: Record<K, FeatureGateState>;
  let planName: string | null = null;
  try {
    if (!userId) {
      // Signed out: released features advertise, unreleased ones read coming-soon.
      const activeByKey = await loadFeatureActivity(db, uniqueKeys);
      states = Object.fromEntries(
        uniqueKeys.map((key) => [key, activeByKey.get(key) === true ? "upsell" : "coming-soon"]),
      ) as Record<K, FeatureGateState>;
    } else {
      const resolved = await resolveStates(db, userId, uniqueKeys);
      // Resolutions inside a decorated action are not page impressions; the decorator reports "used".
      if (resolved.scoped) return resolved.states;
      states = resolved.states;
      planName = resolved.planName;
    }
  } catch (error) {
    console.error("feature-gate", "batch", error);
    return allComingSoon(uniqueKeys);
  }

  fireAndForget(() =>
    emitGateEvents(
      db,
      uniqueKeys.map((key) => ({ feature: key, outcome: SHOWN_OUTCOME[states[key]], plan: planName })),
    ),
  );
  return states;
}

let registeredTransport: SinkTransport | undefined;

/** The seam a sink module (e.g. the deferred PostHog module) plugs into; undefined unregisters. */
export function registerGateTelemetryTransport(transport: SinkTransport | undefined): void {
  registeredTransport = transport;
}

/** Reads the admin-selected sink once and forwards every event to it. Never throws. */
export async function emitGateEvents(
  db: Pick<Prisma.TransactionClient, "siteSettings">,
  events: readonly GateEvent[],
  sinkTransport?: SinkTransport,
): Promise<void> {
  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: 1 },
      select: { featureTelemetrySink: true },
    });
    const sink = resolveTelemetrySinkFromRow(settings?.featureTelemetrySink);
    const transport = sinkTransport ?? registeredTransport;
    if (sink === "off" || !transport) return;
    for (const event of events) await transport(sink, event);
  } catch (error) {
    console.error("gate-telemetry", error);
  }
}

export async function emitGateEvent(
  db: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">,
  event: GateEvent,
  sinkTransport?: SinkTransport,
): Promise<void>;
export async function emitGateEvent(
  event: GateEvent,
): Promise<void>;
export async function emitGateEvent(
  dbOrEvent: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings"> | GateEvent,
  maybeEvent?: GateEvent,
  sinkTransport?: SinkTransport,
): Promise<void> {
  const isEvent = (val: unknown): val is GateEvent =>
    typeof val === "object" && val !== null && "feature" in val && typeof (val as GateEvent).feature === "string";

  const [db, event] = isEvent(dbOrEvent)
    ? [prisma, dbOrEvent]
    : [dbOrEvent, maybeEvent!];
  await emitGateEvents(db, [event], sinkTransport);
}

export type FeatureGateOptions = {
  db?: FeatureGateDb;
  redirectFn?: (url: string) => void | never;
  sessionUser?:
    | { id?: string | null }
    | null
    | (() => Promise<{ id?: string | null } | null>);
  sinkTransport?: SinkTransport;
  emitEvent?: (
    db: FeatureGateDb,
    event: GateEvent,
    sinkTransport?: SinkTransport,
  ) => Promise<void> | void;
};

export async function withFeatureGate<T>(
  featureKey: string,
  work: () => Promise<T>,
  options?: FeatureGateOptions,
): Promise<T> {
  const db = options?.db ?? prisma;
  const redirectFn = options?.redirectFn ?? redirect;
  const emit = options?.emitEvent ?? emitGateEvent;
  // Telemetry never blocks the action: it is started, not awaited.
  const report = (outcome: GateEvent["outcome"], plan: string | null) =>
    fireAndForget(() => emit(db, { feature: featureKey, outcome, plan }, options?.sinkTransport));

  let user: { id?: string | null } | null = null;
  try {
    user =
      options?.sessionUser !== undefined
        ? typeof options.sessionUser === "function"
          ? await options.sessionUser()
          : options.sessionUser
        : await (async () => {
            const { getActionUser } = await import("@/lib/session");
            return await getActionUser();
          })();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    // The action's own mutation boundary returns its typed failure, so the keeper's edits stay put.
    if (error instanceof MaintenanceError || error instanceof TestContextError) return work();
    console.error("feature-gate", featureKey, error);
    user = null;
  }

  if (!user?.id) {
    report("upsell", null);
    redirectFn(`/features/${featureKey}`);
    return undefined as unknown as T;
  }

  let state: FeatureGateState = "coming-soon";
  let snapshot: GateSnapshot | null = null;
  try {
    // Every registered key is read up front so nested resolutions inside the action cost no queries.
    snapshot = await resolveSnapshot(db, user.id, [...new Set([featureKey, ...REGISTRY_KEYS])]);
    state = statesFrom(snapshot, [featureKey])[featureKey];
  } catch (error) {
    console.error("feature-gate", featureKey, error);
    state = "coming-soon";
  }
  const plan = snapshot?.user?.planName ?? null;

  if (state === "entitled") {
    report("used", plan);
    return snapshot ? gateScope.run(snapshot, work) : work();
  }

  if (state === "upsell") {
    report("upsell", plan);
    redirectFn(`/features/${featureKey}`);
    return undefined as unknown as T;
  }

  report("coming-soon", plan);
  redirectFn(`/features/${featureKey}?state=coming-soon`);
  return undefined as unknown as T;
}
