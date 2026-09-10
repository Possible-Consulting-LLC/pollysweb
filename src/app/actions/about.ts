"use server";

import { prisma } from "@/lib/db";
import { getActionUser } from "@/lib/session";
import { parseLocalDateInput } from "@/lib/utils";
import { SEX_OPTIONS } from "@/lib/constants";
import {
  type ActionResult,
  ownedSpider,
  revalidateSpider,
} from "@/app/actions/care-shared";

export async function updateSpiderAbout(
  spiderId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await getActionUser();
    if (!user) return { ok: false, error: "Please sign in again." };
    const spider = await ownedSpider(spiderId, user.id!);
    if (!spider) return { ok: false, error: "Spider not found." };

    const name = String(formData.get("name") || "").trim();
    if (!name) return { ok: false, error: "Name is required." };

    const sexRaw = String(formData.get("sex") || "Unknown").trim();
    const sex = (SEX_OPTIONS as readonly string[]).includes(sexRaw)
      ? sexRaw
      : "Unknown";

    const emptyToNull = (value: FormDataEntryValue | null) => {
      const text = String(value ?? "").trim();
      return text ? text : null;
    };

    await prisma.spider.update({
      where: { id: spiderId },
      data: {
        name,
        sex,
        commonName: emptyToNull(formData.get("commonName")),
        species: emptyToNull(formData.get("species")),
        instar: emptyToNull(formData.get("instar")),
        source: emptyToNull(formData.get("source")),
        notes: emptyToNull(formData.get("notes")),
        hatchDate: parseLocalDateInput(
          String(formData.get("hatchDate") || ""),
        ),
        acquisitionDate: parseLocalDateInput(
          String(formData.get("acquisitionDate") || ""),
        ),
      },
    });

    revalidateSpider(spiderId);
    return { ok: true, message: `Updated ${name}'s profile.` };
  } catch (error) {
    console.error("updateSpiderAbout", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not update profile.",
    };
  }
}
