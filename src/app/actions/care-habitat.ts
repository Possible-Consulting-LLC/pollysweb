"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { maintenanceTransaction, writableSpiderTransaction } from '@/lib/maintenance-write';
import { withMutation } from '@/lib/mutation-boundary';

import { baselineCelebrations, finishCareCelebrations } from "@/lib/care-celebrations";
import { unlink } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { parseLocalDateInput, toDateInputValue } from "@/lib/utils";
import { mutateMaintenance } from "@/lib/history-mutations";
import { prisma } from "@/lib/db";
import { cleanupDetachedPhoto, cleanupUnattachedUpload, detachStoredPhotoRecord, saveImageUpload } from "@/lib/uploads";
import { runWithSpiderSlot } from "@/lib/spider-slots";
import { assertSpiderWritable } from "@/lib/spider-write-policy";
import { boundedText } from "@/lib/write-validation";
import {
  ActionResult,
  ownedSpider,
  revalidateSpider,
  asOptionalString,
  resolveActivityDateTime,
  getCareWriteUser,
} from "@/app/actions/care-shared";

export async function upsertEnclosure(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('enclosure.manage', () => withMutation(formData, 'data', 'upsertenclosure', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await prisma.spider.findFirst({
        where: { id: spiderId, userId: user.id! },
        include: { enclosure: true },
      });
      if (!spider) return { ok: false, error: "Spider not found." };

      await assertSpiderWritable(user.id!, spiderId);

      const setupDate = String(formData.get("setupDate") || "").trim();
      if (setupDate && !parseLocalDateInput(setupDate)) return { ok: false, error: "Enter a valid setup date." };
      const data = {
        name: formData.has("name") ? asOptionalString(formData.get("name"), "Enclosure name", 120) ?? null : undefined,
        type: formData.has("type") ? asOptionalString(formData.get("type"), "Enclosure type", 120) ?? null : undefined,
        dimensions: formData.has("dimensions") ? asOptionalString(formData.get("dimensions"), "Dimensions", 120) ?? null : undefined,
        notes: formData.has("notes") ? asOptionalString(formData.get("notes"), "Notes") ?? null : undefined,
        setupDate: formData.has("setupDate") ? parseLocalDateInput(String(formData.get("setupDate") || "")) : undefined,
      };

      if (spider.enclosure) {
        await writableSpiderTransaction(user.id!, spiderId, tx => tx.enclosure.update({
          where: { id: spider.enclosure!.id },
          data,
        }));
      } else {
        await writableSpiderTransaction(user.id!, spiderId, tx => tx.enclosure.create({
          data: {
            spiderId,
            ...data,
            setupDate: data.setupDate,
          },
        }));
      }

      revalidateSpider(spiderId);
      return {
        ok: true,
        message: spider.enclosure
          ? "Enclosure details updated."
          : "Enclosure added.",
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("upsertEnclosure", error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not save enclosure.",
      };
    }

  }));
}

export async function logEnclosureMaintenance(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('housekeeping.log', () => withMutation(formData, 'data', 'logenclosuremaintenance', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await prisma.spider.findFirst({
        where: { id: spiderId, userId: user.id! },
        include: { enclosure: true },
      });
      if (!spider) return { ok: false, error: "Spider not found." };
      await assertSpiderWritable(user.id!, spiderId);
      if (!spider.enclosure) {
        return {
          ok: false,
          error: "Add enclosure details first, then log maintenance.",
        };
      }

      const kind = boundedText(formData.get("kind") || "cleaning", "Maintenance kind", 120);
      const notes = asOptionalString(formData.get("notes"), "Notes");
      const date = await resolveActivityDateTime(user.id!, formData);

      const baseline = await baselineCelebrations(user.id!);
      await mutateMaintenance(spider.enclosure.id, tx => tx.enclosureMaintenanceEvent.create({ data: { enclosureId: spider.enclosure!.id, kind, notes, date } }));

      revalidateSpider(spiderId);
      return { ok: true, celebrations: await finishCareCelebrations(user.id!, baseline), message: `Logged enclosure ${kind}.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("logEnclosureMaintenance", error);
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not save maintenance.",
      };
    }

  }));
}

export async function addSpiderPhoto(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('photo.upload', () => withMutation(formData, 'data', 'addspiderphoto', async () => {
    let unattached: { url: string; userId: string; } | null = null;
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };

      const file = formData.get("photo");
      if (!(file instanceof File) || file.size === 0) {
        return { ok: false, error: "Choose a photo to upload." };
      }

      const caption = asOptionalString(formData.get("caption"), "Caption");
      const saved = await saveImageUpload(file, spiderId);
      if ("error" in saved) {
        return { ok: false, error: saved.error };
      }
      const url = saved.url;
      unattached = { url, userId: user.id! };

      const { resolveUserFeatureGate } = await import("@/lib/features/gate");
      const setAsProfile =
        formData.get("setAsProfile") === "on" &&
        (await resolveUserFeatureGate(user.id!, "photo.profile.set")) === "entitled";
      const takenAt = formData.get("date")
        ? await resolveActivityDateTime(user.id!, formData)
        : new Date();

      const baseline = await baselineCelebrations(user.id!);
      await writableSpiderTransaction(user.id!, spiderId, async tx => {
        await tx.photo.create({
          data: {
            spiderId,
            url,
            caption,
            kind: setAsProfile ? "profile" : "general",
            takenAt,
          },
        });

        if (setAsProfile) {
          await tx.spider.update({
            where: { id: spiderId },
            data: { profilePhoto: url },
          });
        }

      });
      unattached = null;
      revalidateSpider(spiderId);
      return { ok: true, celebrations: await finishCareCelebrations(user.id!, baseline), message: `Photo added for ${spider.name}.` };
    } catch (error) {
      if (unattached) await cleanupUnattachedUpload(unattached.url, unattached.userId);
      if (error instanceof MaintenanceError) throw error;
      console.error("addSpiderPhoto", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not upload photo.",
      };
    }

  }));
}

export async function setSpiderProfilePhoto(
  photoId: string, submittedContext: string
): Promise<ActionResult> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('photo.profile.set', () => withMutation(submittedContext, 'data', 'setspiderprofilephoto', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };

      const photo = await prisma.photo.findFirst({
        where: { id: photoId, spider: { userId: user.id! } },
        include: { spider: { select: { id: true, name: true, profilePhoto: true } } },
      });
      if (!photo) return { ok: false, error: "Photo not found." };

      await assertSpiderWritable(user.id!, photo.spiderId);

      if (photo.spider.profilePhoto === photo.url) {
        return { ok: true, message: `Already ${photo.spider.name}'s profile photo.` };
      }

      await writableSpiderTransaction(user.id!, photo.spiderId, async tx => {
        await tx.spider.update({
          where: { id: photo.spiderId },
          data: { profilePhoto: photo.url },
        });
        await tx.photo.update({
          where: { id: photo.id },
          data: { kind: "profile" },
        });
      });

      revalidateSpider(photo.spiderId);
      return {
        ok: true,
        message: `Set as ${photo.spider.name}'s profile photo.`,
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("setSpiderProfilePhoto", error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not update profile photo.",
      };
    }

  }));
}

export async function deleteSpiderPhoto(photoId: string, submittedContext: string): Promise<ActionResult> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('photo.delete', () => withMutation(submittedContext, 'data', 'deletespiderphoto', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };

      const photo = await prisma.photo.findFirst({
        where: { id: photoId, spider: { userId: user.id! } },
        include: { spider: { select: { id: true, name: true, profilePhoto: true } } },
      });
      if (!photo) return { ok: false, error: "Photo not found." };

      await assertSpiderWritable(user.id!, photo.spiderId);

      const detached = await writableSpiderTransaction(user.id!, photo.spiderId, tx =>
        detachStoredPhotoRecord(tx, { photoId: photo.id, spiderId: photo.spiderId, userId: user.id! }),
      );
      let storageCleanupPending = false;
      if (detached.url.startsWith("/uploads/")) {
        const filename = path.basename(detached.url);
        const filePath = path.join(process.cwd(), "public", "uploads", filename);
        try {
          await unlink(filePath);
        } catch {
          // File may already be missing; DB row is what matters for the UI.
        }
      } else if (detached.cleanupPrepared) {
        storageCleanupPending = await cleanupDetachedPhoto(detached.url, user.id!) === 'pending';
      }

      revalidateSpider(photo.spiderId);
      return {
        ok: true,
        message: `Photo removed from ${photo.spider.name}'s album.${storageCleanupPending ? ' Secure storage cleanup is pending and has been recorded for administrator recovery.' : ''}`,
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("deleteSpiderPhoto", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not delete photo.",
      };
    }

  }));
}

export async function memorializeSpider(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'memorializespider', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };
      if (spider.memorializedAt) {
        return { ok: true, message: `${spider.name} is already in the memorial.` };
      }

      const passedOnRaw = String(formData.get("passedOn") || "").trim();
      const memorialNote = asOptionalString(formData.get("memorialNote") ?? null, "Memorial note");
      const passedOn = parseLocalDateInput(passedOnRaw || toDateInputValue(new Date()));
      if (!passedOn) {
        return { ok: false, error: "That passing date doesn’t look valid." };
      }

      await writableSpiderTransaction(user.id!, spiderId, tx => tx.spider.update({
        where: { id: spiderId },
        data: {
          memorializedAt: new Date(),
          passedOn,
          memorialNote: memorialNote ?? null,
        },
      }));

      revalidateSpider(spiderId);
      revalidatePath("/upgrade");
      revalidatePath("/settings");
      revalidatePath("/spoods/new");
      return {
        ok: true,
        message: `${spider.name} is memorialized. Their story stays, and they no longer use a free plan slot.`,
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("memorializeSpider", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not memorialize.",
      };
    }

  });
}

export async function restoreMemorializedSpider(
  spiderId: string, submittedContext: string
): Promise<ActionResult> {
  return withMutation(submittedContext, 'data', 'restorememorializedspider', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await prisma.spider.findFirst({ where: { id: spiderId, userId: user.id! } });
      if (!spider) return { ok: false, error: "Spider not found." };
      if (!spider.memorializedAt) {
        return { ok: true, message: `${spider.name} is already an active spood.` };
      }

      const restored = await maintenanceTransaction((tx) => runWithSpiderSlot(tx, user.id!, () => tx.spider.update({
        where: { id: spiderId, userId: user.id!, memorializedAt: { not: null } },
        data: {
          memorializedAt: null,
          passedOn: null,
          memorialNote: null,
        },
      })), { isolationLevel: "ReadCommitted" });
      if (!restored.ok) {
        return {
          ok: false,
          error: `Free accounts include ${restored.freeLimit} active spood. Upgrade to Pro, or memorialize another spood first.`,
        };
      }

      revalidateSpider(spiderId);
      revalidatePath("/upgrade");
      revalidatePath("/settings");
      revalidatePath("/spoods/new");
      return {
        ok: true,
        message: `${spider.name} is active again and counts toward your plan.`,
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("restoreMemorializedSpider", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not restore spood.",
      };
    }

  });
}
