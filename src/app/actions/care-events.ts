"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getActionUser } from "@/lib/session";
import {
  daysBetweenMolts,
  fastingDaysBeforeMolt,
  nextInstar,
} from "@/lib/care";
import {
  ActionResult,
  ownedSpider,
  revalidateSpider,
  asOptionalString,
  resolveActivityDateTime,
} from "@/app/actions/care-shared";

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
        date: formData
          ? await resolveActivityDateTime(user.id!, formData)
          : new Date(),
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
        date: formData
          ? await resolveActivityDateTime(user.id!, formData)
          : new Date(),
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
      data: {
        spiderId,
        kind,
        notes,
        date: await resolveActivityDateTime(user.id!, formData),
      },
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
      data: {
        spiderId,
        condition,
        notes,
        date: await resolveActivityDateTime(user.id!, formData),
      },
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

    const moltDate = await resolveActivityDateTime(
      user.id!,
      formData,
      formData.get("moltDate") ? "moltDate" : "date",
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
    const successful = formData.get("successful") === "on";
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
