"use client";

import { useState } from "react";
import {
  memorializeSpider,
  restoreMemorializedSpider,
} from "@/app/actions/care";
import { useActionFeedback } from "@/components/spoods/profile-forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

export function MemorialPanel({
  spiderId,
  spiderName,
  memorialized,
  passedOn,
  memorialNote,
}: {
  spiderId: string;
  spiderName: string;
  memorialized: boolean;
  passedOn: string | null;
  memorialNote: string | null;
}) {
  const { pending, message, error, run } = useActionFeedback();
  const [open, setOpen] = useState(false);

  if (memorialized) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--midnight)]/70">
          {spiderName} rests in the memorial
          {passedOn ? ` · passed ${passedOn}` : ""}. Their story and photos stay
          here, and they don’t use a free-plan slot.
        </p>
        {memorialNote ? (
          <p className="rounded-2xl bg-[var(--cream-deep)]/60 p-3 text-sm italic text-[var(--midnight)]/80">
            {memorialNote}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="soft"
          className="w-full"
          disabled={pending}
          onClick={() => run(() => restoreMemorializedSpider(spiderId))}
        >
          {pending ? "Restoring…" : "Restore to active spoods"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--midnight)]/70">
        When a spood passes, you can keep their story forever without using your
        free plan slot.
      </p>
      {message ? (
        <p className="rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {!open ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          Memorialize {spiderName}
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (
              !window.confirm(
                `Memorialize ${spiderName}? Care reminders will stop. You can restore them later if needed.`,
              )
            ) {
              return;
            }
            run(async () => {
              const result = await memorializeSpider(spiderId, formData);
              if (result.ok) setOpen(false);
              return result;
            });
          }}
        >
          <Field label="Date passed">
            <Input
              type="date"
              name="passedOn"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>
          <Field label="Memorial note (optional)">
            <Textarea
              name="memorialNote"
              rows={3}
              placeholder={`A few words for ${spiderName}…`}
            />
          </Field>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Saving…" : "Save memorial"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
