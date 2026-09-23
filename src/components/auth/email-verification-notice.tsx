"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { useActionState } from "react";
import { requestMyEmailVerificationAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function EmailVerificationNotice({ deadline }: { deadline: string }) {
  const [state, action, pending] = useActionState(requestMyEmailVerificationAction, undefined);
  return <section className="space-y-3 rounded-2xl border border-[var(--gold)]/60 bg-[var(--card-solid)] p-4" aria-label="Verify your email">
    <h2 className="font-semibold text-[var(--midnight)]">Verify your email</h2>
    <p className="text-sm text-[var(--midnight)]/80">Please verify your email by {deadline} to keep using your password to sign in.</p>
    <MutationForm action={action} result={state}><MutationContextInput /><Button type="submit" size="sm" disabled={pending}>{pending ? "Sending…" : "Send verification link"}</Button></MutationForm>
    {state?.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
    {state?.success ? <p role="status" className="text-sm text-[var(--plum)]">{state.success}</p> : null}
  </section>;
}
