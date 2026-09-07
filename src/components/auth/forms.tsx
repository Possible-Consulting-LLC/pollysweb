"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function BrandHero({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="relative mb-8 overflow-hidden rounded-[2rem] bg-[var(--panel)] px-6 py-10 text-[var(--on-panel)]">
      <div className="orbit-ring pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border border-[var(--gold)]/30" />
      <div className="orbit-ring pointer-events-none absolute -bottom-16 left-6 h-48 w-48 rounded-full border border-[var(--lavender)]/25" style={{ animationDuration: "70s" }} />
      <span className="animate-twinkle absolute right-10 top-8 text-[var(--gold)]">✦</span>
      <span className="animate-twinkle absolute bottom-10 left-8 text-[var(--star)]" style={{ animationDelay: "1s" }}>
        ✧
      </span>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--star)]">
        {eyebrow}
      </p>
      <h1 className="animate-float mt-3 font-[family-name:var(--font-display)] text-4xl leading-none">
        Spoodly Space
      </h1>
      <p className="mt-3 max-w-xs text-sm text-[var(--on-panel)]/75">
        Your little corner of the web.
      </p>
      <p className="mt-4 text-xs font-semibold tracking-wide text-[var(--gold)]">
        Track. Care. Celebrate.
      </p>
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <BrandHero eyebrow="Welcome back" />
      <form action={action} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-5 shadow-[0_8px_30px_var(--shadow)]">
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
      </form>
      <p className="mt-5 text-center text-sm text-[var(--midnight)]/65">
        New here?{" "}
        <Link href="/register" className="font-semibold text-[var(--plum)]">
          Create an account
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-[var(--midnight)]/45">
        Demo: demo@spoodly.space / spoodly123
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <BrandHero eyebrow="Join the web" />
      <form action={action} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-5 shadow-[0_8px_30px_var(--shadow)]">
        <Field label="Display name" htmlFor="name">
          <Input id="name" name="name" placeholder="Keeper name" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 6 characters">
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={6} />
        </Field>
        {state?.error ? (
          <p className="text-sm text-rose-700" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-[var(--midnight)]/65">
        Already have a corner?{" "}
        <Link href="/login" className="font-semibold text-[var(--plum)]">
          Sign in
        </Link>
      </p>
    </div>
  );
}
