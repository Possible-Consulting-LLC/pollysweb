"use server";

import type { MutationFailure } from '@/lib/mutation-failure';

import { withMutation } from '@/lib/mutation-boundary';

import { signIn, signOut } from "@/lib/auth";
import { getActionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { configuredSocialProviders, type SocialProviderId } from "@/lib/social-auth";
import { redirect } from "next/navigation";

function allowedProvider(formData: FormData): SocialProviderId | null {
  const requested = formData.get("provider");
  if (typeof requested !== "string") return null;
  const available = configuredSocialProviders(process.env);
  return available.find((provider) => provider === requested) ?? null;
}

export async function startSocialSignIn(formData: FormData): Promise<void | MutationFailure> {
  return withMutation(formData, 'authentication', 'startsocialsignin', async () => {
    const provider = allowedProvider(formData);
    if (!provider) redirect("/login?error=Configuration");
    // A normal sign-in must never be interpreted by Auth.js as permission to
    // attach this provider to whichever keeper session happens to be present.
    await signOut({ redirect: false });
    await signIn(provider, { redirectTo: "/home" });

  });
}

export async function linkSocialProvider(formData: FormData): Promise<void | MutationFailure> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('settings.social.link', () => withMutation(formData, 'identity', 'linksocialprovider', async () => {
    const user = await getActionUser();
    if (!user?.id) redirect("/login?error=SessionRequired");
    const provider = allowedProvider(formData);
    if (!provider) redirect("/settings?error=Configuration");
    const { clearAdminSocialChallenge } = await import("@/lib/admin/reauth-store");
    await clearAdminSocialChallenge();
    await signIn(provider, { redirectTo: "/settings?linked=1" });

  }));
}

export async function reauthenticateForEmailChange(formData: FormData): Promise<void | MutationFailure> {
  const { withFeatureGate } = await import("@/lib/features/gate");
  return withFeatureGate('settings.email.change', () => withMutation(formData, 'identity', 'reauthenticateforemailchange', async () => {
    const user = await getActionUser();
    if (!user?.id) redirect("/login?error=SessionRequired");
    const provider = allowedProvider(formData);
    if (!provider) redirect("/settings?error=Configuration");
    const linked = await prisma.account.findFirst({ where: { userId: user.id, provider }, select: { id: true } });
    if (!linked) redirect("/settings?error=SessionRequired");
    const { clearAdminSocialChallenge } = await import("@/lib/admin/reauth-store");
    await clearAdminSocialChallenge();
    await signIn(provider, { redirectTo: "/settings?reauth=1" }, provider === "google" ? { prompt: "select_account" } : undefined);

  }));
}
