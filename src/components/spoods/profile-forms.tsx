"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  logBodyCondition,
  logEnclosureMaintenance,
  upsertEnclosure,
  addSpiderPhoto,
  type ActionResult,
} from "@/app/actions/care";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { BODY_CONDITIONS, ENCLOSURE_TYPES } from "@/lib/constants";
import { DateTimeField } from "@/components/ui/datetime-field";
import { formatShortDate, toDateInputValue } from "@/lib/utils";

const bodyIcons: Record<string, string> = {
  "Very thin": "◦",
  Thin: "○",
  Normal: "◉",
  Plump: "⬤",
  "Very full": "◉◉",
};

function Feedback({
  message,
  error,
}: {
  message: string | null;
  error: string | null;
}) {
  if (message) {
    return (
      <p
        className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        role="status"
      >
        {message}
      </p>
    );
  }
  if (error) {
    return (
      <p
        className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
        role="alert"
      >
        {error}
      </p>
    );
  }
  return null;
}

export function useActionFeedback() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    setPending(true);
    void (async () => {
      try {
        const result = await action();
        if (result.ok) {
          setMessage(result.message);
          setError(null);
          setPending(false);
          router.refresh();
        } else {
          setMessage(null);
          setError(result.error);
          setPending(false);
        }
      } catch (err) {
        setMessage(null);
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setPending(false);
      }
    })();
  }

  return { pending, message, error, run };
}

export function BodyConditionForm({
  spiderId,
  currentCondition,
}: {
  spiderId: string;
  currentCondition?: string | null;
}) {
  const { pending, message, error, run } = useActionFeedback();
  const defaultCondition =
    currentCondition &&
    (BODY_CONDITIONS as readonly string[]).includes(currentCondition)
      ? currentCondition
      : "Normal";

  return (
    <form
      key={defaultCondition}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        run(() => logBodyCondition(spiderId, fd));
      }}
    >
      <Field label="Body condition observation" htmlFor="condition">
        <Select id="condition" name="condition" defaultValue={defaultCondition}>
          {BODY_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {bodyIcons[c]} {c}
            </option>
          ))}
        </Select>
      </Field>
      <DateTimeField id="bc-date" name="date" label="When" />
      <p className="text-xs text-[var(--midnight)]/50">
        A visual observation — not a medical diagnosis.
      </p>
      <Field label="Notes" htmlFor="bc-notes">
        <Textarea id="bc-notes" name="notes" />
      </Field>
      <Feedback message={message} error={error} />
      <Button
        type="submit"
        disabled={pending}
        variant="secondary"
        className="w-full"
      >
        {pending ? "Saving…" : "Save observation"}
      </Button>
    </form>
  );
}

export function EnclosureForm({
  spiderId,
  enclosure,
}: {
  spiderId: string;
  enclosure: {
    name: string | null;
    type: string | null;
    dimensions: string | null;
    notes: string | null;
    setupDate: string | null;
    lastCleaned: string | null;
    lastRehoused: string | null;
  } | null;
}) {
  const { pending, message, error, run } = useActionFeedback();

  return (
    <div className="space-y-4">
      {enclosure ? (
        <div className="rounded-2xl bg-[var(--cream-deep)]/50 p-3 text-sm text-[var(--midnight)]/70">
          <p>
            <span className="font-semibold text-[var(--midnight)]">
              {enclosure.name || "Home"}
            </span>
            {enclosure.type || enclosure.dimensions
              ? ` · ${[enclosure.type, enclosure.dimensions].filter(Boolean).join(" · ")}`
              : null}
          </p>
          <p className="mt-1 text-xs">
            Last cleaned: {formatShortDate(enclosure.lastCleaned)} · Last
            rehoused: {formatShortDate(enclosure.lastRehoused)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--midnight)]/60">
          No enclosure yet — add one so you can track cleaning and rehousing.
        </p>
      )}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          run(() => upsertEnclosure(spiderId, fd));
        }}
      >
        <Field label="Enclosure name" htmlFor="enc-name">
          <Input
            id="enc-name"
            name="name"
            defaultValue={enclosure?.name ?? ""}
            placeholder="Star's Orbit"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type" htmlFor="enc-type">
            <Select
              id="enc-type"
              name="type"
              defaultValue={enclosure?.type ?? "acrylic"}
            >
              {ENCLOSURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dimensions" htmlFor="enc-dim">
            <Input
              id="enc-dim"
              name="dimensions"
              defaultValue={enclosure?.dimensions ?? ""}
              placeholder="8×8×12 in"
            />
          </Field>
        </div>
        <Field label="Setup date" htmlFor="enc-setup">
          <Input
            id="enc-setup"
            name="setupDate"
            type="date"
            defaultValue={toDateInputValue(enclosure?.setupDate)}
          />
        </Field>
        <Field label="Notes" htmlFor="enc-notes">
          <Textarea
            id="enc-notes"
            name="notes"
            defaultValue={enclosure?.notes ?? ""}
          />
        </Field>
        <Feedback message={message} error={error} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending
            ? "Saving…"
            : enclosure
              ? "Update enclosure"
              : "Add enclosure"}
        </Button>
      </form>
    </div>
  );
}

export function MaintenanceForm({ spiderId }: { spiderId: string }) {
  const { pending, message, error, run } = useActionFeedback();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        run(() => logEnclosureMaintenance(spiderId, fd));
      }}
    >
      <Field label="Maintenance" htmlFor="kind">
        <Select id="kind" name="kind" defaultValue="cleaning">
          <option value="cleaning">Cleaning</option>
          <option value="rehouse">Rehouse</option>
          <option value="maintenance">Maintenance</option>
        </Select>
      </Field>
      <DateTimeField id="maint-date" name="date" label="When" />
      <Field label="Notes" htmlFor="maint-notes">
        <Textarea id="maint-notes" name="notes" />
      </Field>
      <Feedback message={message} error={error} />
      <Button
        type="submit"
        disabled={pending}
        variant="soft"
        className="w-full"
      >
        {pending ? "Saving…" : "Log maintenance"}
      </Button>
    </form>
  );
}

export function PhotoUploadForm({ spiderId }: { spiderId: string }) {
  const { pending, message, error, run } = useActionFeedback();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        run(() => addSpiderPhoto(spiderId, fd));
      }}
    >
      <Field label="Photo" htmlFor="photo">
        <Input
          id="photo"
          name="photo"
          type="file"
          accept="image/*"
          required
          className="py-2 file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--lavender)] file:px-3 file:py-1.5 file:text-sm file:font-semibold"
        />
      </Field>
      <p className="text-xs text-[var(--midnight)]/50">JPG, PNG, WebP, or GIF up to 5MB.</p>
      <Field label="Caption (optional)" htmlFor="caption">
        <Input id="caption" name="caption" placeholder="Fresh hammock view" />
      </Field>
      <DateTimeField id="photo-taken" name="date" label="Taken at" />
      <label className="flex items-center gap-2 text-sm text-[var(--midnight)]/80">
        <input type="checkbox" name="setAsProfile" className="rounded" />
        Set as profile photo
      </label>
      <Feedback message={message} error={error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Uploading…" : "Add photo"}
      </Button>
    </form>
  );
}
