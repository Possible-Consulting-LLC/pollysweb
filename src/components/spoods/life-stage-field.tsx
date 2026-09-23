"use client";

import { useId, useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { LIFE_STAGES, lifeStageChoice } from "@/lib/spood-details";

type LifeStageFieldProps = {
  defaultValue?: string;
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
};

export function LifeStageField({ defaultValue = "", name = "instar", label = "Life Stage", value: controlledValue, onChange }: LifeStageFieldProps) {
  const id = useId();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const [customSelected, setCustomSelected] = useState(false);
  const [custom, setCustom] = useState(() => lifeStageChoice(value) === "custom" ? value : "");
  const choice = customSelected ? "custom" : lifeStageChoice(value);
  function updateValue(next: string) {
    setInternalValue(next);
    onChange?.(next);
  }

  return (
    <div className="space-y-2">
      <Field label={label} htmlFor={id}>
        <Select
          id={id}
          value={choice}
          onChange={(event) => {
            const next = event.target.value;
            setCustomSelected(next === "custom");
            updateValue(next === "custom" ? custom : next);
          }}
        >
          {LIFE_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
          <option value="custom">Other / custom</option>
        </Select>
      </Field>
      {choice === "custom" ? (
        <Field label={`Custom ${label.toLowerCase()}`} htmlFor={`${id}-custom`}>
          <Input
            id={`${id}-custom`}
            value={value}
            placeholder="e.g. i13 or Juvenile"
            onChange={(event) => {
              setCustom(event.target.value);
              updateValue(event.target.value);
            }}
          />
        </Field>
      ) : null}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
