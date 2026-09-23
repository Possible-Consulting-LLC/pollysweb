'use client';
import { MutationContextInput } from '@/components/mutation-context';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
/** Native modal supplies focus trapping/Escape; server action still checks confirmation and permissions. */
export function ConfirmAction({ label, description, confirmation, action, fields, onSuccess }: {
  label: string; description: string; confirmation: string; action: (form: FormData) => Promise<{ error?: string; success?: boolean }>;
  fields?: Record<string, string | number>; onSuccess?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const priorConfirmation = useRef(confirmation);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = useId();
  function close() { dialog.current?.close(); trigger.current?.focus(); }
  useEffect(() => {
    if (priorConfirmation.current !== confirmation) {
      if (dialog.current?.open) close();
      priorConfirmation.current = confirmation;
    }
  }, [confirmation]);
  return <>
    <Button ref={trigger} type="button" variant="danger" onClick={() => { setTyped(''); setError(''); dialog.current?.showModal(); cancel.current?.focus(); }}>{label}</Button>
    {success ? <p role="status">Action completed.</p> : null}
    <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { if (pending) event.preventDefault(); }} onClose={() => trigger.current?.focus()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-[var(--cream)] p-6 text-[var(--midnight)] shadow-xl backdrop:bg-black/50">
      <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
        startTransition(async () => { try { const result = await action(form); if (result.error) setError(result.error); else if (result.success) { setSuccess(true); close(); onSuccess?.(); } }
          catch { setError('The action could not be completed. Please try again.'); } }); }} className="space-y-4"><MutationContextInput />
        {Object.entries(fields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <h2 id={`${id}-title`} className="text-xl font-semibold">{label}</h2>
        <p id={`${id}-description`}>{description}</p>
        <label className="block" htmlFor={`${id}-confirm`}>Type <strong>{confirmation}</strong> to confirm.</label>
        <input id={`${id}-confirm`} name="confirmation" value={typed} onChange={event => setTyped(event.target.value)} required autoComplete="off" disabled={pending}
          className="w-full rounded-xl border border-[var(--plum)]/30 p-3" />
        {error ? <p role="alert">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button ref={cancel} type="button" variant="soft" disabled={pending} onClick={close}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={pending || typed !== confirmation}>{pending ? 'Working…' : 'Confirm action'}</Button>
        </div>
      </form>
    </dialog>
  </>;
}
