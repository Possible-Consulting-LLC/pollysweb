"use client";

import { useActionState } from "react";
import { createSpiderAction } from "@/app/actions/auth";
import { AppHeader } from "@/components/layout/nav";
import { SpoodAvatarPicker } from "@/components/spoods/avatar-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ENCLOSURE_TYPES, SEX_OPTIONS } from "@/lib/constants";

export default function AddSpoodPage() {
  const [state, action, pending] = useActionState(
    createSpiderAction,
    undefined as { error?: string } | undefined,
  );

  return (
    <div className="space-y-6">
      <AppHeader
        title="Add a Spood"
        subtitle="Start a little life story for someone new."
      />

      <Card>
        <form action={action} className="space-y-4">
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" required placeholder="Star" />
          </Field>

          <SpoodAvatarPicker />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Common name" htmlFor="commonName">
              <Input
                id="commonName"
                name="commonName"
                placeholder="Regal Jumping Spider"
              />
            </Field>
            <Field label="Species" htmlFor="species">
              <Input
                id="species"
                name="species"
                placeholder="Phidippus regius"
              />
            </Field>
          </div>
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
            <Field label="Instar" htmlFor="instar">
              <Input id="instar" name="instar" placeholder="i6" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hatch date (if known)" htmlFor="hatchDate">
              <Input id="hatchDate" name="hatchDate" type="date" />
            </Field>
            <Field label="Acquisition date" htmlFor="acquisitionDate">
              <Input id="acquisitionDate" name="acquisitionDate" type="date" />
            </Field>
          </div>
          <Field label="Source / breeder" htmlFor="source">
            <Input id="source" name="source" placeholder="Optional" />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" placeholder="Personality, quirks, favorites…" />
          </Field>

          <div className="rounded-2xl bg-[var(--cream-deep)]/50 p-3 space-y-3">
            <p className="text-sm font-semibold text-[var(--midnight)]">
              Enclosure (optional)
            </p>
            <Field label="Enclosure name" htmlFor="enclosureName">
              <Input id="enclosureName" name="enclosureName" placeholder="Star's Orbit" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" htmlFor="enclosureType">
                <Select id="enclosureType" name="enclosureType" defaultValue="acrylic">
                  {ENCLOSURE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
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

          {state?.error ? (
            <p className="text-sm text-rose-700" role="alert">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Welcoming…" : "Welcome them home"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
