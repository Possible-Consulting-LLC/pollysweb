'use client';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { useActionState } from 'react';
import { confirmAdminPassword } from '@/app/admin/reauth/actions';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/field';
export function AdminPasswordForm() {
  const [state, action, pending] = useActionState(confirmAdminPassword, {});
  return <MutationForm action={action} result={state} className="space-y-4"><MutationContextInput />
    <Field label="Your password" htmlFor="admin-password"><Input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} /></Field>
    <Button type="submit" disabled={pending}>{pending ? 'Confirming…' : 'Confirm my identity'}</Button>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.success ? <p role="status">Identity confirmed for five minutes.</p> : null}
  </MutationForm>;
}
