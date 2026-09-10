import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  normalizeTimeZone,
  requireFormDateTime,
} from "@/lib/utils";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function ownedSpider(spiderId: string, userId: string) {
  return prisma.spider.findFirst({ where: { id: spiderId, userId } });
}

export function revalidateSpider(spiderId: string) {
  // Keep this narrow — layout-wide invalidation made every button feel like a
  // full page reload. These paths cover care cards, activity, and the profile.
  revalidatePath("/home");
  revalidatePath("/spoods");
  revalidatePath("/activity");
  revalidatePath(`/spoods/${spiderId}`);
  revalidatePath(`/spoods/${spiderId}/story`);
}

export function asOptionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

/** Persist browser zone on first activity log so SSR displays match. */
export async function rememberUserTimeZone(
  userId: string,
  formData?: FormData | null,
) {
  const fromForm = normalizeTimeZone(
    String(formData?.get("clientTimeZone") || formData?.get("timeZone") || ""),
  );
  if (!fromForm) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  if (!user || normalizeTimeZone(user.timezone)) return;

  await prisma.user.update({
    where: { id: userId },
    data: { timezone: fromForm },
  });
  revalidatePath("/settings");
  revalidatePath("/activity");
  revalidatePath("/home");
}

export async function resolveActivityDateTime(
  userId: string,
  formData: FormData,
  fieldName = "date",
) {
  await rememberUserTimeZone(userId, formData);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const fallback =
    normalizeTimeZone(user?.timezone) ||
    normalizeTimeZone(String(formData.get("clientTimeZone") || "")) ||
    "UTC";
  return requireFormDateTime(formData, fieldName, fallback);
}
