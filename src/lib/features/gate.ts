import type { Prisma, PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  loadLegacyPlanSource,
  resolveEffectiveEntitlements,
  type EntitlementUser,
  type LegacyPlanSource,
} from "@/lib/admin/legacy-entitlements";

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

export function resolveTelemetrySinkFromRow(sink: string | null | undefined): "off" | "posthog" {
  return sink === "posthog" ? "posthog" : "off";
}

export async function resolveUserFeatureGate(
  db: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">,
  userId: string,
  featureKey: string,
): Promise<FeatureGateState>;
export async function resolveUserFeatureGate(
  userId: string,
  featureKey: string,
): Promise<FeatureGateState>;
export async function resolveUserFeatureGate(
  dbOrUserId: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings"> | string,
  userIdOrFeatureKey: string,
  maybeFeatureKey?: string,
): Promise<FeatureGateState> {
  const [db, userId, featureKey] =
    typeof dbOrUserId === "string"
      ? [prisma, dbOrUserId, userIdOrFeatureKey]
      : [dbOrUserId, userIdOrFeatureKey, maybeFeatureKey!];

  try {
    const feature = await db.feature.findUnique({
      where: { key: featureKey },
    });
    if (!feature || !feature.active) {
      return "coming-soon";
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          include: {
            plan: {
              include: {
                featureTranslations: {
                  include: {
                    feature: { select: { key: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!user) {
      return "coming-soon";
    }

    const legacyPlans = typeof db.plan?.findMany === "function"
      ? await loadLegacyPlanSource(db as unknown as PrismaClient | Prisma.TransactionClient)
      : ({} as LegacyPlanSource);

    const entitlements = resolveEffectiveEntitlements(
      user as unknown as EntitlementUser,
      legacyPlans,
    );

    const entitled = entitlements.featureKeys.includes(featureKey);
    return resolveFeatureGate({ active: feature.active, entitled });
  } catch {
    return "coming-soon";
  }
}

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
  if (!userId) {
    return Object.fromEntries(uniqueKeys.map((key) => [key, "upsell"])) as Record<K, FeatureGateState>;
  }
  if (uniqueKeys.length === 0) return {} as Record<K, FeatureGateState>;

  try {
    return await resolveBatchedGates(db, userId, uniqueKeys);
  } catch {
    // The batch could not be read as a whole; resolve per key so one bad lookup cannot take down the rest.
    const entries = await Promise.all(
      uniqueKeys.map(async (key) => {
        try {
          return [key, await resolveUserFeatureGate(db, userId, key)] as const;
        } catch {
          return [key, "coming-soon"] as const;
        }
      }),
    );
    return Object.fromEntries(entries) as Record<K, FeatureGateState>;
  }
}

// Constant query count however many keys: one feature.findMany, one user read (with subscriptions),
// and one legacy-plan read. Per-key states are then derived in memory.
async function resolveBatchedGates<K extends string>(
  db: FeatureGateDb,
  userId: string,
  keys: readonly K[],
): Promise<Record<K, FeatureGateState>> {
  const [features, user] = await Promise.all([
    db.feature.findMany({ where: { key: { in: [...keys] } } }),
    db.user.findUnique({
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
    }),
  ]);
  const activeKeys = new Set(features.filter((feature) => feature.active).map((feature) => feature.key));

  if (!user || activeKeys.size === 0) {
    return Object.fromEntries(keys.map((key) => [key, "coming-soon"])) as Record<K, FeatureGateState>;
  }

  const legacyPlans = typeof db.plan?.findMany === "function"
    ? await loadLegacyPlanSource(db as unknown as PrismaClient | Prisma.TransactionClient)
    : ({} as LegacyPlanSource);
  const entitled = new Set(resolveEffectiveEntitlements(user as unknown as EntitlementUser, legacyPlans).featureKeys);

  return Object.fromEntries(
    keys.map((key) => [key, resolveFeatureGate({ active: activeKeys.has(key), entitled: entitled.has(key) })]),
  ) as Record<K, FeatureGateState>;
}

export async function emitGateEvent(
  db: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">,
  event: GateEvent,
  sinkTransport?: (sink: "posthog", event: GateEvent) => Promise<void> | void,
): Promise<void>;
export async function emitGateEvent(
  event: GateEvent,
): Promise<void>;
export async function emitGateEvent(
  dbOrEvent: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings"> | GateEvent,
  maybeEvent?: GateEvent,
  sinkTransport?: (sink: "posthog", event: GateEvent) => Promise<void> | void,
): Promise<void> {
  const isEvent = (val: unknown): val is GateEvent =>
    typeof val === "object" && val !== null && "feature" in val && typeof (val as GateEvent).feature === "string";

  const [db, event] = isEvent(dbOrEvent)
    ? [prisma, dbOrEvent]
    : [dbOrEvent as Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">, maybeEvent!];

  try {
    const settings = await db.siteSettings.findUnique({
      where: { id: 1 },
      select: { featureTelemetrySink: true },
    });
    const sink = resolveTelemetrySinkFromRow(settings?.featureTelemetrySink);
    if (sink === "off") {
      return;
    }
    if (sink === "posthog") {
      if (sinkTransport) {
        await sinkTransport(sink, event);
      }
      return;
    }
  } catch (error) {
    console.error("gate-telemetry", error);
  }
}

export type FeatureGateOptions = {
  db?: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">;
  redirectFn?: (url: string) => void | never;
  sessionUser?:
    | { id?: string | null; plan?: string | null }
    | null
    | (() => Promise<{ id?: string | null; plan?: string | null } | null>);
  plan?: string | null;
  sinkTransport?: (sink: "posthog", event: GateEvent) => Promise<void> | void;
  emitEvent?: (
    db: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">,
    event: GateEvent,
    sinkTransport?: (sink: "posthog", event: GateEvent) => Promise<void> | void,
  ) => Promise<void> | void;
  resolveGate?: (
    db: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">,
    userId: string,
    featureKey: string,
  ) => Promise<FeatureGateState>;
};

export async function withFeatureGate<T>(
  featureKey: string,
  work: () => Promise<T>,
  options?: FeatureGateOptions,
): Promise<T> {
  const db = options?.db ?? prisma;
  const redirectFn = options?.redirectFn ?? redirect;
  const emit = options?.emitEvent ?? emitGateEvent;
  const resolver = options?.resolveGate ?? resolveUserFeatureGate;

  let user: { id?: string | null; plan?: string | null } | null = null;
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
  } catch {
    user = null;
  }

  if (!user?.id) {
    try {
      await emit(
        db,
        { feature: featureKey, outcome: "upsell", plan: null },
        options?.sinkTransport,
      );
    } catch {
      // safe fallback on telemetry failure
    }
    redirectFn(`/features/${featureKey}`);
    return undefined as unknown as T;
  }

  let state: FeatureGateState = "coming-soon";
  try {
    state = await resolver(db, user.id, featureKey);
  } catch {
    state = "coming-soon";
  }

  const plan =
    options?.plan !== undefined
      ? options.plan
      : (user as { plan?: string | null })?.plan ?? null;

  if (state === "entitled") {
    try {
      await emit(
        db,
        { feature: featureKey, outcome: "used", plan },
        options?.sinkTransport,
      );
    } catch {
      // safe fallback on telemetry failure
    }
    return await work();
  }

  if (state === "upsell") {
    try {
      await emit(
        db,
        { feature: featureKey, outcome: "upsell", plan },
        options?.sinkTransport,
      );
    } catch {
      // safe fallback on telemetry failure
    }
    redirectFn(`/features/${featureKey}`);
    return undefined as unknown as T;
  }

  // state === "coming-soon"
  try {
    await emit(
      db,
      { feature: featureKey, outcome: "coming-soon", plan },
      options?.sinkTransport,
    );
  } catch {
    // safe fallback on telemetry failure
  }
  redirectFn(`/features/${featureKey}?state=coming-soon`);
  return undefined as unknown as T;
}
