"use client";

import { useActionState } from "react";
import { MutationContextInput } from "@/components/mutation-context";
import { subscribeToNewsletter, type NewsletterResult } from "@/app/actions/newsletter";

const INITIAL_STATE: NewsletterResult | undefined = undefined;

export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeToNewsletter, INITIAL_STATE);

  return (
    <form action={action} className="mt-3 space-y-2">
      <MutationContextInput />
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <div className="flex gap-2">
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          placeholder="Your email address"
          autoComplete="email"
          className="w-full min-w-0 rounded-full border border-[var(--on-panel)]/25 bg-[var(--on-panel)]/10 px-4 py-2 text-sm text-white placeholder:text-[var(--on-panel)]/50 focus:border-[var(--on-panel)]/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-bold text-[#3b2166] transition hover:bg-white/90 disabled:opacity-60"
        >
          {pending ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      {state ? (
        <p role="status" className={state.ok ? "text-xs text-[var(--lavender)]" : "text-xs text-[var(--rose)]"}>
          {state.ok ? state.message : "message" in state ? state.message : state.error}
        </p>
      ) : null}
    </form>
  );
}