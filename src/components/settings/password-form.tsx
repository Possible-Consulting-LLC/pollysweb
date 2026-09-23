"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { useActionState, useEffect, useRef } from "react";
import { updatePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function PasswordForm() {
  const [state, action, pending] = useActionState(
    updatePasswordAction,
    undefined as { error?: string; success?: string } | undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <MutationForm ref={formRef} action={action} result={state} className="space-y-4"><MutationContextInput />
      <Field label="Current password" htmlFor="currentPassword">
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
        />
      </Field>
      <Field label="New password" htmlFor="newPassword" hint="15–128 characters. Passphrases and spaces are welcome.">
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>
      {state?.error ? (
        <p className="text-sm text-rose-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p
          className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm text-[var(--midnight)]"
          role="status"
        >
          {state.success}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </MutationForm>
  );
}
