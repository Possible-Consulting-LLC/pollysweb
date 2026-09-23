"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { writableSpiderTransaction } from '@/lib/maintenance-write';
import { withMutation } from '@/lib/mutation-boundary';

import { baselineCelebrations, finishCareCelebrations } from "@/lib/care-celebrations";
import { z } from "zod";
import { mutateMolt } from "@/lib/history-mutations";
import {
  isValidPremoltStatus,
} from "@/lib/care";
import { resolveMoltStages } from "@/lib/spood-details";
import { interactionNotes } from "@/lib/interaction";
import { boundedText, hydrationMethods } from "@/lib/write-validation";
import {
  ActionResult,
  ownedSpider,
  revalidateSpider,
  asOptionalString,
  resolveActivityDateTime,
  getCareWriteUser,
} from "@/app/actions/care-shared";

export async function quickFeed(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'quickfeed', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };

      const schema = z.object({
        preyType: z.string().min(1).max(120).default("fruit flies"),
        quantity: z.coerce.number().int().min(1).default(1),
        outcome: z.string().min(1).max(120).default("Ate normally"),
        notes: z.string().max(1000).optional(),
        preySize: z.string().max(120).optional(),
      });

      const data = schema.parse({
        preyType:
          formData?.get("preyType") ||
          formData?.get("customPrey") ||
          "fruit flies",
        quantity: formData?.get("quantity") || 1,
        outcome: formData?.get("outcome") || "Ate normally",
        notes: asOptionalString(formData?.get("notes") ?? null, "Notes"),
        preySize: asOptionalString(formData?.get("preySize") ?? null, "Prey size", 120),
      });

      const baseline = await baselineCelebrations(user.id!);
      const activityDate = formData
        ? await resolveActivityDateTime(user.id!, formData)
        : new Date();
      const savedEvent = await writableSpiderTransaction(user.id!, spiderId, tx => tx.feedingEvent.create({
        data: {
          spiderId,
          preyType: data.preyType,
          quantity: data.quantity,
          outcome: data.outcome,
          notes: data.notes,
          preySize: data.preySize,
          date: activityDate,
        },
      }));

      revalidateSpider(spiderId);
      return { ok: true, celebrations: await finishCareCelebrations(user.id!, baseline, savedEvent.date), message: `Logged a feeding for ${spider.name}.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("quickFeed", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save feeding.",
      };
    }

  });
}

export async function quickMist(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'quickmist', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };

      const methods = hydrationMethods(formData?.getAll("method") ?? []);
      const notes = asOptionalString(formData?.get("notes") ?? null, "Notes");

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

      const baseline = await baselineCelebrations(user.id!);
      const activityDate = formData
        ? await resolveActivityDateTime(user.id!, formData)
        : new Date();
      const savedEvent = await writableSpiderTransaction(user.id!, spiderId, tx => tx.mistingEvent.create({
        data: {
          spiderId,
          mistedEnclosure,
          waterDroplet,
          methods: JSON.stringify(methods),
          notes,
          date: activityDate,
        },
      }));

      revalidateSpider(spiderId);
      return {
        ok: true,
        celebrations: await finishCareCelebrations(user.id!, baseline, savedEvent.date),
        message: `Logged hydration for ${spider.name} (${methods.join(", ")}).`,
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("quickMist", error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not save hydration.",
      };
    }

  });
}

export async function quickObservation(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'quickobservation', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };

      const kind = boundedText(formData.get("kind") || "behavior note", "Observation kind", 120);
      const notes = asOptionalString(formData.get("notes"), "Notes");

      const baseline = await baselineCelebrations(user.id!);
      const activityDate = await resolveActivityDateTime(user.id!, formData);
      const savedEvent = await writableSpiderTransaction(user.id!, spiderId, tx => tx.observationEvent.create({
        data: {
          spiderId,
          kind,
          notes,
          date: activityDate,
        },
      }));

      revalidateSpider(spiderId);
      return { ok: true, celebrations: await finishCareCelebrations(user.id!, baseline, savedEvent.date), message: `Saved a note for ${spider.name}.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("quickObservation", error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not save observation.",
      };
    }

  });
}

export async function quickInteraction(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'quickinteraction', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user?.id) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id);
      if (!spider) return { ok: false, error: "Spider not found." };

      const notes = interactionNotes(
        String(formData.get("method") ?? ""),
        String(formData.get("otherMethod") ?? ""),
        String(formData.get("notes") ?? ""),
      );
      const activityDate = await resolveActivityDateTime(user.id, formData);
      await writableSpiderTransaction(user.id, spiderId, tx => tx.observationEvent.create({
        data: {
          spiderId,
          kind: "play and interaction",
          notes,
          date: activityDate,
        },
      }));
      revalidateSpider(spiderId);
      return { ok: true, message: `Saved a little moment with ${spider.name}.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("quickInteraction", error);
      return { ok: false, error: error instanceof Error ? error.message : "Could not save interaction." };
    }

  });
}

export async function logBodyCondition(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'logbodycondition', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };

      const condition = boundedText(formData.get("condition") || "Normal", "Body condition", 120);
      const notes = asOptionalString(formData.get("notes"), "Notes");

      const baseline = await baselineCelebrations(user.id!);
      const activityDate = await resolveActivityDateTime(user.id!, formData);
      const savedEvent = await writableSpiderTransaction(user.id!, spiderId, tx => tx.bodyConditionEvent.create({
        data: {
          spiderId,
          condition,
          notes,
          date: activityDate,
        },
      }));

      revalidateSpider(spiderId);
      return {
        ok: true,
        celebrations: await finishCareCelebrations(user.id!, baseline, savedEvent.date),
        message: `Saved body condition (${condition}) for ${spider.name}.`,
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("logBodyCondition", error);
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not save body condition.",
      };
    }

  });
}

export async function logMolt(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'logmolt', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };

      const moltDate = await resolveActivityDateTime(
        user.id!,
        formData,
        formData.get("moltDate") ? "moltDate" : "date",
      );
      const { previousInstar, newInstar } = resolveMoltStages(
        formData.has("previousInstar") ? asOptionalString(formData.get("previousInstar"), "Previous instar", 120) ?? "" : null,
        formData.has("newInstar") ? asOptionalString(formData.get("newInstar"), "New instar", 120) ?? "" : null,
        spider.instar,
      );
      const approximate = formData.get("approximate") === "on";
      const successful = formData.get("successful") === "on";
      const notes = asOptionalString(formData.get("notes"), "Notes");

      const baseline = await baselineCelebrations(user.id!);
      await mutateMolt(spiderId, tx => tx.moltEvent.create({
        data: {
          spiderId,
          moltDate,
          previousInstar,
          newInstar,
          approximate,
          successful,
          notes,
        },
      }), true);

      revalidateSpider(spiderId);
      return { ok: true, celebrations: await finishCareCelebrations(user.id!, baseline, undefined, false, moltDate), message: `Logged a molt for ${spider.name}.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("logMolt", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not save molt.",
      };
    }

  });
}

export async function updatePremoltStatus(
  spiderId: string,
  status: string, submittedContext: string
): Promise<ActionResult> {
  return withMutation(submittedContext, 'data', 'updatepremoltstatus', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };
      if (!isValidPremoltStatus(status)) return { ok: false, error: "Choose a valid molt phase." };

      await writableSpiderTransaction(user.id!, spiderId, tx => tx.spider.update({
        where: { id: spiderId },
        data: { status },
      }));

      revalidateSpider(spiderId);
      return { ok: true, message: `Updated molt phase to ${status}.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("updatePremoltStatus", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not update molt phase.",
      };
    }

  });
}
