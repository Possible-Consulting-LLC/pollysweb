"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { useRouter } from "next/navigation";
import { celebrateCare } from "@/components/constellation/celebrations";
import { useActionState, useState } from "react";
import { createSpiderAction } from "@/app/actions/auth";
import { SpoodAvatarPicker } from "@/components/spoods/avatar-picker";
import { SpeciesFields } from "@/components/spoods/species-fields";
import { LifeStageField } from "@/components/spoods/life-stage-field";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ENCLOSURE_TYPES, SEX_OPTIONS } from "@/lib/constants";
import type { FeatureGateState } from "@/lib/features/gate";
import { localTodayInputValue } from "@/lib/utils";

import { getPhotoSizeError } from "@/lib/upload-limits";

export function AddSpoodForm({ photoUploadGate }: { photoUploadGate: FeatureGateState }) {
  const router = useRouter();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    async (previous: {error?: string} | undefined, formData: FormData) => {
      const result = await createSpiderAction(previous, formData);
      if (result.redirectTo) {
        celebrateCare(result.message ?? "Spood added!", result.celebrations);
        router.push(result.redirectTo);
        router.refresh();
      }
      return result;
    },
    undefined as { error?: string } | undefined,
  );

  return (
    <MutationForm
      action={action} result={state}
      className="space-y-4"
      onSubmit={(event) => {
        const file = new FormData(event.currentTarget).get("photo");
        const error = getPhotoSizeError(file instanceof File ? file : null);
        setPhotoError(error);
        if (error) event.preventDefault();
      }}
    ><MutationContextInput />
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" required placeholder="Star" />
      </Field>

      <SpoodAvatarPicker uploadGate={photoUploadGate} onSelectionChange={() => setPhotoError(null)} />

      <SpeciesFields />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sex" htmlFor="sex">
          <Select id="sex" name="sex" defaultValue="Unknown">
            {SEX_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <LifeStageField />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hatch date (if known)" htmlFor="hatchDate">
          <Input id="hatchDate" name="hatchDate" type="date" />
        </Field>
        <Field label="Acquisition date" htmlFor="acquisitionDate">
          <Input
            id="acquisitionDate"
            name="acquisitionDate"
            type="date"
            defaultValue={localTodayInputValue()}
          />
        </Field>
      </div>
      <Field label="Source / breeder" htmlFor="source">
        <Input id="source" name="source" placeholder="Optional" />
      </Field>
      <Field label="Notes" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          placeholder="Personality, quirks, favorites…"
        />
      </Field>

      <div className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3">
        <p className="text-sm font-semibold text-[var(--midnight)]">
          Enclosure (optional)
        </p>
        <Field label="Enclosure name" htmlFor="enclosureName">
          <Input
            id="enclosureName"
            name="enclosureName"
            placeholder="Star's Orbit"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="enclosureType">
            <Select
              id="enclosureType"
              name="enclosureType"
              defaultValue="acrylic"
            >
              {ENCLOSURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dimensions" htmlFor="enclosureDimensions">
            <Input
              id="enclosureDimensions"
              name="enclosureDimensions"
              placeholder="8×8×12 in"
            />
          </Field>
        </div>
      </div>

      {photoError || state?.error ? (
        <p className="text-sm text-rose-700" role="alert">
          {photoError || state?.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Welcoming…" : "Welcome them home"}
      </Button>
    </MutationForm>
  );
}
