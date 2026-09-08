"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function AuthBrand({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <BrandLogo href={null} size="hero" priority className="max-w-[15rem] sm:max-w-[17rem]" />
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

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <AuthBrand eyebrow="Welcome back" />
      <form action={action} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]">
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
    </div>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <AuthBrand eyebrow="Join the web" />
      <form action={action} className="space-y-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]">
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
