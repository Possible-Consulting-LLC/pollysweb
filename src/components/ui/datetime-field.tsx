"use client";

import { useMemo, useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import {
  COMMON_TIMEZONES,
  toDateTimeLocalInputValue,
} from "@/lib/utils";

/** Date+time field that defaults to the browser's local now and sends its IANA zone. */
export function DateTimeField({
  name = "date",
  id,
  label = "When",
  defaultValue,
  required = true,
  includeTimeZone = true,
}: {
  name?: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  includeTimeZone?: boolean;
}) {
  const inputId = id ?? name;
  const browserZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const [value] = useState(
    () =>
      defaultValue || toDateTimeLocalInputValue(new Date(), browserZone),
  );

  return (
    <>
      <Field label={label} htmlFor={inputId}>
        <Input
          id={inputId}
          name={name}
          type="datetime-local"
          required={required}
          defaultValue={value}
        />
      </Field>
      {includeTimeZone ? (
        <input type="hidden" name="clientTimeZone" value={browserZone} />
      ) : null}
    </>
  );
}

export function TimezoneSelect({
  name = "timezone",
  id = "timezone",
  defaultValue,
}: {
  name?: string;
  id?: string;
  defaultValue?: string | null;
}) {
  const browserZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const initial = defaultValue?.trim() || browserZone;
  const options = useMemo(() => {
    const set = new Set<string>([...COMMON_TIMEZONES, browserZone, initial]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [browserZone, initial]);

  return (
    <Field
      label="Timezone"
      htmlFor={id}
          hint={`Used when showing activity times. Defaults to this device (${browserZone}). Save settings once so logs keep showing the right clock.`}
        >
      <Select id={id} name={name} defaultValue={initial}>
        {options.map((zone) => (
          <option key={zone} value={zone}>
            {zone === browserZone ? `${zone} (this device)` : zone}
          </option>
        ))}
      </Select>
    </Field>
  );
}
