"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { writableSpiderTransaction } from '@/lib/maintenance-write';
import { withMutation } from '@/lib/mutation-boundary';

import { baselineCelebrations, finishCareCelebrations, forgetWithdrawnCelebrations } from "@/lib/care-celebrations";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { mutateMolt, mutateMaintenance } from "@/lib/history-mutations";
import type { ActionResult } from "@/app/actions/care";
import { getCareWriteUser, resolveActivityDateTime } from "@/app/actions/care-shared";
import { assertSpiderWritable } from "@/lib/spider-write-policy";
import { boundedText, hydrationMethods, optionalText } from "@/lib/write-validation";
import { cleanupDetachedPhoto, detachStoredPhotoRecord } from '@/lib/uploads';

export type ActivityType =
  | "feeding"
  | "misting"
  | "molt"
  | "observation"
  | "body"
  | "maintenance"
  | "photo";

function asOptionalString(value: FormDataEntryValue | null, label = "Text", max = 1000) {
  return optionalText(value, label, max);
}

function revalidateSpider(spiderId: string) {
  revalidatePath("/home");
  revalidatePath("/spoods");
  revalidatePath("/activity");
  revalidatePath("/constellation");
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
  return withMutation(formData, 'data', 'updateactivityaction', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user?.id) return { ok: false, error: "Please sign in again." };

      const owned = await resolveOwnedEvent(type, id, user.id);
      if (!owned) return { ok: false, error: "Activity not found." };
      await assertSpiderWritable(user.id, owned.spiderId);

      const date = await resolveActivityDateTime(user.id!, formData);
      const previousCareDate = type === "molt"
        ? (owned.row as { moltDate: Date }).moltDate
        : ["feeding", "misting", "observation", "body"].includes(type)
          ? (owned.row as { date: Date }).date
          : undefined;
      const baseline = await baselineCelebrations(user.id);

      switch (type) {
        case "feeding": {
          const schema = z.object({
            preyType: z.string().min(1).max(120),
            quantity: z.coerce.number().int().min(1),
            outcome: z.string().min(1).max(120),
            notes: z.string().max(1000).optional(),
            preySize: z.string().max(120).optional(),
          });
          const data = schema.parse({
            preyType: formData.get("preyType") || "fruit flies",
            quantity: formData.get("quantity") || 1,
            outcome: formData.get("outcome") || "Ate normally",
            notes: asOptionalString(formData.get("notes"), "Notes"),
            preySize: asOptionalString(formData.get("preySize"), "Prey size", 120),
          });
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.feedingEvent.update({
            where: { id },
            data: {
              date,
              preyType: data.preyType,
              quantity: data.quantity,
              outcome: data.outcome,
              notes: data.notes ?? null,
              preySize: data.preySize ?? null,
            },
          }));
          break;
        }
        case "misting": {
          const methods = hydrationMethods(formData.getAll("method"));
          if (methods.length === 0) {
            return { ok: false, error: "Choose at least one hydration method." };
          }
          const notes = asOptionalString(formData.get("notes"));
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.mistingEvent.update({
            where: { id },
            data: {
              date,
              methods: JSON.stringify(methods),
              mistedEnclosure: methods.some((m) => m.toLowerCase().includes("mist")),
              waterDroplet: methods.some((m) => m.toLowerCase().includes("droplet")),
              notes: notes ?? null,
            },
          }));
          break;
        }
        case "molt": {
          const previousInstar = asOptionalString(formData.get("previousInstar"), "Previous instar", 120);
          const newInstar = asOptionalString(formData.get("newInstar"), "New instar", 120);
          const approximate = formData.get("approximate") === "on";
          const successful = formData.get("successful") === "on";
          const notes = asOptionalString(formData.get("notes"));

          await mutateMolt(owned.spiderId, tx => tx.moltEvent.update({
            where: { id },
            data: {
              moltDate: date,
              previousInstar: previousInstar ?? null,
              newInstar: newInstar ?? null,
              approximate,
              successful,
              notes: notes ?? null,
            },
          }));
          break;
        }
        case "observation": {
          const kind = boundedText(formData.get("kind") || "behavior note", "Observation kind", 120);
          const notes = asOptionalString(formData.get("notes"));
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.observationEvent.update({
            where: { id },
            data: { date, kind, notes: notes ?? null },
          }));
          break;
        }
        case "body": {
          const condition = boundedText(formData.get("condition") || "Normal", "Body condition", 120);
          const notes = asOptionalString(formData.get("notes"));
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.bodyConditionEvent.update({
            where: { id },
            data: { date, condition, notes: notes ?? null },
          }));
          break;
        }
        case "maintenance": {
          const kind = boundedText(formData.get("kind") || "cleaning", "Maintenance kind", 120);
          const notes = asOptionalString(formData.get("notes"));
          const enclosureId = "enclosureId" in owned ? owned.enclosureId : null;
          if (!enclosureId) return { ok: false, error: "Enclosure not found." };
          await mutateMaintenance(enclosureId, tx => tx.enclosureMaintenanceEvent.update({ where: { id }, data: { date, kind, notes: notes ?? null } }));
          break;
        }
        case "photo": {
          const caption = asOptionalString(formData.get("caption"), "Caption");
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.photo.update({
            where: { id },
            data: { takenAt: date, caption: caption ?? null },
          }));
          break;
        }
        default:
          return { ok: false, error: "Unknown activity type." };
      }

      revalidateSpider(owned.spiderId);
      const activityDate = ["feeding", "misting", "observation", "body"].includes(type) ? date : undefined;
      const changedDate = type === "molt" ? date : activityDate;
      const affectedSince = previousCareDate && changedDate && previousCareDate < changedDate ? previousCareDate : changedDate;
      return { ok: true, celebrations: await finishCareCelebrations(user.id, baseline, activityDate, false, affectedSince), message: `Updated ${owned.spiderName}'s ${type} log.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("updateActivityAction", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not update activity.",
      };
    }

  });
}

export async function deleteActivityAction(
  type: ActivityType,
  id: string, submittedContext: string
): Promise<ActionResult> {
  return withMutation(submittedContext, 'data', 'deleteactivityaction', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user?.id) return { ok: false, error: "Please sign in again." };

      const owned = await resolveOwnedEvent(type, id, user.id);
      if (!owned) return { ok: false, error: "Activity not found." };
      await assertSpiderWritable(user.id, owned.spiderId);
      const affectedSince = type === "molt"
        ? (owned.row as { moltDate: Date }).moltDate
        : ["feeding", "misting", "observation", "body"].includes(type)
          ? (owned.row as { date: Date }).date
          : undefined;

      await baselineCelebrations(user.id);
      let storageCleanupPending = false;

      switch (type) {
        case "feeding":
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.feedingEvent.delete({ where: { id } }));
          break;
        case "misting":
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.mistingEvent.delete({ where: { id } }));
          break;
        case "molt":
          await mutateMolt(owned.spiderId, tx => tx.moltEvent.delete({ where: { id } }));
          break;
        case "observation":
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.observationEvent.delete({ where: { id } }));
          break;
        case "body":
          await writableSpiderTransaction(user.id, owned.spiderId, tx => tx.bodyConditionEvent.delete({ where: { id } }));
          break;
        case "maintenance": {
          const enclosureId = "enclosureId" in owned ? owned.enclosureId : null;
          if (!enclosureId) return { ok: false, error: "Enclosure not found." };
          await mutateMaintenance(enclosureId, tx => tx.enclosureMaintenanceEvent.delete({ where: { id } }));
          break;
        }
        case "photo": {
          const detached = await writableSpiderTransaction(user.id, owned.spiderId, tx =>
            detachStoredPhotoRecord(tx, { photoId: id, spiderId: owned.spiderId, userId: user.id! }),
          );
          if (detached.cleanupPrepared) {
            const cleanup = await cleanupDetachedPhoto(detached.url, user.id!);
            storageCleanupPending = cleanup === 'pending';
          }
          break;
        }
        default:
          return { ok: false, error: "Unknown activity type." };
      }

      let rewardRefreshPending = false;
      try { await forgetWithdrawnCelebrations(user.id, affectedSince); }
      catch (error) {
        console.error('Could not refresh rewards after deletion', error); rewardRefreshPending = true;
      }
      revalidateSpider(owned.spiderId);
      return {
        ok: true,
        message: `Removed that ${type} log.${storageCleanupPending ? ' Secure storage cleanup is pending and has been recorded for administrator recovery.' : ''}${rewardRefreshPending ? ' Reload Journey to refresh your rewards.' : ''}`,
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("deleteActivityAction", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not delete activity.",
      };
    }

  });
}
