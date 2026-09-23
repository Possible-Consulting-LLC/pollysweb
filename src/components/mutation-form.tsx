'use client';
import { useEffect, useRef, useState, useTransition, type ComponentProps } from 'react';

export type MutationFormAction = (form: FormData) => void | Promise<unknown>;
type Props = Omit<ComponentProps<'form'>, 'action'> & {
  action: MutationFormAction;
  /** Completed useActionState result; dispatch itself returns void. */
  result?: unknown;
};
function errorMessage(value: unknown): string | null {
  return value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
    ? value.error : null;
}

/** Submit without React's automatic successful-action reset: a returned failure
 * is transport success, but must not erase the keeper's unsaved form entries. */
export function MutationForm({ action, result, children, onSubmit, ...props }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittedForm = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (result !== undefined && !errorMessage(result)) submittedForm.current?.reset();
  }, [result]);

  return <fieldset disabled={pending} className="contents"><form {...props} method={props.method ?? 'post'} aria-busy={pending} onSubmit={event => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form, (event.nativeEvent as SubmitEvent).submitter);
    submittedForm.current = form;
    setError(null);
    startTransition(async () => {
      const response = action(data);
      // useActionState dispatch supplies its completion through the result prop.
      if (response === undefined) return;
      const completed = await response;
      const message = errorMessage(completed);
      if (message) setError(message);
      else form.reset();
    });
  }}>
    {children}
    {error ? <p role="alert" className="col-span-full text-sm text-rose-700">{error}</p> : null}
  </form></fieldset>;
}
