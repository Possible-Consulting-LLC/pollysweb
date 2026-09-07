"use server";

import { revalidatePath } from "next/cache";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getActionUser } from "@/lib/session";
import {
  daysBetweenMolts,
  fastingDaysBeforeMolt,
  nextInstar,
} from "@/lib/care";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

async function ownedSpider(spiderId: string, userId: string) {
  return prisma.spider.findFirst({ where: { id: spiderId, userId } });
}

function revalidateSpider(spiderId: string) {
  revalidatePath("/", "layout");
  revalidatePath("/home");
  revalidatePath("/spoods");
  revalidatePath("/activity");
  revalidatePath(`/spoods/${spiderId}`);
  revalidatePath(`/spoods/${spiderId}/story`);
}

function asOptionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

export async function quickFeed(
  spiderId: string,
  formData?: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    const schema = z.object({
      preyType: z.string().min(1).default("fruit flies"),
      quantity: z.coerce.number().int().min(1).default(1),
      outcome: z.string().min(1).default("Ate normally"),
      notes: z.string().optional(),
      preySize: z.string().optional(),
    });

    const data = schema.parse({
      preyType:
        formData?.get("preyType") ||
        formData?.get("customPrey") ||
        "fruit flies",
      quantity: formData?.get("quantity") || 1,
      outcome: formData?.get("outcome") || "Ate normally",
      notes: asOptionalString(formData?.get("notes") ?? null),
      preySize: asOptionalString(formData?.get("preySize") ?? null),
    });

    await prisma.feedingEvent.create({
      data: {
        spiderId,
        preyType: data.preyType,
        quantity: data.quantity,
        outcome: data.outcome,
        notes: data.notes,
        preySize: data.preySize,
        date: new Date(),
      },
    });

    revalidateSpider(spiderId);
    return { ok: true, message: `Logged a feeding for ${spider.name}.` };
  } catch (error) {
    console.error("quickFeed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save feeding.",
    };
  }
}

export async function quickMist(
  spiderId: string,
  formData?: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    const methods = formData
      ? formData
          .getAll("method")
          .map((value) => String(value).trim())
          .filter(Boolean)
      : [];
    const notes = asOptionalString(formData?.get("notes") ?? null);

    if (methods.length === 0) {
      return {
        ok: false,
        error: "Choose at least one hydration method.",
      };
    }

    const mistedEnclosure = methods.some((m) =>
      m.toLowerCase().includes("mist"),
    );
    const waterDroplet = methods.some((m) =>
      m.toLowerCase().includes("droplet"),
    );

    await prisma.mistingEvent.create({
      data: {
        spiderId,
        mistedEnclosure,
        waterDroplet,
        methods: JSON.stringify(methods),
        notes,
        date: new Date(),
      },
    });

    revalidateSpider(spiderId);
    return {
      ok: true,
      message: `Logged hydration for ${spider.name} (${methods.join(", ")}).`,
    };
  } catch (error) {
    console.error("quickMist", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save hydration.",
    };
  }
}

export async function quickObservation(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    const kind = String(formData.get("kind") || "behavior note");
    const notes = asOptionalString(formData.get("notes"));

    await prisma.observationEvent.create({
      data: { spiderId, kind, notes, date: new Date() },
    });

    revalidateSpider(spiderId);
    return { ok: true, message: `Saved a note for ${spider.name}.` };
  } catch (error) {
    console.error("quickObservation", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save observation.",
    };
  }
}

export async function logBodyCondition(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    const condition = String(formData.get("condition") || "Normal");
    const notes = asOptionalString(formData.get("notes"));

    await prisma.bodyConditionEvent.create({
      data: { spiderId, condition, notes, date: new Date() },
    });

    revalidateSpider(spiderId);
    return {
      ok: true,
      message: `Saved body condition (${condition}) for ${spider.name}.`,
    };
  } catch (error) {
    console.error("logBodyCondition", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save body condition.",
    };
  }
}

export async function logMolt(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    const moltDate = new Date(
      String(formData.get("moltDate") || new Date().toISOString()),
    );
    const previousInstar =
      asOptionalString(formData.get("previousInstar")) ||
      spider.instar ||
      undefined;
    const newInstar =
      asOptionalString(formData.get("newInstar")) ||
      nextInstar(previousInstar || spider.instar) ||
      undefined;
    const approximate = formData.get("approximate") === "on";
    const successful = formData.get("successful") !== "off";
    const notes = asOptionalString(formData.get("notes"));

    const prior = await prisma.moltEvent.findFirst({
      where: { spiderId },
      orderBy: { moltDate: "desc" },
    });
    const daysSincePriorMolt = daysBetweenMolts(prior?.moltDate, moltDate);

    const lastSuccess = await prisma.feedingEvent.findFirst({
      where: {
        spiderId,
        date: { lte: moltDate },
        outcome: { in: ["Ate normally", "Ate partially"] },
      },
      orderBy: { date: "desc" },
    });
    const fasting = fastingDaysBeforeMolt(lastSuccess?.date, moltDate);

    await prisma.moltEvent.create({
      data: {
        spiderId,
        moltDate,
        previousInstar,
        newInstar,
        approximate,
        successful,
        notes,
        daysSincePriorMolt: daysSincePriorMolt ?? undefined,
        fastingDaysBefore: fasting ?? undefined,
      },
    });

    await prisma.spider.update({
      where: { id: spiderId },
      data: {
        ...(newInstar ? { instar: newInstar } : {}),
        status: successful ? "Post-molt recovery" : spider.status,
      },
    });

    revalidateSpider(spiderId);
    return { ok: true, message: `Logged a molt for ${spider.name}.` };
  } catch (error) {
    console.error("logMolt", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save molt.",
    };
  }
}

export async function updatePremoltStatus(
  spiderId: string,
  status: string,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    await prisma.spider.update({
      where: { id: spiderId },
      data: { status },
    });

    revalidateSpider(spiderId);
    return { ok: true, message: `Updated premolt status to ${status}.` };
  } catch (error) {
    console.error("updatePremoltStatus", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update status.",
    };
  }
}

export async function upsertEnclosure(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await prisma.spider.findFirst({
      where: { id: spiderId, userId: user.id! },
      include: { enclosure: true },
    });
    if (!spider) return { ok: false, error: "Spider not found." };

    const data = {
      name: asOptionalString(formData.get("name")),
      type: asOptionalString(formData.get("type")),
      dimensions: asOptionalString(formData.get("dimensions")),
      notes: asOptionalString(formData.get("notes")),
      setupDate: formData.get("setupDate")
        ? new Date(String(formData.get("setupDate")))
        : undefined,
    };

    if (spider.enclosure) {
      await prisma.enclosure.update({
        where: { id: spider.enclosure.id },
        data,
      });
    } else {
      await prisma.enclosure.create({
        data: {
          spiderId,
          ...data,
          setupDate: data.setupDate ?? new Date(),
        },
      });
    }

    revalidateSpider(spiderId);
    return {
      ok: true,
      message: spider.enclosure
        ? "Enclosure details updated."
        : "Enclosure added.",
    };
  } catch (error) {
    console.error("upsertEnclosure", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not save enclosure.",
    };
  }
}

export async function logEnclosureMaintenance(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await prisma.spider.findFirst({
      where: { id: spiderId, userId: user.id! },
      include: { enclosure: true },
    });
    if (!spider) return { ok: false, error: "Spider not found." };
    if (!spider.enclosure) {
      return {
        ok: false,
        error: "Add enclosure details first, then log maintenance.",
      };
    }

    const kind = String(formData.get("kind") || "cleaning");
    const notes = asOptionalString(formData.get("notes"));

    await prisma.enclosureMaintenanceEvent.create({
      data: {
        enclosureId: spider.enclosure.id,
        kind,
        notes,
        date: new Date(),
      },
    });

    await prisma.enclosure.update({
      where: { id: spider.enclosure.id },
      data: {
        ...(kind === "cleaning" ? { lastCleaned: new Date() } : {}),
        ...(kind === "rehouse" ? { lastRehoused: new Date() } : {}),
      },
    });

    revalidateSpider(spiderId);
    return { ok: true, message: `Logged enclosure ${kind}.` };
  } catch (error) {
    console.error("logEnclosureMaintenance", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save maintenance.",
    };
  }
}

export async function addSpiderPhoto(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a photo to upload." };
    }
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, error: "Photo must be under 5MB." };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)
      ? ext
      : "jpg";
    const filename = `${spiderId}-${Date.now()}.${safeExt}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), bytes);

    const url = `/uploads/${filename}`;
    const caption = asOptionalString(formData.get("caption"));
    const setAsProfile = formData.get("setAsProfile") === "on";

    await prisma.photo.create({
      data: {
        spiderId,
        url,
        caption,
        kind: setAsProfile ? "profile" : "general",
        takenAt: new Date(),
      },
    });

    if (setAsProfile) {
      await prisma.spider.update({
        where: { id: spiderId },
        data: { profilePhoto: url },
      });
    }

    revalidateSpider(spiderId);
    return { ok: true, message: `Photo added for ${spider.name}.` };
  } catch (error) {
    console.error("addSpiderPhoto", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not upload photo.",
    };
  }
}

export async function setSpiderProfilePhoto(
  photoId: string,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };

    const photo = await prisma.photo.findFirst({
      where: { id: photoId, spider: { userId: user.id! } },
      include: { spider: { select: { id: true, name: true, profilePhoto: true } } },
    });
    if (!photo) return { ok: false, error: "Photo not found." };

    if (photo.spider.profilePhoto === photo.url) {
      return { ok: true, message: `Already ${photo.spider.name}'s profile photo.` };
    }

    await prisma.$transaction([
      prisma.spider.update({
        where: { id: photo.spiderId },
        data: { profilePhoto: photo.url },
      }),
      prisma.photo.update({
        where: { id: photo.id },
        data: { kind: "profile" },
      }),
    ]);

    revalidateSpider(photo.spiderId);
    return {
      ok: true,
      message: `Set as ${photo.spider.name}'s profile photo.`,
    };
  } catch (error) {
    console.error("setSpiderProfilePhoto", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not update profile photo.",
    };
  }
}

export async function deleteSpiderPhoto(photoId: string): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };

    const photo = await prisma.photo.findFirst({
      where: { id: photoId, spider: { userId: user.id! } },
      include: { spider: { select: { id: true, name: true, profilePhoto: true } } },
    });
    if (!photo) return { ok: false, error: "Photo not found." };

    await prisma.photo.delete({ where: { id: photo.id } });

    if (photo.url.startsWith("/uploads/")) {
      const filename = path.basename(photo.url);
      const filePath = path.join(process.cwd(), "public", "uploads", filename);
      try {
        await unlink(filePath);
      } catch {
        // File may already be missing; DB row is what matters for the UI.
      }
    }

    if (photo.spider.profilePhoto === photo.url) {
      const fallback = await prisma.photo.findFirst({
        where: { spiderId: photo.spiderId },
        orderBy: { takenAt: "desc" },
      });
      await prisma.spider.update({
        where: { id: photo.spiderId },
        data: { profilePhoto: fallback?.url ?? "/spoods/defaults/star.svg" },
      });
    }

    revalidateSpider(photo.spiderId);
    return { ok: true, message: `Photo removed from ${photo.spider.name}'s album.` };
  } catch (error) {
    console.error("deleteSpiderPhoto", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete photo.",
    };
  }
}
