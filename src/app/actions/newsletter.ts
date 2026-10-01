"use server";

import { withMutation } from "@/lib/mutation-boundary";
import { maintenanceTransaction } from "@/lib/maintenance-write";
import { allowAction, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { validateNewsletterInput } from "@/lib/newsletter";
import type { MutationFailure } from "@/lib/mutation-failure";

export type NewsletterResult = { ok: boolean; message: string };

export async function subscribeToNewsletter(
  _prev: NewsletterResult | MutationFailure | undefined,
  formData: FormData,
): Promise<NewsletterResult | MutationFailure> {
  return withMutation(formData, "public-identity", "newsletter-subscribe", async () => {
    const validated = validateNewsletterInput(formData.get("email"));
    if ("error" in validated) return { ok: false, message: validated.error };

    const { email } = validated;
    if (!await allowAction("newsletter", email)) return { ok: false, message: RATE_LIMIT_MESSAGE };

    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (existing) return { ok: true, message: "You're already on the list." };

    try {
      await maintenanceTransaction(async (tx) => {
        await tx.newsletterSubscriber.create({ data: { email } });
      });
      return { ok: true, message: "Subscribed! Watch your inbox." };
    } catch (error) {
      // A concurrent subscribe from the same address loses the unique race —
      // that is still a successful subscription from the visitor's view.
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
        return { ok: true, message: "You're already on the list." };
      }
      console.error("[newsletter] subscribe failed", error);
      return { ok: false, message: "Subscription isn't available right now. Please try again later." };
    }
  });
}