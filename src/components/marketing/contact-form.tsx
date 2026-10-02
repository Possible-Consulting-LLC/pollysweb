"use client";

import { useActionState } from "react";
import { MutationContextInput } from "@/components/mutation-context";
import { sendContactMessage } from "@/app/actions/contact";
import { CONTACT_TOPICS, TOPIC_LABELS } from "@/lib/contact";
import type { MutationFailure } from "@/lib/mutation-failure";

type ContactState = { ok: boolean; message: string } | MutationFailure | undefined;

const fieldClasses =
  "w-full rounded-2xl border border-[var(--plum)]/15 bg-[var(--input)] px-4 py-3 text-[var(--midnight)] placeholder:text-[var(--midnight)]/40 focus:border-[var(--plum)]/50 focus:outline-none";

export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactMessage, undefined as ContactState);

  return (
    <form action={action} className="space-y-4">
      <MutationContextInput />
      <div>
        <label htmlFor="contact-name" className="block text-sm font-bold text-[var(--midnight)]">
          Name <span className="text-[var(--rose)]" aria-hidden>*</span>
        </label>
        <input id="contact-name" name="name" type="text" required autoComplete="name" placeholder="Your name" className={`mt-1.5 ${fieldClasses}`} />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm font-bold text-[var(--midnight)]">
          Email Address <span className="text-[var(--rose)]" aria-hidden>*</span>
        </label>
        <input id="contact-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={`mt-1.5 ${fieldClasses}`} />
      </div>
      <div>
        <label htmlFor="contact-topic" className="block text-sm font-bold text-[var(--midnight)]">
          Subject <span className="text-[var(--rose)]" aria-hidden>*</span>
        </label>
        <select id="contact-topic" name="topic" required defaultValue="" className={`mt-1.5 ${fieldClasses}`}>
          <option value="" disabled>
            Select a topic
          </option>
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {TOPIC_LABELS[topic]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-sm font-bold text-[var(--midnight)]">
          Message <span className="text-[var(--rose)]" aria-hidden>*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={2000}
          placeholder="Tell us more…"
          className={`mt-1.5 resize-y ${fieldClasses}`}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--plum)] px-6 py-3.5 text-base font-bold text-[var(--on-accent)] shadow-[0_10px_28px_rgba(82,56,96,0.25)] transition hover:bg-[var(--plum-deep)] disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send Message"}
      </button>
      {state ? (
        <p
          role="status"
          className={`text-center text-sm font-semibold ${state.ok === true ? "text-green-700" : "text-[var(--rose)]"}`}
        >
          {state.ok === true
            ? state.message
            : "message" in state
              ? state.message
              : state.error}
        </p>
      ) : (
        <p className="text-center text-sm text-[var(--midnight)]/55">
          We typically respond within 1–2 business days.
        </p>
      )}
    </form>
  );
}