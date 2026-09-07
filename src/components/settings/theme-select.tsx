"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/field";
import {
  THEME_OPTIONS,
  normalizeTheme,
  type AppTheme,
} from "@/lib/constants";

export function ThemeSelect({
  theme,
  id = "theme",
  name = "theme",
}: {
  theme: string;
  id?: string;
  name?: string;
}) {
  const initial = normalizeTheme(theme);
  const [value, setValue] = useState<AppTheme>(initial);

  useEffect(() => {
    setValue(normalizeTheme(theme));
  }, [theme]);

  return (
    <Select
      id={id}
      name={name}
      value={value}
      onChange={(event) => setValue(normalizeTheme(event.target.value))}
    >
      {THEME_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
