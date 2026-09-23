'use client';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { useActionState, useId, useState } from 'react';
import { disconnectProviderAction } from '@/app/actions/disconnect-provider';
import { reauthenticateForEmailChange } from '@/app/actions/social-auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import type { SocialProviderId } from '@/lib/social-auth';

export function DisconnectProviderForm({ provider, label, canDisconnect, hasPassword, recentlyAuthenticated, reauthProvider }: {
  provider: SocialProviderId; label: string; canDisconnect: boolean; hasPassword: boolean; recentlyAuthenticated: boolean; reauthProvider?: SocialProviderId;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(disconnectProviderAction, undefined);
  const id = useId();
  return <div className="w-full space-y-2">
    <div className="flex items-center justify-between gap-3"><span>{label}</span><Button type="button" variant="soft" disabled={!canDisconnect} onClick={() => setOpen(!open)} aria-expanded={open}>Disconnect {label}</Button></div>
    {!canDisconnect ? <p className="text-xs text-[var(--midnight)]/75">Keep at least one sign-in method. Connect another provider or verify your email/password first.</p> : null}
    {open && canDisconnect ? <div className="space-y-3 rounded-xl border border-[var(--plum)]/20 p-3">
      <p>Your spoods and care history will stay. You’ll be signed out on all devices and can sign back in using your remaining method.</p>
      {!hasPassword && !recentlyAuthenticated ? <MutationForm action={reauthenticateForEmailChange}><MutationContextInput />
        <p className="mb-2">Sign in again to confirm it’s you, then return here to disconnect.</p>
        {reauthProvider ? <Button type="submit" name="provider" value={reauthProvider}>Confirm with {reauthProvider === 'google' ? 'Google' : reauthProvider === 'facebook' ? 'Facebook' : 'Apple'}</Button> : <p>Sign out and sign in again using your remaining method.</p>}
      </MutationForm> : <MutationForm action={action} result={state} className="space-y-3"><MutationContextInput />
        <input type="hidden" name="provider" value={provider} />
        {hasPassword ? <Field label="Current password" htmlFor={id}><Input id={id} name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} /></Field> : null}
        {state?.error ? <p role="alert" className="text-rose-600 dark:text-rose-300">{state.error}</p> : null}
        <Button disabled={pending} type="submit">{pending ? 'Disconnecting…' : `Confirm disconnect ${label}`}</Button>
      </MutationForm>}
      <Button type="button" variant="soft" onClick={() => setOpen(false)}>Cancel</Button>
    </div> : null}
  </div>;
}
