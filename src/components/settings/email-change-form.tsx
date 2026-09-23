"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { useActionState } from "react";
import { requestEmailChangeAction } from "@/app/actions/email-change";
import { reauthenticateForEmailChange } from "@/app/actions/social-auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { SocialProviderId } from "@/lib/social-auth";

const providerNames: Record<SocialProviderId, string> = { google: "Google", apple: "Apple", facebook: "Facebook" };

export function EmailChangeForm({ currentEmail, hasPassword, linkedProviders, recentlyAuthenticated }: {
  currentEmail: string;
  hasPassword: boolean;
  linkedProviders: SocialProviderId[];
  recentlyAuthenticated: boolean;
}) {
  const [state, action, pending] = useActionState(requestEmailChangeAction, undefined);
  return <div className="space-y-4">
    <p className="text-sm text-[var(--midnight)]/75">Current email: <span className="font-medium">{currentEmail}</span></p>
    {!hasPassword && !recentlyAuthenticated ? <div className="space-y-2">
      <p className="text-sm text-[var(--midnight)]/75">Sign in again with a connected provider before changing your email.</p>
      {linkedProviders.map((provider) => <MutationForm action={reauthenticateForEmailChange} key={provider}><MutationContextInput />
        <Button type="submit" name="provider" value={provider} variant="soft" className="w-full">Sign in again with {providerNames[provider]}</Button>
      </MutationForm>)}
    </div> : <MutationForm action={action} result={state} className="space-y-4"><MutationContextInput />
      <Field label="New email" htmlFor="newAccountEmail" hint="Your current email stays active until you confirm the link sent to the new address.">
        <Input id="newAccountEmail" name="email" type="email" autoComplete="email" required maxLength={254} />
      </Field>
      {hasPassword ? <Field label="Current password" htmlFor="emailChangePassword">
        <Input id="emailChangePassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field> : null}
      {state?.error ? <p className="text-sm text-rose-700" role="alert">{state.error}</p> : null}
      {state?.success ? <p className="text-sm text-[var(--plum)]" role="status">{state.success}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Save email & send verification link"}</Button>
    </MutationForm>}
  </div>;
}
