"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function FeedbackButton() {
  const pathname = usePathname();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    submitFeedbackAction,
    undefined as { error?: string; success?: string } | undefined,
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (state?.success) {
      const timer = window.setTimeout(() => setOpen(false), 1400);
      return () => window.clearTimeout(timer);
    }
  }, [state?.success]);

  if (pathname === "/today") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 z-40",
          "inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--plum)]/15",
          "bg-[var(--card)] px-3.5 text-sm font-semibold text-[var(--midnight)]",
          "shadow-[0_8px_24px_var(--shadow)] transition hover:bg-[var(--hover-strong)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
          "sm:right-[max(1rem,calc((100vw-42rem)/2+1rem))]",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MessageSquarePlus className="h-4 w-4 text-[var(--plum)]" aria-hidden />
        Feedback
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--midnight)]/45"
            aria-label="Close feedback"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 w-full max-w-md rounded-t-[1.75rem] border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_16px_48px_var(--shadow)] sm:rounded-[1.75rem]"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id={titleId}
                  className="font-[family-name:var(--font-display)] text-2xl text-[var(--midnight)]"
                >
                  Share feedback
                </h2>
                <p className="mt-1 text-sm text-[var(--midnight)]/60">
                  Bugs, ideas, or anything that would make Spoodly better.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--midnight)]/55 hover:bg-[var(--hover)] hover:text-[var(--midnight)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={action} className="space-y-4" key={state?.success ? "sent" : "form"}>
              <Field label="Type" htmlFor="category">
                <Select id="category" name="category" defaultValue="feedback" required>
                  <option value="feedback">Feedback</option>
                  <option value="bug">Bug report</option>
                  <option value="idea">Idea</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Your note" htmlFor="message">
                <Textarea
                  id="message"
                  name="message"
                  required
                  minLength={10}
                  maxLength={4000}
                  placeholder="What happened, or what would you love to see?"
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
              <Button type="submit" className="w-full" disabled={pending || Boolean(state?.success)}>
                {pending ? "Sending…" : state?.success ? "Sent" : "Send to Spoodly"}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
