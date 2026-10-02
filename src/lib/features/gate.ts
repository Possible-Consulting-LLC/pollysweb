import type { Prisma, PrismaClient } from "@prisma/client";
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
