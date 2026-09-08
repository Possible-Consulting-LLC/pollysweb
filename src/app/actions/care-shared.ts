"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getActionUser } from "@/lib/session";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function ownedSpider(spiderId: string, userId: string) {
  return prisma.spider.findFirst({ where: { id: spiderId, userId } });
}

export function revalidateSpider(spiderId: string) {
  revalidatePath("/", "layout");
  revalidatePath("/home");
  revalidatePath("/today");
  revalidatePath("/spoods");
  revalidatePath("/activity");
  revalidatePath(`/spoods/${spiderId}`);
  revalidatePath(`/spoods/${spiderId}/story`);
}

export function asOptionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}
