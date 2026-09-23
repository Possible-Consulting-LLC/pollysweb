"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
  timeZone,
  required = true,
  includeTimeZone = true,
}: {
  name?: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  timeZone?: string;
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
      defaultValue || toDateTimeLocalInputValue(new Date(), timeZone || browserZone),
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <>
      <Field label={label} htmlFor={inputId}>
        <Input
          id={inputId}
          name={name}
          type="datetime-local"
          required={required}
          defaultValue={value}
          max={toDateTimeLocalInputValue(now, timeZone || browserZone)}
          onFocus={() => setNow(new Date())}
        />
      </Field>
      {includeTimeZone ? (
        <input type="hidden" name="timeZone" value={timeZone || browserZone} />
      ) : null}
    </>
  );
}

const subscribeTimezone = () => () => {};

export function TimezoneSelect({
  name = "timezone",
  id = "timezone",
  defaultValue,
}: {
  name?: string;
  id?: string;
  defaultValue?: string | null;
}) {
  const browserZone = useSyncExternalStore(
    subscribeTimezone,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
  const [selection, setSelection] = useState<string | null>(null);
  const initial = selection ?? (defaultValue?.trim() || browserZone);
  const options = useMemo(() => {
    const set = new Set<string>([...COMMON_TIMEZONES, browserZone, initial]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [browserZone, initial]);

  return (
    <Field
      label="Timezone"
      htmlFor={id}
          hint={`Used for activity times and administrator reporting. Defaults to this device (${browserZone}). Save settings once so logs keep showing the right clock.`}
        >
      <Select id={id} name={name} value={initial} onChange={event => setSelection(event.target.value)}>
        {options.map((zone) => (
          <option key={zone} value={zone}>
            {zone === browserZone ? `${zone} (this device)` : zone}
          </option>
        ))}
      </Select>
    </Field>
  );
}
