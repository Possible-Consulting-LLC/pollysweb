"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { withMutation } from '@/lib/mutation-boundary';

import { z } from "zod";
import { getActionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password-policy";
import { allowAction, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { emailDeliveryAvailable } from "@/lib/email-delivery";
import { confirmEmailChange, requestEmailChange } from "@/lib/email-challenge";
import { redirect } from "next/navigation";

const emailSchema = z.email().max(254);
const SOCIAL_REAUTH_MS = 5 * 60_000;

export async function requestEmailChangeAction(_prev: { error?: string; success?: string; } | undefined, formData: FormData): Promise<{ error?: string; success?: string; }> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('settings.email.change', () => withMutation(formData, 'identity', 'requestemailchangeaction', async () => {
    void _prev;
    const session = await getActionUser();
    if (!session?.id) return { error: "Please sign in again." };
    const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
    if (!parsed.success) return { error: "Enter a valid email address (up to 254 characters)." };
    const account = await prisma.user.findUnique({ where: { id: session.id }, select: { email: true, passwordHash: true, emailVerified: true } });
    if (!account) return { error: "Please sign in again." };
    if (parsed.data === account.email.toLowerCase()) return { error: "Enter a different email address." };
    if (!await allowAction("email-change", session.id)) return { error: RATE_LIMIT_MESSAGE };

    if (account.passwordHash) {
      const currentPassword = String(formData.get("currentPassword") ?? "");
      if (!await verifyPassword(currentPassword, account.passwordHash)) return { error: "Current password is incorrect." };
    } else if (typeof session.emailChangeReauthAt !== "number" ||
      !Number.isSafeInteger(session.emailChangeReauthAt) ||
      session.emailChangeReauthAt > Date.now() ||
      Date.now() - session.emailChangeReauthAt > SOCIAL_REAUTH_MS) {
      return { error: "Please sign in again with your connected provider, then retry." };
    }

    if (!emailDeliveryAvailable(parsed.data)) {
      return { error: "Email changes aren’t available for this address right now. Please try again later." };
    }
    try {
      const result = await requestEmailChange(session.id, parsed.data);
      if (result === "same") return { error: "Enter a different email address." };
      return { success: "If that email address is available, a confirmation link has been sent. Your current email remains active until you confirm it." };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("[email-change] request failed", error);
      return { error: "Couldn’t send the confirmation link right now. Please try again later." };
    }

  }));
}

// Exempt from settings.email.change by design: the emailed link must finish a change the gated request already started.
export async function confirmEmailChangeAction(_prev: { error?: string; } | undefined, formData: FormData) {
  return withMutation(formData, 'public-identity', 'confirmemailchangeaction', async () => {
    void _prev;
    const token = String(formData.get("token") ?? "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { error: "This link is invalid or expired. Request another in Settings." };
    if (!await allowAction("verify-email", `token:${token}`)) return { error: RATE_LIMIT_MESSAGE };
    const changed = await confirmEmailChange(token);
    if (!changed) return { error: "This link is invalid or expired. Request another in Settings." };
    redirect("/login?emailChanged=1");

  });
}
