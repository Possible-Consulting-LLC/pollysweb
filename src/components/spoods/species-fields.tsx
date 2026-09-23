"use client";

import { useId, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { JUMPING_SPIDER_SPECIES, updateSpeciesNames } from "@/lib/spood-details";

export function SpeciesFields({
  commonName = "",
  species = "",
}: {
  commonName?: string;
  species?: string;
}) {
  const id = useId();
  const [names, setNames] = useState({ commonName, species });

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["commonName", "species"] as const).map((field) => (
          <Field key={field} label={field === "commonName" ? "Common name" : "Species"} htmlFor={`${id}-${field}`}>
            <Input
              id={`${id}-${field}`}
              name={field}
              list={`${id}-${field}-options`}
              value={names[field]}
              autoComplete="off"
              aria-describedby={`${id}-hint`}
              placeholder={field === "commonName" ? "Search common names" : "Search scientific names"}
              onChange={(event) => setNames((current) => updateSpeciesNames(current, field, event.target.value))}
            />
            <datalist id={`${id}-${field}-options`}>
              {JUMPING_SPIDER_SPECIES.map((entry) => (
                <option key={entry.species} value={entry[field]}>
                  {entry[field === "commonName" ? "species" : "commonName"]}
                </option>
              ))}
            </datalist>
          </Field>
        ))}
      </div>
      <p id={`${id}-hint`} className="text-xs text-[var(--midnight)]/55">
        Choose a jumping spider suggestion to fill both names, or type your own. Leave blank if unknown.
      </p>
    </div>
  );
}
