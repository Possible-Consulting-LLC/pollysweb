"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { useActionState, useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { cn } from "@/lib/utils";

type ClientDiagnostics = {
  userAgent: string;
  platform: string;
  language: string;
  languages: string;
  timezone: string;
  screen: string;
  viewport: string;
  devicePixelRatio: string;
  touchPoints: string;
  online: string;
  pageUrl: string;
  referrer: string;
};

function collectClientDiagnostics(pathname: string): ClientDiagnostics {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const screenObj = typeof screen !== "undefined" ? screen : null;
  return {
    userAgent: nav?.userAgent || "",
    platform: nav?.platform || "",
    language: nav?.language || "",
    languages: Array.isArray(nav?.languages) ? nav.languages.join(", ") : "",
    timezone:
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || ""
        : "",
    screen: screenObj
      ? `${screenObj.width}×${screenObj.height} (${screenObj.colorDepth}-bit)`
      : "",
    viewport:
      typeof window !== "undefined"
        ? `${window.innerWidth}×${window.innerHeight}`
        : "",
    devicePixelRatio:
      typeof window !== "undefined" ? String(window.devicePixelRatio || "") : "",
    touchPoints: nav ? String(nav.maxTouchPoints ?? "") : "",
    online: nav ? String(nav.onLine) : "",
    pageUrl:
      typeof window !== "undefined"
        ? window.location.href
        : pathname || "",
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
  };
}

export function FeedbackButton() {
  const pathname = usePathname();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ClientDiagnostics>(() =>
    collectClientDiagnostics(pathname),
  );
  if (pathname === "/today") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDiagnostics(collectClientDiagnostics(pathname));
          setOpen(true);
        }}
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
        <ModalDialog labelledBy={titleId} onClose={() => setOpen(false)}>
          <div className="flex min-h-full items-end justify-center sm:items-center">
          <div
            aria-labelledby={titleId}
            className="relative w-full max-w-md rounded-t-[1.75rem] border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_16px_48px_var(--shadow)] sm:rounded-[1.75rem]"
            onClick={(event) => event.stopPropagation()}
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

            <FeedbackForm diagnostics={diagnostics} pathname={pathname} onSuccess={() => setOpen(false)} />
          </div>
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}

function FeedbackForm({
  diagnostics,
  pathname,
  onSuccess,
}: {
  diagnostics: ClientDiagnostics;
  pathname: string;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState(
    submitFeedbackAction,
    undefined as { error?: string; success?: string } | undefined,
  );

  useEffect(() => {
    if (!state?.success) return;
    const timer = window.setTimeout(onSuccess, 1400);
    return () => window.clearTimeout(timer);
  }, [onSuccess, state?.success]);

  return (
    <MutationForm action={action} result={state} className="space-y-4"><MutationContextInput />
      <input type="hidden" name="userAgent" value={diagnostics.userAgent} />
      <input type="hidden" name="platform" value={diagnostics.platform} />
      <input type="hidden" name="language" value={diagnostics.language} />
      <input type="hidden" name="languages" value={diagnostics.languages} />
      <input type="hidden" name="timezone" value={diagnostics.timezone} />
      <input type="hidden" name="screen" value={diagnostics.screen} />
      <input type="hidden" name="viewport" value={diagnostics.viewport} />
      <input type="hidden" name="devicePixelRatio" value={diagnostics.devicePixelRatio} />
      <input type="hidden" name="touchPoints" value={diagnostics.touchPoints} />
      <input type="hidden" name="online" value={diagnostics.online} />
      <input type="hidden" name="pageUrl" value={diagnostics.pageUrl} />
      <input type="hidden" name="referrer" value={diagnostics.referrer} />
      <input type="hidden" name="pathname" value={pathname || ""} />

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
      {state?.error ? <p className="text-sm text-rose-700" role="alert">{state.error}</p> : null}
      {state?.success ? (
        <p className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm text-[var(--midnight)]" role="status">
          {state.success}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending || Boolean(state?.success)}>
        {pending ? "Sending…" : state?.success ? "Sent" : "Send to Spoodly"}
      </Button>
    </MutationForm>
  );
}
