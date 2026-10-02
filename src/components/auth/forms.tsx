"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { completeRegistrationAction, loginAction, registerAction, resendVerificationAction, verifyExistingEmailAction } from "@/app/actions/auth";
import { confirmEmailChangeAction } from "@/app/actions/email-change";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SocialButtons } from "@/components/auth/social-buttons";
import { startSocialSignIn } from "@/app/actions/social-auth";
import type { SocialProviderId } from "@/lib/social-auth";

/** Login/register hero logo — half the previous oversized max-width. */
function AuthBrand({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <BrandLogo
        href="/"
        size="hero"
        priority
        className="max-w-[22.5rem] sm:max-w-[25.5rem]"
      />
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--plum)]/70">
        {eyebrow}
      </p>
      <p className="mt-2 max-w-xs text-sm text-[var(--midnight)]/65">
        Your little corner of the web.
      </p>
      <p className="mt-2 text-xs font-semibold tracking-wide text-[var(--plum)]">
        Track. Care. Celebrate.
      </p>
    </div>
  );
}

function AuthShell({
  brand,
  children,
  footer,
}: {
  brand: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[52rem] flex-col justify-center px-4 py-8">
      {brand}
      <div className="mx-auto w-full max-w-md">
        {children}
        {footer}
        <nav className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-[var(--midnight)]/65" aria-label="Legal information">
          <Link href="/privacy" className="hover:text-[var(--plum)]">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[var(--plum)]">Terms &amp; Conditions</Link>
        </nav>
      </div>
    </div>
  );
}

export function LoginForm({ providers = [], socialError, accountCreated = false, emailChanged = false }: { providers?: SocialProviderId[]; socialError?: string | null; accountCreated?: boolean; emailChanged?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <AuthShell
      brand={<AuthBrand eyebrow="Welcome back" />}
      footer={
        <p className="mt-5 text-center text-sm text-[var(--midnight)]/65">
          New here?{" "}
          <Link href="/register" className="font-semibold text-[var(--plum)]">
            Create an account
          </Link>
        </p>
      }
    >
      <MutationForm action={action} result={state} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]"><MutationContextInput />
        {accountCreated ? <p className="rounded-2xl bg-[var(--plum)]/10 px-3 py-2 text-sm text-[var(--midnight)]" role="status">Your account is ready. Please sign in.</p> : null}
        {emailChanged ? <p className="rounded-2xl bg-[var(--plum)]/10 px-3 py-2 text-sm text-[var(--midnight)]" role="status">Your new email is confirmed. Sign in again with your new address or connected provider.</p> : null}
        {socialError ? <p className="rounded-2xl bg-rose-100 px-3 py-2 text-sm text-rose-800" role="alert">{socialError}</p> : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} />
        </Field>
        {state?.error ? (
          <p className="text-sm text-rose-700" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-sm"><Link href="/verify-email" className="font-semibold text-[var(--plum)]">Need to verify your email?</Link></p>
      </MutationForm>
      <SocialButtons providers={providers} mode="continue" action={startSocialSignIn} />
    </AuthShell>
  );
}

export function RegisterForm({ providers = [], socialError }: { providers?: SocialProviderId[]; socialError?: string | null }) {
  const [state, action, pending] = useActionState(registerAction, undefined);

  return (
    <AuthShell
      brand={<AuthBrand eyebrow="Join the web" />}
      footer={
        <p className="mt-5 text-center text-sm text-[var(--midnight)]/65">
          Already have a corner?{" "}
          <Link href="/login" className="font-semibold text-[var(--plum)]">
            Sign in
          </Link>
        </p>
      }
    >
      <MutationForm action={action} result={state} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]"><MutationContextInput />
        {socialError ? <p className="rounded-2xl bg-rose-100 px-3 py-2 text-sm text-rose-800" role="alert">{socialError}</p> : null}
        <Field label="Display name" htmlFor="name">
          <Input id="name" name="name" placeholder="Keeper name" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        {state?.error ? (
          <p className="text-sm text-rose-700" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.success ? <p className="text-sm text-[var(--plum)]" role="status">{state.success}</p> : null}
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? "Sending…" : "Send verification link"}
        </Button>
      </MutationForm>
      <SocialButtons providers={providers} mode="continue" action={startSocialSignIn} />
    </AuthShell>
  );
}

export function VerifyEmailForm({ token, purpose }: { token?: string; purpose?: string }) {
  const [resendState, resendAction, resendPending] = useActionState(resendVerificationAction, undefined);
  const [createState, createAction, createPending] = useActionState(completeRegistrationAction, undefined);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyExistingEmailAction, undefined);
  const [changeState, changeAction, changePending] = useActionState(confirmEmailChangeAction, undefined);
  return <AuthShell brand={<AuthBrand eyebrow="Verify your email" />} footer={<p className="mt-5 text-center text-sm"><Link href="/login" className="font-semibold text-[var(--plum)]">Back to sign in</Link></p>}>
    {token && purpose === "register" ? <MutationForm action={createAction} result={createState} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5"><MutationContextInput />
      <p className="text-sm">Your email link is valid. Choose a password to finish creating your account.</p>
      <input type="hidden" name="token" value={token} />
      <Field label="Password" htmlFor="newPassword" hint="15–128 characters. Passphrases and spaces are welcome."><Input id="newPassword" name="password" type="password" autoComplete="new-password" required /></Field>
      <Field label="Confirm password" htmlFor="confirmPassword"><Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required /></Field>
      {createState?.error ? <p role="alert" className="text-sm text-rose-700">{createState.error}</p> : null}
      <Button type="submit" className="w-full" disabled={createPending}>{createPending ? "Creating…" : "Create account"}</Button>
    </MutationForm> : token && purpose === "legacy" ? <MutationForm action={verifyAction} result={verifyState} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5"><MutationContextInput />
      <p className="text-sm">Confirm that this email belongs to your account.</p>
      <input type="hidden" name="token" value={token} />
      {verifyState?.error ? <p role="alert" className="text-sm text-rose-700">{verifyState.error}</p> : null}
      {verifyState?.success ? <p role="status" className="text-sm text-[var(--plum)]">{verifyState.success}</p> : null}
      <Button type="submit" className="w-full" disabled={verifyPending}>{verifyPending ? "Verifying…" : "Verify email"}</Button>
    </MutationForm> : token && purpose === "email-change" ? <MutationForm action={changeAction} result={changeState} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5"><MutationContextInput />
      <p className="text-sm">Confirm this as the new email for your Polly&apos;s Web account. You will sign in again afterward.</p>
      <input type="hidden" name="token" value={token} />
      {changeState?.error ? <p role="alert" className="text-sm text-rose-700">{changeState.error}</p> : null}
      <Button type="submit" className="w-full" disabled={changePending}>{changePending ? "Confirming…" : "Confirm new email"}</Button>
    </MutationForm> : <p className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 text-sm">Enter your email below to request a verification link.</p>}
    {purpose === "email-change" ? <p className="mt-4 text-center text-sm">Need another link? <Link href="/settings" className="font-semibold text-[var(--plum)]">Return to Settings</Link>.</p> : <MutationForm action={resendAction} result={resendState} className="mt-4 space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5"><MutationContextInput />
      <Field label="Email" htmlFor="resendEmail"><Input id="resendEmail" name="email" type="email" autoComplete="email" required /></Field>
      {resendState?.error ? <p role="alert" className="text-sm text-rose-700">{resendState.error}</p> : null}
      {resendState?.success ? <p role="status" className="text-sm text-[var(--plum)]">{resendState.success}</p> : null}
      <Button type="submit" className="w-full" disabled={resendPending}>{resendPending ? "Sending…" : "Send a new link"}</Button>
    </MutationForm>}
  </AuthShell>;
}
