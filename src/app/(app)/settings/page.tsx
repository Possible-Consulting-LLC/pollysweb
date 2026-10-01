import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { requireAdminActor } from '@/lib/admin/actor';
import Link from "next/link";
import { DisconnectProviderForm } from "@/components/settings/disconnect-provider-form";
import { remainingSignInAvailable, recentSocialAuthentication } from "@/lib/social-disconnect-policy";
import { logoutAction, updateSettingsAction, updateThemeAction } from "@/app/actions/auth";
import { AppHeader } from "@/components/layout/nav";
import { PasswordForm } from "@/components/settings/password-form";
import { SocialButtons } from "@/components/auth/social-buttons";
import { linkSocialProvider } from "@/app/actions/social-auth";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { TimezoneSelect } from "@/components/ui/datetime-field";
import { FREE_SPIDER_LIMIT } from "@/lib/billing";
import { needsBillingRecovery } from "@/lib/billing-policy";
import { normalizeTheme } from "@/lib/constants";
import { getBillingProfile } from "@/lib/stripe";
import { getUserDefaults } from "@/lib/spiders";
import { requireUserContext } from "@/lib/session";
import { prisma } from "@/lib/db";
import { configuredSocialProviders, type SocialProviderId } from "@/lib/social-auth";
import { socialErrorMessage } from "@/lib/social-error";
import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { EmailChangeForm } from "@/components/settings/email-change-form";
import { legacyVerificationDeadline } from "@/lib/email-verification";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; linked?: string; error?: string }>;
}) {
  const { user, identity } = await requireUserContext();
  const testingAs = Boolean(identity.testSessionId);
  const adminAccess = await requireAdminActor('admin').then(() => true).catch(() => false);
  const [defaults, billing, account, linkedAccounts] = await Promise.all([
    getUserDefaults(user.id!),
    getBillingProfile(user.id!),
    prisma.user.findUnique({ where: { id: user.id! }, select: { passwordHash: true, emailVerified: true } }),
    prisma.account.findMany({ where: { userId: user.id! }, select: { provider: true } }),
  ]);
  const params = searchParams ? await searchParams : {};
  const saved = params.saved === "1";
  const theme = normalizeTheme(defaults.theme);
  const providers = configuredSocialProviders(process.env);
  const linkedProviderIds = new Set(linkedAccounts.map((linked) => linked.provider));
  const connectableProviders = providers.filter((provider) => !linkedProviderIds.has(provider));
  const providerNames: Record<SocialProviderId, string> = { google: "Google", apple: "Apple", facebook: "Facebook" };
  const errorMessage = socialErrorMessage(params.error);
  const settingsError = params.error === "rate-limit"
    ? "Too many changes right now. Please try again later."
    : params.error === "invalid-settings"
      ? "Use a display name under 120 characters and reminder intervals from 1 to 365 whole days."
      : null;
  const now = new Date();
  const verificationDeadline = account
    ? legacyVerificationDeadline(account, now, process.env.PASSWORD_EMAIL_VERIFICATION_GRACE_START)
    : null;

  return (
    <div className="space-y-6">
      <AppHeader title="Settings" subtitle="Tune your little corner." />
      {adminAccess ? <Link href="/admin" className="block rounded-2xl bg-[var(--lavender)]/50 p-4 font-semibold">Administration</Link> : null}

      {!testingAs && verificationDeadline ? <EmailVerificationNotice deadline={new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" }).format(verificationDeadline) + " UTC"} /> : null}

      <Card className="space-y-3">
        <SectionHeader title="Plan" />
        <p className="text-sm text-[var(--midnight)]/75">
          You’re on <span className="font-semibold capitalize">{billing.plan}</span>
          {" · "}
          {billing.spiderCount}
          {billing.plan === "free"
            ? ` / ${FREE_SPIDER_LIMIT} active free`
            : " active · unlimited"}
          {billing.memorialCount
            ? ` · ${billing.memorialCount} in memory`
            : ""}
        </p>
        {billing.isDemo ? <p>This demo uses the {billing.plan} test plan. Real billing is disabled.</p> : <Link href="/upgrade" className={buttonVariants({ variant: "soft", className: "w-full" })}>
          {needsBillingRecovery(billing.stripeCustomerId, billing.stripeSubscriptionId, billing.subscriptionStatus)
              ? billing.subscriptionStatus === "past_due" || billing.subscriptionStatus === "unpaid" ? "Fix billing" : "Manage billing"
              : billing.plan === "pro" ? "Manage billing" : "Upgrade to Pro"}
        </Link>}
      </Card>

      <Card>
        <SectionHeader title="Profile" />
        {settingsError ? <p className="mb-4 rounded-2xl bg-rose-100 px-3 py-2 text-sm text-rose-800" role="alert">{settingsError}</p> : null}
        {saved ? (
          <p
            className="mb-4 rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm text-[var(--midnight)]"
            role="status"
          >
            Settings saved.
          </p>
        ) : null}
        <MutationForm action={updateSettingsAction} className="space-y-4"><MutationContextInput />
          <Field label="Display name" htmlFor="name">
            <Input id="name" name="name" maxLength={120} defaultValue={defaults.name ?? ""} />
          </Field>
          <SectionHeader title="Care reminder defaults" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Feeding (days)" htmlFor="feedDefaultDays">
              <Input
                id="feedDefaultDays"
                name="feedDefaultDays"
                type="number"
                min={1}
                max={365}
                defaultValue={defaults.feedDefaultDays}
              />
            </Field>
            <Field label="Misting (days)" htmlFor="mistDefaultDays">
              <Input
                id="mistDefaultDays"
                name="mistDefaultDays"
                type="number"
                min={1}
                max={365}
                defaultValue={defaults.mistDefaultDays}
              />
            </Field>
          </div>
          <TimezoneSelect defaultValue={defaults.timezone} />
          <ThemeToggle key={theme} theme={theme} action={updateThemeAction} />

          <Button type="submit" className="w-full">
            Save settings
          </Button>
        </MutationForm>
      </Card>

      {!testingAs ? <>
      <Card className="space-y-3">
        <SectionHeader title="Change email" subtitle="Confirm a new address before it becomes your login email." />
        <EmailChangeForm
          currentEmail={defaults.email}
          hasPassword={Boolean(account?.passwordHash)}
          linkedProviders={linkedAccounts.map((linked) => linked.provider).filter((provider): provider is SocialProviderId =>
            provider === "google" || provider === "apple" || provider === "facebook")}
          recentlyAuthenticated={typeof user.emailChangeReauthAt === "number" && user.emailChangeReauthAt <= now.getTime() && now.getTime() - user.emailChangeReauthAt <= 5 * 60_000}
        />
      </Card>

      <Card className="space-y-3">
        <SectionHeader title="Sign-in methods" subtitle="Connect a provider to reach the same spoods and subscription." />
        {params.linked === "1" && linkedAccounts.length > 0 ? (
          <p className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm text-[var(--midnight)]" role="status">
            Sign-in method connected.
          </p>
        ) : null}
        {errorMessage ? <p className="rounded-2xl bg-rose-100 px-3 py-2 text-sm text-rose-800" role="alert">{errorMessage}</p> : null}
        <p className="text-sm text-[var(--midnight)]/75">
          {account?.passwordHash ? "Email and password are available." : "This account uses a connected provider to sign in."}
        </p>
        {linkedAccounts.length > 0 ? (
          <ul className="space-y-1 text-sm text-[var(--midnight)]/85">
            {linkedAccounts.map((linked) => (
              <li key={linked.provider} className="flex items-center justify-between rounded-xl bg-[var(--hover)] px-3 py-2">
                <DisconnectProviderForm
                  provider={linked.provider as SocialProviderId}
                  label={providerNames[linked.provider as SocialProviderId] ?? linked.provider}
                  canDisconnect={remainingSignInAvailable(linked.provider, [...linkedProviderIds], providers, Boolean(account?.passwordHash && account.emailVerified))}
                  hasPassword={Boolean(account?.passwordHash)}
                  recentlyAuthenticated={recentSocialAuthentication(user.emailChangeReauthAt)}
                  reauthProvider={providers.find(provider => linkedProviderIds.has(provider) && provider !== linked.provider)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <SocialButtons providers={connectableProviders} mode="link" action={linkSocialProvider} />
        <p className="text-sm text-[var(--midnight)]/75">Disconnecting removes the sign-in link in Spoodly Space. You can also revoke consent in your Google or Facebook account settings. For Facebook-provided data removal, see <Link href="/legal/data-deletion" className="underline">data deletion</Link>.</p>
      </Card>

      <Card>
        {account?.passwordHash ? (
          <>
            <SectionHeader title="Password" subtitle="Choose a new password for this account." />
            <PasswordForm />
          </>
        ) : (
          <>
            <SectionHeader title="Password" />
            <p className="text-sm text-[var(--midnight)]/75">Your account has no password to change. Continue using your connected provider to sign in.</p>
          </>
        )}
      </Card>
      </> : <Card className="space-y-2">
        <SectionHeader title="Account sign-in settings" />
        <p className="text-sm text-[var(--midnight)]/75">Account sign-in settings are unavailable while testing as a demo. Return to admin to manage your own email, providers, or password.</p>
      </Card>}

      <form action={logoutAction}><MutationContextInput />
        <Button type="submit" variant="danger" className="w-full">
          Sign out
        </Button>
      </form>
      <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-[var(--midnight)]/65" aria-label="Legal information">
        <Link href="/privacy" className="hover:text-[var(--plum)]">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-[var(--plum)]">Terms &amp; Conditions</Link>
      </nav>
    </div>
  );
}
