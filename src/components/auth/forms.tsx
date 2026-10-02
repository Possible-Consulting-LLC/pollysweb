"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Heart,
  Users,
} from "lucide-react";import { completeRegistrationAction, loginAction, registerAction, resendVerificationAction, verifyExistingEmailAction } from "@/app/actions/auth";
import { confirmEmailChangeAction } from "@/app/actions/email-change";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SocialButtons } from "@/components/auth/social-buttons";
import { startSocialSignIn } from "@/app/actions/social-auth";
import type { SocialProviderId } from "@/lib/social-auth";

/** Marketing panel for the split layout (desktop): brand, pitch, and the
 * three benefit rows from the sign-up/in mockup. */
function AuthPanel({ variant }: { variant: "login" | "register" }) {
  const config = variant === "login"
    ? {
        eyebrow: "Welcome back",
        title: ["Good to", "see you!"],
        pitch: "Log in to your Polly's Web account and get back to your spoods.",
        benefits: [
          { icon: BarChart3, iconClass: "bg-orange-100 text-orange-500", title: "Pick up where you left off", body: "Your spoods, logs, and notes" },
          { icon: BookOpen, iconClass: "bg-[var(--lavender)]/70 text-[var(--plum)]", title: "More spood knowledge", body: "Care guides, tips, and resources" },
          { icon: Users, iconClass: "bg-pink-100 text-pink-500", title: "A growing community", body: "Because spood people are the best people" },
        ],
        note: "Same Spoods. More Joy.",
      }
    : {
        eyebrow: "Welcome to",
        title: ["Polly's Web"],
        pitch: "Create your free account and start your spoods' journey today.",
        benefits: [
          { icon: Heart, iconClass: "bg-[var(--lavender)]/70 text-[var(--plum)]", title: "Track care & milestones", body: "Feeding, molts, enclosures and more" },
          { icon: BookOpen, iconClass: "bg-sky-100 text-sky-600", title: "Access expert care guides", body: "Species info, tips and best practices" },
          { icon: Users, iconClass: "bg-pink-100 text-pink-500", title: "Build your spood community", body: "Share, learn, and get inspired" },
        ],
        note: "Small Spoods, Brighter Days",
      };

  return (
    <div className="hidden lg:flex lg:flex-col">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--plum)]/80">{config.eyebrow}</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.02em] text-[var(--plum-deep)]">
        {config.title.map((line) => (
          <span key={line} className="block">
            {line}
            {line === config.title[config.title.length - 1] ? <Heart className="ml-2 inline h-8 w-8 text-orange-500" aria-hidden /> : null}
          </span>
        ))}
      </h1>
      <p className="mt-4 max-w-sm text-lg leading-8 text-[var(--midnight)]/70">{config.pitch}</p>
      <ul className="mt-8 space-y-6">
        {config.benefits.map(({ icon: Icon, iconClass, title, body }) => (
          <li key={title} className="flex items-start gap-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-bold text-[var(--midnight)]">{title}</span>
              <span className="mt-0.5 block text-sm text-[var(--midnight)]/60">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <p aria-hidden className="mt-auto pt-8 font-[family-name:var(--font-display)] text-lg italic text-[var(--plum)]/80">
        {config.note} ♡
      </p>
    </div>
  );
}

function AuthShell({
  variant,
  children,
  footer,
}: {
  variant: "login" | "register";
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="theme-light mx-auto flex min-h-dvh w-full flex-col bg-gradient-to-br from-[var(--lavender)]/30 via-[var(--cream)] to-orange-100/25">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <BrandLogo href="/" size="hero" priority className="max-w-52" />
        <nav aria-label="Sign in or create an account" className="flex items-center gap-2">
          <Link
            href="/login"
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${variant === "login" ? "text-[var(--plum)] underline decoration-2 underline-offset-4" : "text-[var(--midnight)]/70 hover:bg-[var(--hover)]"}`}
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${variant === "register" ? "bg-[var(--plum)] text-[var(--on-accent)]" : "bg-[var(--plum)] text-[var(--on-accent)] opacity-90 hover:opacity-100"}`}
          >
            Sign Up
          </Link>
        </nav>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-16 pt-6 sm:px-8 lg:grid-cols-[1fr_26rem]">
        <AuthPanel variant={variant} />
        <div>
          {/* Mobile brand header (panel is hidden below lg) */}
          <div className="mb-6 text-center lg:hidden">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--plum)]/70">
              {variant === "login" ? "Welcome back" : "Welcome to"}
            </p>
          </div>
          {children}
          {footer}
          <nav className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-[var(--midnight)]/65" aria-label="Legal information">
            <Link href="/legal/privacy-policy" className="hover:text-[var(--plum)]">Privacy Policy</Link>
            <Link href="/legal/terms-of-service" className="hover:text-[var(--plum)]">Terms &amp; Conditions</Link>
            <Link href="/contact" className="hover:text-[var(--plum)]">Contact</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}

export function LoginForm({ providers = [], socialError, accountCreated = false, emailChanged = false }: { providers?: SocialProviderId[]; socialError?: string | null; accountCreated?: boolean; emailChanged?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <AuthShell
      variant="login"
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
      variant="register"
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
  return <AuthShell variant="login" footer={<p className="mt-5 text-center text-sm"><Link href="/login" className="font-semibold text-[var(--plum)]">Back to sign in</Link></p>}>
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
