"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireUser, getActionUser } from "@/lib/session";
import {
  DEFAULT_SPOOOD_AVATAR_SRC,
  isDefaultSpoodAvatar,
  normalizeTheme,
} from "@/lib/constants";
import { saveImageUpload } from "@/lib/uploads";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().optional(),
});

function missingDatabaseHint() {
  if (!process.env.DATABASE_URL) {
    return "Database isn’t configured on this deploy. Add DATABASE_URL (and DIRECT_URL) in Vercel → Settings → Environment Variables, then Redeploy.";
  }
  return null;
}

export async function registerAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const dbHint = missingDatabaseHint();
  if (dbHint) return { error: dbHint };

  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return { error: "An account with that email already exists." };

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: parsed.data.name || email.split("@")[0],
      },
    });
  } catch (error) {
    console.error("[register] database error", error);
    return {
      error:
        "Couldn’t save your account to the database. Check DATABASE_URL on Vercel and that the User table exists.",
    };
  }

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/home",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try logging in." };
    }
    throw error;
  }
}

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
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
    if (error instanceof AuthError) {
      return { error: "Those credentials didn’t match. Try again?" };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function createSpiderAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await getActionUser();
  if (!user?.id) return { error: "Please sign in again." };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const sex = String(formData.get("sex") || "Unknown");
  const species = (formData.get("species") as string) || undefined;
  const commonName = (formData.get("commonName") as string) || undefined;
  const instar = (formData.get("instar") as string) || undefined;
  const source = (formData.get("source") as string) || undefined;
  const notes = (formData.get("notes") as string) || undefined;
  const hatchDateRaw = String(formData.get("hatchDate") || "").trim();
  const acquisitionDateRaw = String(
    formData.get("acquisitionDate") || "",
  ).trim();

  const enclosureName =
    String(formData.get("enclosureName") || "").trim() || undefined;
  const enclosureType =
    String(formData.get("enclosureType") || "").trim() || undefined;
  const enclosureDimensions =
    String(formData.get("enclosureDimensions") || "").trim() || undefined;

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

  try {
    const spider = await prisma.spider.create({
      data: {
        userId: user.id,
        name,
        sex,
        species,
        commonName,
        instar,
        source,
        notes,
        hatchDate: hatchDateRaw ? new Date(hatchDateRaw) : undefined,
        acquisitionDate: acquisitionDateRaw
          ? new Date(acquisitionDateRaw)
          : new Date(),
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
            { userId: user.id, kind: "feeding", intervalDays: 3 },
            { userId: user.id, kind: "misting", intervalDays: 1 },
            { userId: user.id, kind: "cleaning", intervalDays: 14 },
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
    });

    revalidatePath("/home");
    revalidatePath("/spoods");
    redirect(
      `/spoods/${spider.id}${photoSkipped ? "?photo=skipped" : ""}`,
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[createSpider] failed", error);
    return {
      error:
        "Couldn’t save that spood. Please try again — if you uploaded a photo, try a default portrait first.",
    };
  }
}

export async function updateSettingsAction(formData: FormData) {
  const user = await requireUser();

  await prisma.user.update({
    where: { id: user.id! },
    data: {
      name: String(formData.get("name") || user.name || ""),
      dateFormat: String(formData.get("dateFormat") || "MMM d, yyyy"),
      measurement: String(formData.get("measurement") || "imperial"),
      theme: normalizeTheme(String(formData.get("theme") || "cosmic")),
      feedDefaultDays: Number(formData.get("feedDefaultDays") || 3),
      mistDefaultDays: Number(formData.get("mistDefaultDays") || 1),
      cleanDefaultDays: Number(formData.get("cleanDefaultDays") || 14),
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/home");
  redirect("/settings?saved=1");
}

export async function updatePasswordAction(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const user = await getActionUser();
  if (!user?.id) return { error: "Please sign in again." };

  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (currentPassword.length < 6 || newPassword.length < 6) {
    return { error: "Passwords must be at least 6 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New passwords don’t match." };
  }
  if (currentPassword === newPassword) {
    return { error: "Pick a new password that’s different from the current one." };
  }

  try {
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!record) return { error: "Account not found." };

    const valid = await bcrypt.compare(currentPassword, record.passwordHash);
    if (!valid) return { error: "Current password is incorrect." };

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return { success: "Password updated." };
  } catch (error) {
    console.error("[updatePassword] failed", error);
    return { error: "Couldn’t update your password. Try again." };
  }
}
