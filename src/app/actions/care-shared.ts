import { maintenanceTransaction } from '@/lib/maintenance-write';
import type { Celebration } from "@/lib/care-progress";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getActionUser } from "@/lib/session";
import { allowAction, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { optionalText } from "@/lib/write-validation";
import { assertSpiderWritable } from "@/lib/spider-write-policy";
import {
  normalizeTimeZone,
  requireNonFutureFormDateTime,
} from "@/lib/utils";

export type ActionResult =
  | { ok: true; message: string; celebrations?: Celebration[]; }
  | { ok: false; error: string; };

export async function ownedSpider(spiderId: string, userId: string) {
  const spider = await prisma.spider.findFirst({ where: { id: spiderId, userId } });
  if (spider) await assertSpiderWritable(userId, spiderId);
  return spider;
}

export function revalidateSpider(spiderId: string) {
  // Keep this narrow — layout-wide invalidation made every button feel like a
  // full page reload. These paths cover care cards, activity, and the profile.
  revalidatePath("/home");
  revalidatePath("/spoods");
  revalidatePath("/activity");
  revalidatePath("/constellation");
  revalidatePath(`/spoods/${spiderId}`);
  revalidatePath(`/spoods/${spiderId}/story`);
}

export function asOptionalString(value: FormDataEntryValue | null, label = "Text", max = 1000) {
  return optionalText(value, label, max);
}

export async function getCareWriteUser() {
  const user = await getActionUser();
  if (!user?.id) return null;
  if (!await allowAction("care", user.id)) {
    throw new Error(RATE_LIMIT_MESSAGE);
  }
  return user;
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

  await maintenanceTransaction(tx => tx.user.update({
    where: { id: userId },
    data: { timezone: fromForm },
  }), undefined, false);
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
  return requireNonFutureFormDateTime(formData, fieldName, fallback);
}
