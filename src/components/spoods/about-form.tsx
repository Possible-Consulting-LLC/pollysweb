"use client";

import { MutationContextInput } from '@/components/mutation-context';
import { useState } from "react";
import { updateSpiderAbout } from "@/app/actions/about";
import { SpeciesFields } from "@/components/spoods/species-fields";
import { LifeStageField } from "@/components/spoods/life-stage-field";
import { useActionFeedback } from "@/components/spoods/profile-forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SEX_OPTIONS } from "@/lib/constants";
import { formatShortDate, toDateInputValue } from "@/lib/utils";

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

export function AboutForm({
  spiderId,
  about,
}: {
  spiderId: string;
  about: {
    name: string;
    commonName: string | null;
    species: string | null;
    sex: string;
    instar: string | null;
    hatchDate: string | null;
    acquisitionDate: string | null;
    source: string | null;
    notes: string | null;
  };
}) {
  const { pending, message, error, run } = useActionFeedback();
  const [editing, setEditing] = useState(false);
  const formKey = [
    about.name,
    about.commonName,
    about.species,
    about.sex,
    about.instar,
    about.hatchDate,
    about.acquisitionDate,
    about.source,
    about.notes,
  ].join("|");

  if (!editing) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          <span className="text-[var(--midnight)]/55">Name: </span>
          {about.name}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Common name: </span>
          {about.commonName || "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Species: </span>
          {about.species || "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Sex: </span>
          {about.sex || "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Life Stage: </span>
          {about.instar || "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Acquired: </span>
          {about.acquisitionDate
            ? formatShortDate(about.acquisitionDate)
            : "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Hatch: </span>
          {about.hatchDate ? formatShortDate(about.hatchDate) : "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Source: </span>
          {about.source || "Unknown"}
        </p>
        {about.notes ? (
          <p className="rounded-2xl bg-[var(--cream-deep)]/50 p-3 text-[var(--midnight)]/80">
            {about.notes}
          </p>
        ) : null}
        <Feedback message={message} error={error} />
        <Button
          type="button"
          variant="soft"
          className="w-full"
          onClick={() => setEditing(true)}
        >
          Edit about
        </Button>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        run(async () => {
          const result = await updateSpiderAbout(spiderId, fd);
          if (result.ok) setEditing(false);
          return result;
        });
      }}
    ><MutationContextInput />
      <Field label="Name" htmlFor="about-name">
        <Input
          id="about-name"
          name="name"
          required
          defaultValue={about.name}
        />
      </Field>
      <SpeciesFields commonName={about.commonName ?? ""} species={about.species ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sex" htmlFor="about-sex">
          <Select id="about-sex" name="sex" defaultValue={about.sex || "Unknown"}>
            {SEX_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <LifeStageField defaultValue={about.instar ?? ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hatch date" htmlFor="about-hatch">
          <Input
            id="about-hatch"
            name="hatchDate"
            type="date"
            defaultValue={toDateInputValue(about.hatchDate)}
          />
        </Field>
        <Field label="Acquisition date" htmlFor="about-acquired">
          <Input
            id="about-acquired"
            name="acquisitionDate"
            type="date"
            defaultValue={toDateInputValue(about.acquisitionDate)}
          />
        </Field>
      </div>
      <Field label="Source / breeder" htmlFor="about-source">
        <Input
          id="about-source"
          name="source"
          defaultValue={about.source ?? ""}
          placeholder="Optional"
        />
      </Field>
      <Field label="Notes" htmlFor="about-notes">
        <Textarea
          id="about-notes"
          name="notes"
          defaultValue={about.notes ?? ""}
          placeholder="Personality, quirks, favorites…"
        />
      </Field>
      <Feedback message={message} error={error} />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="soft"
          className="flex-1"
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? "Saving…" : "Save about"}
        </Button>
      </div>
    </form>
  );
}
