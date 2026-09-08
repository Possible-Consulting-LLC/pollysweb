"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getActionUser } from "@/lib/session";
import { daysBetweenMolts, fastingDaysBeforeMolt } from "@/lib/care";
import type { ActionResult } from "@/app/actions/care";
import { resolveActivityDateTime } from "@/app/actions/care-shared";

export type ActivityType =
  | "feeding"
  | "misting"
  | "molt"
  | "observation"
  | "body"
  | "maintenance"
  | "photo";

function asOptionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function revalidateSpider(spiderId: string) {
  revalidatePath("/", "layout");
  revalidatePath("/home");
  revalidatePath("/today");
  revalidatePath("/spoods");
  revalidatePath("/activity");
  revalidatePath(`/spoods/${spiderId}`);
  revalidatePath(`/spoods/${spiderId}/story`);
}

async function resolveOwnedEvent(
  type: ActivityType,
  id: string,
  userId: string,
) {
  switch (type) {
    case "feeding": {
      const row = await prisma.feedingEvent.findFirst({
        where: { id, spider: { userId } },
        include: { spider: { select: { id: true, name: true } } },
      });
      return row ? { spiderId: row.spider.id, spiderName: row.spider.name, row } : null;
    }
    case "misting": {
      const row = await prisma.mistingEvent.findFirst({
        where: { id, spider: { userId } },
        include: { spider: { select: { id: true, name: true } } },
      });
      return row ? { spiderId: row.spider.id, spiderName: row.spider.name, row } : null;
    }
    case "molt": {
      const row = await prisma.moltEvent.findFirst({
        where: { id, spider: { userId } },
        include: { spider: { select: { id: true, name: true } } },
      });
      return row ? { spiderId: row.spider.id, spiderName: row.spider.name, row } : null;
    }
    case "observation": {
      const row = await prisma.observationEvent.findFirst({
        where: { id, spider: { userId } },
        include: { spider: { select: { id: true, name: true } } },
      });
      return row ? { spiderId: row.spider.id, spiderName: row.spider.name, row } : null;
    }
    case "body": {
      const row = await prisma.bodyConditionEvent.findFirst({
        where: { id, spider: { userId } },
        include: { spider: { select: { id: true, name: true } } },
      });
      return row ? { spiderId: row.spider.id, spiderName: row.spider.name, row } : null;
    }
    case "maintenance": {
      const row = await prisma.enclosureMaintenanceEvent.findFirst({
        where: { id, enclosure: { spider: { userId } } },
        include: {
          enclosure: {
            select: {
              id: true,
              spiderId: true,
              spider: { select: { id: true, name: true } },
            },
          },
        },
      });
      return row
        ? {
            spiderId: row.enclosure.spider.id,
            spiderName: row.enclosure.spider.name,
            enclosureId: row.enclosure.id,
            row,
          }
        : null;
    }
    case "photo": {
      const row = await prisma.photo.findFirst({
        where: { id, spider: { userId } },
        include: { spider: { select: { id: true, name: true, profilePhoto: true } } },
      });
      return row ? { spiderId: row.spider.id, spiderName: row.spider.name, row } : null;
    }
    default:
      return null;
  }
}

export async function updateActivityAction(
  type: ActivityType,
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user?.id) return { ok: false, error: "Please sign in again." };

    const owned = await resolveOwnedEvent(type, id, user.id);
    if (!owned) return { ok: false, error: "Activity not found." };

    const date = await resolveActivityDateTime(user.id!, formData);

    switch (type) {
      case "feeding": {
        const schema = z.object({
          preyType: z.string().min(1),
          quantity: z.coerce.number().int().min(1),
          outcome: z.string().min(1),
          notes: z.string().optional(),
          preySize: z.string().optional(),
        });
        const data = schema.parse({
          preyType: formData.get("preyType") || "fruit flies",
          quantity: formData.get("quantity") || 1,
          outcome: formData.get("outcome") || "Ate normally",
          notes: asOptionalString(formData.get("notes")),
          preySize: asOptionalString(formData.get("preySize")),
        });
        await prisma.feedingEvent.update({
          where: { id },
          data: {
            date,
            preyType: data.preyType,
            quantity: data.quantity,
            outcome: data.outcome,
            notes: data.notes ?? null,
            preySize: data.preySize ?? null,
          },
        });
        break;
      }
      case "misting": {
        const methods = formData
          .getAll("method")
          .map((value) => String(value).trim())
          .filter(Boolean);
        if (methods.length === 0) {
          return { ok: false, error: "Choose at least one hydration method." };
        }
        const notes = asOptionalString(formData.get("notes"));
        await prisma.mistingEvent.update({
          where: { id },
          data: {
            date,
            methods: JSON.stringify(methods),
            mistedEnclosure: methods.some((m) => m.toLowerCase().includes("mist")),
            waterDroplet: methods.some((m) => m.toLowerCase().includes("droplet")),
            notes: notes ?? null,
          },
        });
        break;
      }
      case "molt": {
        const previousInstar = asOptionalString(formData.get("previousInstar"));
        const newInstar = asOptionalString(formData.get("newInstar"));
        const approximate = formData.get("approximate") === "on";
        const successful = formData.get("successful") === "on";
        const notes = asOptionalString(formData.get("notes"));

        const prior = await prisma.moltEvent.findFirst({
          where: { spiderId: owned.spiderId, id: { not: id }, moltDate: { lt: date } },
          orderBy: { moltDate: "desc" },
        });
        const daysSincePriorMolt = daysBetweenMolts(prior?.moltDate, date);
        const lastSuccess = await prisma.feedingEvent.findFirst({
          where: {
            spiderId: owned.spiderId,
            date: { lte: date },
            outcome: { in: ["Ate normally", "Ate partially"] },
          },
          orderBy: { date: "desc" },
        });
        const fasting = fastingDaysBeforeMolt(lastSuccess?.date, date);

        await prisma.moltEvent.update({
          where: { id },
          data: {
            moltDate: date,
            previousInstar: previousInstar ?? null,
            newInstar: newInstar ?? null,
            approximate,
            successful,
            notes: notes ?? null,
            daysSincePriorMolt: daysSincePriorMolt ?? null,
            fastingDaysBefore: fasting ?? null,
          },
        });
        break;
      }
      case "observation": {
        const kind = String(formData.get("kind") || "behavior note").trim();
        const notes = asOptionalString(formData.get("notes"));
        await prisma.observationEvent.update({
          where: { id },
          data: { date, kind, notes: notes ?? null },
        });
        break;
      }
      case "body": {
        const condition = String(formData.get("condition") || "Normal").trim();
        const notes = asOptionalString(formData.get("notes"));
        await prisma.bodyConditionEvent.update({
          where: { id },
          data: { date, condition, notes: notes ?? null },
        });
        break;
      }
      case "maintenance": {
        const kind = String(formData.get("kind") || "cleaning").trim();
        const notes = asOptionalString(formData.get("notes"));
        await prisma.enclosureMaintenanceEvent.update({
          where: { id },
          data: { date, kind, notes: notes ?? null },
        });
        const enclosureId = "enclosureId" in owned ? owned.enclosureId : null;
        if (enclosureId && (kind === "cleaning" || kind === "rehouse")) {
          await prisma.enclosure.update({
            where: { id: enclosureId },
            data: {
              ...(kind === "cleaning" ? { lastCleaned: date } : {}),
              ...(kind === "rehouse" ? { lastRehoused: date } : {}),
            },
          });
        }
        break;
      }
      case "photo": {
        const caption = asOptionalString(formData.get("caption"));
        await prisma.photo.update({
          where: { id },
          data: { takenAt: date, caption: caption ?? null },
        });
        break;
      }
      default:
        return { ok: false, error: "Unknown activity type." };
    }

    revalidateSpider(owned.spiderId);
    return { ok: true, message: `Updated ${owned.spiderName}'s ${type} log.` };
  } catch (error) {
    console.error("updateActivityAction", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update activity.",
    };
  }
}

export async function deleteActivityAction(
  type: ActivityType,
  id: string,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user?.id) return { ok: false, error: "Please sign in again." };

    const owned = await resolveOwnedEvent(type, id, user.id);
    if (!owned) return { ok: false, error: "Activity not found." };

    switch (type) {
      case "feeding":
        await prisma.feedingEvent.delete({ where: { id } });
        break;
      case "misting":
        await prisma.mistingEvent.delete({ where: { id } });
        break;
      case "molt":
        await prisma.moltEvent.delete({ where: { id } });
        break;
      case "observation":
        await prisma.observationEvent.delete({ where: { id } });
        break;
      case "body":
        await prisma.bodyConditionEvent.delete({ where: { id } });
        break;
      case "maintenance":
        await prisma.enclosureMaintenanceEvent.delete({ where: { id } });
        break;
      case "photo": {
        const photo = owned.row as {
          url: string;
          spider: { profilePhoto: string | null };
        };
        const { deleteStoredImage } = await import("@/lib/uploads");
        await prisma.photo.delete({ where: { id } });
        await deleteStoredImage(photo.url).catch(() => undefined);
        if (photo.spider.profilePhoto === photo.url) {
          const fallback = await prisma.photo.findFirst({
            where: { spiderId: owned.spiderId },
            orderBy: { takenAt: "desc" },
          });
          await prisma.spider.update({
            where: { id: owned.spiderId },
            data: {
              profilePhoto: fallback?.url ?? "/spoods/defaults/star.svg",
            },
          });
        }
        break;
      }
      default:
        return { ok: false, error: "Unknown activity type." };
    }

    revalidateSpider(owned.spiderId);
    return { ok: true, message: `Removed that ${type} log.` };
  } catch (error) {
    console.error("deleteActivityAction", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete activity.",
    };
  }
}
