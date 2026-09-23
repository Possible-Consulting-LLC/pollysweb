"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { writableSpiderTransaction } from '@/lib/maintenance-write';
import { withMutation } from '@/lib/mutation-boundary';

import { getCareWriteUser } from "@/app/actions/care-shared";
import { parseLocalDateInput } from "@/lib/utils";
import { SEX_OPTIONS } from "@/lib/constants";
import { boundedText, optionalText } from "@/lib/write-validation";
import {
  type ActionResult,
  ownedSpider,
  revalidateSpider,
} from "@/app/actions/care-shared";

export async function updateSpiderAbout(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  return withMutation(formData, 'data', 'updatespiderabout', async () => {
    try {
      const user = await getCareWriteUser();
      if (!user) return { ok: false, error: "Please sign in again." };
      const spider = await ownedSpider(spiderId, user.id!);
      if (!spider) return { ok: false, error: "Spider not found." };

      const name = boundedText(formData.get("name"), "Name", 120);
      if (!name) return { ok: false, error: "Name is required." };

      const sexRaw = String(formData.get("sex") || "Unknown").trim();
      const sex = (SEX_OPTIONS as readonly string[]).includes(sexRaw)
        ? sexRaw
        : "Unknown";

      const emptyToNull = (value: FormDataEntryValue | null, label: string, max = 120) =>
        optionalText(value, label, max) ?? null;

      for (const field of ["hatchDate", "acquisitionDate"]) {
        const value = String(formData.get(field) || "").trim();
        if (value && !parseLocalDateInput(value)) return { ok: false, error: "Enter a valid calendar date." };
      }

      await writableSpiderTransaction(user.id!, spiderId, tx => tx.spider.update({
        where: { id: spiderId },
        data: {
          name,
          sex,
          commonName: emptyToNull(formData.get("commonName"), "Common name"),
          species: emptyToNull(formData.get("species"), "Species"),
          instar: emptyToNull(formData.get("instar"), "Instar"),
          source: emptyToNull(formData.get("source"), "Source"),
          notes: emptyToNull(formData.get("notes"), "Notes", 1000),
          hatchDate: parseLocalDateInput(
            String(formData.get("hatchDate") || ""),
          ),
          acquisitionDate: parseLocalDateInput(
            String(formData.get("acquisitionDate") || ""),
          ),
        },
      }));

      revalidateSpider(spiderId);
      return { ok: true, message: `Updated ${name}'s profile.` };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("updateSpiderAbout", error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "Could not update profile.",
      };
    }

  });
}
