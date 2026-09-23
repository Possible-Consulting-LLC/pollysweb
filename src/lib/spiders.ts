import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  deriveCareStatus,
  daysSince,
  isMistingDue,
  resolveSpiderStatus,
  type CareInputs,
} from "@/lib/care";
import { resolveDisplayTimeZone } from "@/lib/utils";
import { SUCCESSFUL_FEEDING_OUTCOMES, observationLabel } from "@/lib/constants";
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
  timeZone: string;
  careStatus: CareStatus;
  mistDue: boolean;
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
  lastSuccessfulFedAt: Date | null = null,
  timeZone = "UTC",
  lastSuccessfulMoltAt: Date | null = null,
): SpiderCareView {
  const lastFedAt = latestDate(spider.feedings);
  const lastMistedAt = latestDate(spider.mistings);
  const lastMoltAt = lastSuccessfulMoltAt;
  const status = resolveSpiderStatus(spider.status, lastMoltAt, new Date(), timeZone);
  const viewSpider =
    status === spider.status ? spider : { ...spider, status };

  const inputs: CareInputs = {
    status,
    timeZone,
    lastFedAt,
    lastSuccessfulFedAt,
    lastMistedAt,
    lastMoltAt,
    feedIntervalDays: defaults.feedDefaultDays,
    mistIntervalDays: defaults.mistDefaultDays,
  };

  return {
    spider: viewSpider,
    timeZone,
    careStatus: deriveCareStatus(inputs),
    mistDue: isMistingDue(inputs),
    lastFedAt,
    lastSuccessfulFedAt,
    lastMistedAt,
    lastMoltAt,
    daysSinceFeed: daysSince(lastFedAt, new Date(), timeZone),
    daysSinceSuccessfulFeed: daysSince(lastSuccessfulFedAt, new Date(), timeZone),
    daysSinceMist: daysSince(lastMistedAt, new Date(), timeZone),
    daysSinceMolt: daysSince(lastMoltAt, new Date(), timeZone),
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

/** Share settings only within a render request; never cache across keepers or mutations. */
export const getUserDefaults = cache(async (userId: string) => {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      feedDefaultDays: true,
      mistDefaultDays: true,
      timezone: true,
      theme: true,
      name: true,
      email: true,
    },
  });
});

export async function listSpidersForUser(userId: string, query?: {
  q?: string;
  status?: string;
  sex?: string;
}) {
  const [spiders, defaults] = await Promise.all([prisma.spider.findMany({
    where: {
      userId,
      ...(query?.sex ? { sex: query.sex } : {}),
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
  }), getUserDefaults(userId)]);
  const zone = await resolveDisplayTimeZone(defaults.timezone);
  const latestBySpider = await latestSuccessfulCareForSpiders(
    spiders.map((spider) => spider.id),
  );
  return spiders
    .map((spider) => {
      const latest = latestBySpider.get(spider.id) ?? { fed: null, molt: null };
      return buildCareView(spider, defaults, latest.fed, zone, latest.molt);
    })
    .filter((view) => !query?.status || view.spider.status === query.status)
    .sort((a, b) => {
      const am = a.spider.memorializedAt ? 1 : 0;
      const bm = b.spider.memorializedAt ? 1 : 0;
      if (am !== bm) return am - bm;
      return a.spider.name.localeCompare(b.spider.name);
    });
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
  const latest = await latestSuccessfulCare(spider.id);
  return buildCareView(spider as SpiderWithRelations, defaults, latest.fed, await resolveDisplayTimeZone(defaults.timezone), latest.molt);
}

export type ActivityType =
  | "feeding"
  | "misting"
  | "molt"
  | "observation"
  | "body"
  | "maintenance";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  spiderId: string;
  spiderName: string;
  date: Date;
  title: string;
  detail?: string | null;
  /** Serializable fields for the edit form (dates as yyyy-MM-dd). */
  fields: {
    date: string;
    timeZone?: string;
    preyType?: string;
    quantity?: number;
    preySize?: string | null;
    outcome?: string;
    notes?: string | null;
    methods?: string[];
    previousInstar?: string | null;
    newInstar?: string | null;
    approximate?: boolean;
    successful?: boolean;
    kind?: string;
    condition?: string;
  };
};

function parseMethods(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* ignore */
  }
  return [];
}

export async function getRecentActivity(
  userId: string,
  filters?: { spiderId?: string; type?: string },
): Promise<ActivityItem[]> {
  const { toDateTimeLocalInputValue, resolveDisplayTimeZone } = await import(
    "@/lib/utils"
  );
  const [spiders, defaults] = await Promise.all([prisma.spider.findMany({
    where: { userId, ...(filters?.spiderId ? { id: filters.spiderId } : {}) },
    select: {
      id: true,
      name: true,
      feedings: { orderBy: { date: "desc" }, take: 40 },
      mistings: { orderBy: { date: "desc" }, take: 40 },
      molts: { orderBy: { moltDate: "desc" }, take: 40 },
      observations: { orderBy: { date: "desc" }, take: 40 },
      bodyConditions: { orderBy: { date: "desc" }, take: 30 },
      enclosure: {
        include: { maintenance: { orderBy: { date: "desc" }, take: 30 } },
      },
    },
  }), getUserDefaults(userId)]);
  const displayZone = await resolveDisplayTimeZone(defaults.timezone);

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
        fields: {
          timeZone: displayZone,
          date: toDateTimeLocalInputValue(f.date, displayZone),
          preyType: f.preyType,
          quantity: f.quantity,
          preySize: f.preySize,
          outcome: f.outcome,
          notes: f.notes,
        },
      });
    }
    for (const m of spider.mistings) {
      let methods = parseMethods(m.methods);
      if (methods.length === 0) {
        methods = [
          m.mistedEnclosure ? "Misted enclosure" : null,
          m.waterDroplet ? "Water droplet on glass" : null,
        ].filter(Boolean) as string[];
      }
      items.push({
        id: m.id,
        type: "misting",
        spiderId: spider.id,
        spiderName: spider.name,
        date: m.date,
        title: `Hydrated ${spider.name}`,
        detail: methods.join(" · "),
        fields: {
          timeZone: displayZone,
          date: toDateTimeLocalInputValue(m.date, displayZone),
          methods,
          notes: m.notes,
        },
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
        fields: {
          timeZone: displayZone,
          date: toDateTimeLocalInputValue(molt.moltDate, displayZone),
          previousInstar: molt.previousInstar,
          newInstar: molt.newInstar,
          approximate: molt.approximate,
          successful: molt.successful,
          notes: molt.notes,
        },
      });
    }
    for (const o of spider.observations) {
      items.push({
        id: o.id,
        type: "observation",
        spiderId: spider.id,
        spiderName: spider.name,
        date: o.date,
        title: o.kind === "play and interaction" ? `Play & interaction with ${spider.name}` : `${spider.name}: ${observationLabel(o.kind)}`,
        detail: o.notes,
        fields: {
          timeZone: displayZone,
          date: toDateTimeLocalInputValue(o.date, displayZone),
          kind: o.kind,
          notes: o.notes,
        },
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
        fields: {
          timeZone: displayZone,
          date: toDateTimeLocalInputValue(b.date, displayZone),
          condition: b.condition,
          notes: b.notes,
        },
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
          fields: {
          timeZone: displayZone,
            date: toDateTimeLocalInputValue(maint.date, displayZone),
            kind: maint.kind,
            notes: maint.notes,
          },
        });
      }
    }
  }

  let filtered = items;
  if (filters?.type && filters.type !== "all") {
    filtered = items.filter((i) => i.type === filters.type);
  }

  return filtered.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 100);
}

async function latestSuccessfulCare(spiderId: string) {
 const [feeding, molt] = await Promise.all([
 prisma.feedingEvent.findFirst({ where: { spiderId, outcome: { in: [...SUCCESSFUL_FEEDING_OUTCOMES] } }, orderBy: { date: "desc" }, select: { date: true } }),
 prisma.moltEvent.findFirst({ where: { spiderId, successful: true }, orderBy: { moltDate: "desc" }, select: { moltDate: true } }),
 ]);
 return { fed: feeding?.date ?? null, molt: molt?.moltDate ?? null };
}

async function latestSuccessfulCareForSpiders(spiderIds: string[]) {
  const result = new Map<
    string,
    { fed: Date | null; molt: Date | null }
  >();
  if (spiderIds.length === 0) return result;
  const [feedings, molts] = await Promise.all([
    prisma.feedingEvent.groupBy({
      by: ["spiderId"],
      where: {
        spiderId: { in: spiderIds },
        outcome: { in: [...SUCCESSFUL_FEEDING_OUTCOMES] },
      },
      _max: { date: true },
    }),
    prisma.moltEvent.groupBy({
      by: ["spiderId"],
      where: { spiderId: { in: spiderIds }, successful: true },
      _max: { moltDate: true },
    }),
  ]);
  for (const spiderId of spiderIds) {
    result.set(spiderId, { fed: null, molt: null });
  }
  for (const feeding of feedings) {
    result.get(feeding.spiderId)!.fed = feeding._max.date;
  }
  for (const molt of molts) {
    result.get(molt.spiderId)!.molt = molt._max.moltDate;
  }
  return result;
}

/** Story pages merge independently bounded streams with one stable chronological cursor. */
export async function getSpiderStory(userId: string, spiderId: string, cursor?: string) {
 const { decodeHistoryCursor, pageHistory } = await import('./history-page');
 const after = decodeHistoryCursor(cursor);
 const stream = (field: 'date' | 'moltDate' | 'takenAt') => ({
  take: 51,
  orderBy: [{[field]:'desc' as const},{id:'desc' as const}],
  ...(after ? {where:{OR:[{[field]:{lt:after.date}},{[field]:after.date,id:{lt:after.id}}]}} : {}),
 });
 const spider = await prisma.spider.findFirst({where:{id:spiderId,userId},include:{
  feedings:stream('date'),mistings:stream('date'),molts:stream('moltDate'),observations:stream('date'),bodyConditions:stream('date'),photos:stream('takenAt'),enclosure:{include:{maintenance:stream('date')}},
 }});
 if (!spider) return null;
 const acquisition = spider.acquisitionDate
  ? {id:`acquired:${spider.id}`,date:spider.acquisitionDate}
  : null;
 const candidates = [...spider.feedings,...spider.mistings,...spider.observations,...spider.bodyConditions,...(spider.enclosure?.maintenance??[]),...spider.molts.map(m=>({...m,date:m.moltDate})),...spider.photos.map(p=>({...p,date:p.takenAt})),...(acquisition?[acquisition]:[])];
 const page = pageHistory(candidates,cursor);
 const ids=new Set(page.items.map(e=>e.id));
 spider.feedings=spider.feedings.filter(e=>ids.has(e.id));spider.mistings=spider.mistings.filter(e=>ids.has(e.id));spider.observations=spider.observations.filter(e=>ids.has(e.id));spider.bodyConditions=spider.bodyConditions.filter(e=>ids.has(e.id));spider.photos=spider.photos.filter(e=>ids.has(e.id));spider.molts=spider.molts.filter(e=>ids.has(e.id));
 if(spider.enclosure)spider.enclosure.maintenance=spider.enclosure.maintenance.filter(e=>ids.has(e.id));
 const defaults=await getUserDefaults(userId);const zone=await resolveDisplayTimeZone(defaults.timezone);
 const { daysBetween }=await import('./utils');
 // Derive intervals from full chronological history, including predecessors outside this page.
 spider.molts=await Promise.all(spider.molts.map(async molt=>{
  const [prior,meal]=await Promise.all([
   prisma.moltEvent.findFirst({where:{spiderId,moltDate:{lt:molt.moltDate},successful:true},orderBy:{moltDate:'desc'},select:{moltDate:true}}),
   prisma.feedingEvent.findFirst({where:{spiderId,date:{lte:molt.moltDate},outcome:{in:[...SUCCESSFUL_FEEDING_OUTCOMES]}},orderBy:{date:'desc'},select:{date:true}}),
  ]);
  return {...molt,daysSincePriorMolt:prior?daysBetween(prior.moltDate,molt.moltDate,zone):null,fastingDaysBefore:meal?daysBetween(meal.date,molt.moltDate,zone):null};
 }));
 return {spider,nextCursor:page.nextCursor,includeAcquisition:Boolean(acquisition&&ids.has(acquisition.id))};
}
