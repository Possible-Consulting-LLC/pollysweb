"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { maintenanceTransaction } from '@/lib/maintenance-write';
import { prepareCredentialChange } from '@/lib/admin/maintenance-access';
import { withMutation, recordMutationSuccess } from '@/lib/mutation-boundary';

import type { Celebration } from "@/lib/care-progress";

import { allowAction, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { hashNewPassword, newPasswordSchema, validatePasswordChange, verifyPassword } from "@/lib/password-policy";
import { parseLocalDateInput } from "@/lib/utils";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { authSchema } from "@/lib/registration-validation";
import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireUser, getActionUser } from "@/lib/session";
import {
  DEFAULT_SPOOOD_AVATAR_SRC,
  isDefaultSpoodAvatar,
  normalizeTheme,
} from "@/lib/constants";
import { cleanupUnattachedUpload, saveImageUpload } from "@/lib/uploads";
import { runWithSpiderSlot } from "@/lib/spider-slots";
import { boundedText, optionalText, reminderInterval } from "@/lib/write-validation";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";
import { emailDeliveryAvailable } from "@/lib/email-delivery";
import { completeNewEmailRegistration, GENERIC_EMAIL_RESPONSE, issueEmailChallenge, verifyExistingEmail } from "@/lib/email-challenge";

function missingDatabaseHint() {
  if (!process.env.DATABASE_URL) {
    return "Database isn’t configured on this deploy. Add DATABASE_URL (and DIRECT_URL) in Vercel → Settings → Environment Variables, then Redeploy.";
  }
  return null;
}

export async function registerAction(
  _prev: { error?: string; success?: string; } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string; }> {
  return withMutation(formData, 'public-identity', 'registeraction', async () => {
    const parsed = z.object({ email: z.email(), name: z.string().max(120).optional() }).safeParse({
      email: formData.get("email"),
      name: formData.get("name") || undefined,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const dbHint = missingDatabaseHint();
    if (dbHint) return { error: dbHint };

    const email = parsed.data.email.trim().toLowerCase();
    if (!await allowAction("register", email)) return { error: RATE_LIMIT_MESSAGE };
    if (!emailDeliveryAvailable(email)) return { error: "Email verification isn’t available right now. Please try again later." };

    try {
      await issueEmailChallenge(email, parsed.data.name);
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("[register] email challenge failed", error);
      return { success: GENERIC_EMAIL_RESPONSE };
    }
    return { success: GENERIC_EMAIL_RESPONSE };

  });
}

export async function resendVerificationAction(_prev: { error?: string; success?: string; } | undefined, formData: FormData): Promise<{ error?: string; success?: string; }> {
  return withMutation(formData, 'public-identity', 'resendverificationaction', async () => {
    return registerAction(_prev, formData);

  });
}

export async function requestMyEmailVerificationAction(_prev: { error?: string; success?: string; } | undefined, _formData: FormData): Promise<{ error?: string; success?: string; }> {
  return withMutation(_formData, 'identity', 'requestmyemailverificationaction', async () => {
    void _prev;
    void _formData;
    const user = await getActionUser();
    if (!user?.id) return { error: "Please sign in again." };
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, passwordHash: true, emailVerified: true } });
    if (!account?.passwordHash || account.emailVerified) return { success: GENERIC_EMAIL_RESPONSE };
    if (!await allowAction("verify-email", account.email.toLowerCase())) return { error: RATE_LIMIT_MESSAGE };
    if (!emailDeliveryAvailable(account.email)) return { error: "Email verification isn’t available right now. Please try again later." };
    try {
      await issueEmailChallenge(account.email.toLowerCase());
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("[verify-email] signed-in request failed", error);
    }
    return { success: GENERIC_EMAIL_RESPONSE };

  });
}

export async function completeRegistrationAction(_prev: { error?: string; success?: string; } | undefined, formData: FormData): Promise<{ error?: string; success?: string; }> {
  return withMutation(formData, 'public-identity', 'completeregistrationaction', async () => {
    const token = String(formData.get("token") || "");
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirmPassword") || "");
    if (!await allowAction("register", `token:${token.slice(0, 50)}`)) return { error: RATE_LIMIT_MESSAGE };
    const parsed = newPasswordSchema.safeParse(password);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid password." };
    if (password !== confirm) return { error: "Passwords don’t match." };
    const email = await completeNewEmailRegistration(token, await hashNewPassword(password));
    if (!email) return { error: "This verification link is invalid or expired. Request a new one." };
    try {
      await signIn("credentials", { email, password, redirectTo: "/home" });
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      if (isRedirectError(error)) throw error;
      console.error("[verify-email] automatic sign-in failed", error);
      redirect("/login?created=1");
    }
    redirect("/home");

  });
}

export async function verifyExistingEmailAction(_prev: { error?: string; success?: string; } | undefined, formData: FormData): Promise<{ error?: string; success?: string; }> {
  return withMutation(formData, 'public-identity', 'verifyexistingemailaction', async () => {
    const token = String(formData.get("token") || "");
    if (!await allowAction("register", `token:${token.slice(0, 50)}`)) return { error: RATE_LIMIT_MESSAGE };
    const verified = await verifyExistingEmail(token);
    return verified ? { success: "Email verified. You can sign in now." } : { error: "This verification link is invalid or expired. Request a new one." };

  });
}

export async function loginAction(
  _prev: { error?: string; } | undefined,
  formData: FormData,
) {
  return withMutation(formData, 'authentication', 'loginaction', async () => {
    const dbHint = missingDatabaseHint();
    if (dbHint) return { error: dbHint };

    const parsed = authSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: "Enter a valid email and password." };
    }

    try {
      await signIn("credentials", {
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
        redirectTo: "/home",
      });
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      if (error instanceof AuthError) {
        return { error: "Those credentials didn’t match. If your email needs verification, use the link below." };
      }
      throw error;
    }

  });
}

export async function logoutAction() {
  const { stopTestSession } = await import("@/lib/admin/test-session-store");
  await stopTestSession();
  await signOut({ redirectTo: "/login" });
}

export async function createSpiderAction(
  _prev: { error?: string; } | undefined,
  formData: FormData,
): Promise<{ error?: string; redirectTo?: string; message?: string; celebrations?: Celebration[]; }> {
  return withMutation(formData, 'data', 'createspideraction', async () => {
    const user = await getActionUser();
    if (!user?.id) return { error: "Please sign in again." };
    const userId = user.id;
    if (!await allowAction("care", userId)) return { error: RATE_LIMIT_MESSAGE };

    const { getBillingProfile } = await import("@/lib/stripe");
    const billing = await getBillingProfile(user.id);
    if (!billing.canAddSpider) {
      return {
        error: `Free accounts include ${billing.freeLimit} active spood. Upgrade to Pro to add more — or memorialize a passed spood to free a slot.`,
      };
    }

    let textFields: {
      name: string;
      sex: string;
      species?: string;
      commonName?: string;
      instar?: string;
      source?: string;
      notes?: string;
      enclosureName?: string;
      enclosureType?: string;
      enclosureDimensions?: string;
    };
    try {
      textFields = {
        name: boundedText(formData.get("name"), "Name", 120),
        sex: boundedText(formData.get("sex") || "Unknown", "Sex", 120),
        species: optionalText(formData.get("species"), "Species", 120),
        commonName: optionalText(formData.get("commonName"), "Common name", 120),
        instar: optionalText(formData.get("instar"), "Instar", 120),
        source: optionalText(formData.get("source"), "Source", 120),
        notes: optionalText(formData.get("notes"), "Notes", 1000),
        enclosureName: optionalText(formData.get("enclosureName"), "Enclosure name", 120),
        enclosureType: optionalText(formData.get("enclosureType"), "Enclosure type", 120),
        enclosureDimensions: optionalText(formData.get("enclosureDimensions"), "Dimensions", 120),
      };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return { error: error instanceof Error ? error.message : "Invalid spood details." };
    }
    const { name, sex, species, commonName, instar, source, notes, enclosureName, enclosureType, enclosureDimensions } = textFields;
    if (!name) return { error: "Name is required." };
    const hatchDateRaw = String(formData.get("hatchDate") || "").trim();
    const acquisitionDateRaw = String(
      formData.get("acquisitionDate") || "",
    ).trim();

    const hatchDate = hatchDateRaw ? parseLocalDateInput(hatchDateRaw) : undefined;
    const acquisitionDate = acquisitionDateRaw ? parseLocalDateInput(acquisitionDateRaw) : new Date();
    if ((hatchDateRaw && !hatchDate) || !acquisitionDate) return { error: "Enter valid hatch and acquisition dates." };

    let profilePhoto = String(formData.get("profilePhoto") || "").trim();
    if (!isDefaultSpoodAvatar(profilePhoto)) {
      profilePhoto = DEFAULT_SPOOOD_AVATAR_SRC;
    }
    let uploadedUrl: string | null = null;

    const file = formData.get("photo");
    let photoSkipped = false;
    if (file instanceof File && file.size > 0) {
      const saved = await saveImageUpload(file, user.id);
      if ("error" in saved) {
        // Still create the spood — don't block the whole welcome on Storage hiccups.
        console.warn("[createSpider] photo upload failed; using default portrait", saved.error);
        photoSkipped = true;
        profilePhoto = DEFAULT_SPOOOD_AVATAR_SRC;
        uploadedUrl = null;
      } else {
        uploadedUrl = saved.url;
        profilePhoto = saved.url;
      }
    }

    const { baselineCelebrations, finishCareCelebrations } = await import("@/lib/care-celebrations");
    const baseline = await baselineCelebrations(userId);
    try {
      const result = await maintenanceTransaction((tx) => runWithSpiderSlot(tx, userId, () => tx.spider.create({
        data: {
          userId,
          name,
          sex,
          species,
          commonName,
          instar,
          source,
          notes,
          hatchDate,
          acquisitionDate,
          profilePhoto,
          enclosure: enclosureName
            ? {
              create: {
                name: enclosureName,
                type: enclosureType,
                dimensions: enclosureDimensions,
                setupDate: new Date(),
              },
            }
            : undefined,
          reminders: {
            create: [
              { userId, kind: "feeding", intervalDays: 3 },
              { userId, kind: "misting", intervalDays: 1 },
              { userId, kind: "cleaning", intervalDays: 14 },
            ],
          },
          photos: uploadedUrl
            ? {
              create: {
                url: uploadedUrl,
                kind: "profile",
                caption: `${name}'s welcome photo`,
                takenAt: new Date(),
              },
            }
            : undefined,
        },
      })), { isolationLevel: "ReadCommitted" });
      if (!result.ok) {
        if (uploadedUrl) await cleanupUnattachedUpload(uploadedUrl, userId);
        return {
          error: `Free accounts include ${result.freeLimit} active spood. Upgrade to Pro to add more — or memorialize a passed spood to free a slot.`,
        };
      }
      const spider = result.value;

      revalidatePath("/home");
      revalidatePath("/spoods");
      return { redirectTo: `/spoods/${spider.id}${photoSkipped ? "?photo=skipped" : ""}`, message: `${name} has joined your collection!`, celebrations: await finishCareCelebrations(userId, baseline) };
    } catch (error) {
      if (isRedirectError(error)) throw error;
      if (uploadedUrl) await cleanupUnattachedUpload(uploadedUrl, userId);
      if (error instanceof MaintenanceError) throw error;
      console.error("[createSpider] failed", error);
      return {
        error:
          "Couldn’t save that spood. Please try again — if you uploaded a photo, try a default portrait first.",
      };
    }

  });
}

export async function updateSettingsAction(formData: FormData) {
  return withMutation(formData, 'data', 'updatesettingsaction', async () => {
    const user = await requireUser();
    if (!await allowAction("care", user.id!)) redirect("/settings?error=rate-limit");
    const { normalizeTimeZone } = await import("@/lib/utils");
    const timezone = normalizeTimeZone(String(formData.get("timezone") || ""));
    let name: string;
    let feedDefaultDays: number;
    let mistDefaultDays: number;
    try {
      name = boundedText(formData.get("name") || user.name, "Display name", 120);
      feedDefaultDays = reminderInterval(formData.get("feedDefaultDays") ?? "3", "Feeding");
      mistDefaultDays = reminderInterval(formData.get("mistDefaultDays") ?? "1", "Misting");
    } catch {
      redirect("/settings?error=invalid-settings");
    }

    await maintenanceTransaction(tx => tx.user.update({
      where: { id: user.id! },
      data: {
        name,
        timezone,
        theme: normalizeTheme(String(formData.get("theme") || "cosmic")),
        feedDefaultDays,
        mistDefaultDays,
      },
    }));

    revalidatePath("/", "layout");
    revalidatePath("/settings");
    revalidatePath("/home");
    revalidatePath("/activity");
    await recordMutationSuccess("updatesettingsaction");
    redirect("/settings?saved=1");

  });
}

export async function updatePasswordAction(
  _prev: { error?: string; success?: string; } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string; }> {
  return withMutation(formData, 'identity', 'updatepasswordaction', async () => {
    const user = await getActionUser();
    if (!user?.id) return { error: "Please sign in again." };

    if (!await allowAction("password", user.id)) return { error: RATE_LIMIT_MESSAGE };

    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    const validationError = validatePasswordChange(currentPassword, newPassword, confirmPassword);
    if (validationError) return { error: validationError };

    try {
      const record = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      });
      if (!record) return { error: "Account not found." };
      if (!record.passwordHash) {
        return { error: "This account uses social sign-in and has no password to change. Please continue signing in with your provider." };
      }

      const valid = await verifyPassword(currentPassword, record.passwordHash);
      if (!valid) return { error: "Current password is incorrect." };

      const passwordHash = await hashNewPassword(newPassword);
      const changed = await maintenanceTransaction(async tx => {
        await prepareCredentialChange(tx, user.id!);
        return tx.user.updateMany({
          where: { id: user.id!, passwordHash: record.passwordHash },
          data: { passwordHash },
        });
      });
      if (changed.count !== 1) return { error: "Your password changed during this request. Please sign in again." };

      return { success: "Password updated. Please sign in again on each device." };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("[updatePassword] failed", error);
      return { error: "Couldn’t update your password. Try again." };
    }

  });
}
