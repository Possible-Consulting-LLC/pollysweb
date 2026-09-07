import { prisma } from "@/lib/db";
import {
  deriveCareStatus,
  daysSince,
  isSuccessfulFeeding,
  type CareInputs,
} from "@/lib/care";
import type { CareStatus } from "@/lib/constants";
import type {
  BodyConditionEvent,
  FeedingEvent,
  MistingEvent,
  MoltEvent,
  ObservationEvent,
  Spider,
  User,
} from "@prisma/client";

export type SpiderWithRelations = Spider & {
  feedings: FeedingEvent[];
  mistings: MistingEvent[];
  molts: MoltEvent[];
  observations: ObservationEvent[];
  bodyConditions: BodyConditionEvent[];
  enclosure: {
    id: string;
    name: string | null;
    type: string | null;
    dimensions: string | null;
    photo: string | null;
    notes: string | null;
    setupDate: Date | null;
    lastCleaned: Date | null;
    lastRehoused: Date | null;
  } | null;
  photos: { id: string; url: string; caption: string | null; kind: string; takenAt: Date }[];
};

export type SpiderCareView = {
  spider: SpiderWithRelations;
  careStatus: CareStatus;
  lastFedAt: Date | null;
  lastSuccessfulFedAt: Date | null;
  lastMistedAt: Date | null;
  lastMoltAt: Date | null;
  daysSinceFeed: number | null;
  daysSinceSuccessfulFeed: number | null;
  daysSinceMist: number | null;
  daysSinceMolt: number | null;
  latestBodyCondition: string | null;
};

function latestDate(events: { date: Date }[]): Date | null {
  return events[0]?.date ?? null;
}

export function buildCareView(
  spider: SpiderWithRelations,
  defaults: Pick<User, "feedDefaultDays" | "mistDefaultDays">,
): SpiderCareView {
  const lastFedAt = latestDate(spider.feedings);
  const successful = spider.feedings.find((f) => isSuccessfulFeeding(f.outcome));
  const lastSuccessfulFedAt = successful?.date ?? null;
  const lastMistedAt = latestDate(spider.mistings);
  const lastMoltAt = spider.molts[0]?.moltDate ?? null;

  const inputs: CareInputs = {
    status: spider.status,
    lastFedAt,
    lastSuccessfulFedAt,
    lastMistedAt,
    lastMoltAt,
    feedIntervalDays: defaults.feedDefaultDays,
    mistIntervalDays: defaults.mistDefaultDays,
  };

  return {
    spider,
    careStatus: deriveCareStatus(inputs),
    lastFedAt,
    lastSuccessfulFedAt,
    lastMistedAt,
    lastMoltAt,
    daysSinceFeed: daysSince(lastFedAt),
    daysSinceSuccessfulFeed: daysSince(lastSuccessfulFedAt),
    daysSinceMist: daysSince(lastMistedAt),
    daysSinceMolt: daysSince(lastMoltAt),
    latestBodyCondition: spider.bodyConditions[0]?.condition ?? null,
  };
}

const spiderInclude = {
  feedings: { orderBy: { date: "desc" as const }, take: 20 },
  mistings: { orderBy: { date: "desc" as const }, take: 20 },
  molts: { orderBy: { moltDate: "desc" as const }, take: 20 },
  observations: { orderBy: { date: "desc" as const }, take: 20 },
  bodyConditions: { orderBy: { date: "desc" as const }, take: 10 },
  enclosure: true,
  photos: { orderBy: { takenAt: "desc" as const }, take: 20 },
};

export async function getUserDefaults(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      feedDefaultDays: true,
      mistDefaultDays: true,
      cleanDefaultDays: true,
      dateFormat: true,
      measurement: true,
      theme: true,
      name: true,
      email: true,
    },
  });
}

export async function listSpidersForUser(userId: string, query?: {
  q?: string;
  status?: string;
  sex?: string;
}) {
  const spiders = await prisma.spider.findMany({
    where: {
      userId,
      ...(query?.sex ? { sex: query.sex } : {}),
      ...(query?.status ? { status: query.status } : {}),
      ...(query?.q
        ? {
            OR: [
              { name: { contains: query.q } },
              { species: { contains: query.q } },
              { commonName: { contains: query.q } },
            ],
          }
        : {}),
    },
    include: spiderInclude,
    orderBy: { name: "asc" },
  });

  const defaults = await getUserDefaults(userId);
  return spiders.map((s) => buildCareView(s, defaults));
}

export async function getSpiderCare(userId: string, spiderId: string) {
  const spider = await prisma.spider.findFirst({
    where: { id: spiderId, userId },
    include: {
      feedings: { orderBy: { date: "desc" }, take: 50 },
      mistings: { orderBy: { date: "desc" }, take: 50 },
      molts: { orderBy: { moltDate: "desc" }, take: 50 },
      observations: { orderBy: { date: "desc" }, take: 50 },
      bodyConditions: { orderBy: { date: "desc" }, take: 50 },
      enclosure: { include: { maintenance: { orderBy: { date: "desc" }, take: 20 } } },
      photos: { orderBy: { takenAt: "desc" } },
    },
  });
  if (!spider) return null;
  const defaults = await getUserDefaults(userId);
  return buildCareView(spider as SpiderWithRelations, defaults);
}

export type ActivityItem = {
  id: string;
  type: "feeding" | "misting" | "molt" | "observation" | "body" | "maintenance";
  spiderId: string;
  spiderName: string;
  date: Date;
  title: string;
  detail?: string | null;
};

export async function getRecentActivity(
  userId: string,
  filters?: { spiderId?: string; type?: string },
): Promise<ActivityItem[]> {
  const spiders = await prisma.spider.findMany({
    where: { userId, ...(filters?.spiderId ? { id: filters.spiderId } : {}) },
    select: {
      id: true,
      name: true,
      feedings: { orderBy: { date: "desc" }, take: 30 },
      mistings: { orderBy: { date: "desc" }, take: 30 },
      molts: { orderBy: { moltDate: "desc" }, take: 30 },
      observations: { orderBy: { date: "desc" }, take: 30 },
      bodyConditions: { orderBy: { date: "desc" }, take: 20 },
      enclosure: {
        include: { maintenance: { orderBy: { date: "desc" }, take: 20 } },
      },
    },
  });

  const items: ActivityItem[] = [];

  for (const spider of spiders) {
    for (const f of spider.feedings) {
      items.push({
        id: f.id,
        type: "feeding",
        spiderId: spider.id,
        spiderName: spider.name,
        date: f.date,
        title: `Fed ${spider.name}`,
        detail: `${f.quantity}× ${f.preyType} — ${f.outcome}`,
      });
    }
    for (const m of spider.mistings) {
      let methodDetail = "";
      try {
        const parsed = JSON.parse(m.methods || "[]") as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          methodDetail = parsed.map(String).join(" · ");
        }
      } catch {
        methodDetail = "";
      }
      if (!methodDetail) {
        methodDetail = [
          m.mistedEnclosure ? "Misted enclosure" : null,
          m.waterDroplet ? "Water droplet on glass" : null,
        ]
          .filter(Boolean)
          .join(" · ");
      }
      items.push({
        id: m.id,
        type: "misting",
        spiderId: spider.id,
        spiderName: spider.name,
        date: m.date,
        title: `Hydrated ${spider.name}`,
        detail: methodDetail,
      });
    }
    for (const molt of spider.molts) {
      items.push({
        id: molt.id,
        type: "molt",
        spiderId: spider.id,
        spiderName: spider.name,
        date: molt.moltDate,
        title: `${spider.name} molted`,
        detail: [molt.previousInstar, molt.newInstar].filter(Boolean).join(" → "),
      });
    }
    for (const o of spider.observations) {
      items.push({
        id: o.id,
        type: "observation",
        spiderId: spider.id,
        spiderName: spider.name,
        date: o.date,
        title: `${spider.name}: ${o.kind}`,
        detail: o.notes,
      });
    }
    for (const b of spider.bodyConditions) {
      items.push({
        id: b.id,
        type: "body",
        spiderId: spider.id,
        spiderName: spider.name,
        date: b.date,
        title: `${spider.name} body condition`,
        detail: b.condition,
      });
    }
    if (spider.enclosure) {
      for (const maint of spider.enclosure.maintenance) {
        items.push({
          id: maint.id,
          type: "maintenance",
          spiderId: spider.id,
          spiderName: spider.name,
          date: maint.date,
          title: `${spider.name} enclosure ${maint.kind}`,
          detail: maint.notes,
        });
      }
    }
  }

  let filtered = items;
  if (filters?.type && filters.type !== "all") {
    filtered = items.filter((i) => i.type === filters.type);
  }

  return filtered.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 80);
}
