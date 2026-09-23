"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutationContext } from "@/components/mutation-context";
import { normalizeTheme, type AppTheme } from "@/lib/constants";

const THEME_TOGGLE_OPTIONS = [
  { value: "cosmic", label: "Light", Icon: Sun },
  { value: "midnight", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const satisfies ReadonlyArray<{
  value: AppTheme;
  label: string;
  Icon: typeof Sun;
}>;

export function ThemeToggle({
  theme,
  action,
  id = "theme",
  name = "theme",
}: {
  theme: string;
  action: (formData: FormData) => Promise<{ ok?: boolean; error?: string }>;
  id?: string;
  name?: string;
}) {
  const normalizedTheme = normalizeTheme(theme);
  const router = useRouter();
  const mutationContext = useMutationContext();
  const [value, setValue] = useState<AppTheme>(normalizedTheme);
  const [savedValue, setSavedValue] = useState<AppTheme>(normalizedTheme);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyTheme(nextTheme: AppTheme) {
    document.documentElement.setAttribute("data-theme", nextTheme);
  }

  async function selectTheme(nextTheme: AppTheme) {
    if (saving || nextTheme === value) return;
    const previousTheme = savedValue;
    setValue(nextTheme);
    applyTheme(nextTheme);
    setSaving(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.set("mutationContext", mutationContext);
    formData.set(name, nextTheme);
    try {
      const result = await action(formData);
      if (result.error) throw new Error(result.error);
      setSavedValue(nextTheme);
      setMessage("Theme saved.");
      router.refresh();
    } catch (caught) {
      setValue(previousTheme);
      applyTheme(previousTheme);
      setError(caught instanceof Error ? caught.message : "Couldn’t save the theme. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="space-y-1.5" disabled={saving} aria-busy={saving}>
      <legend className="text-sm font-medium text-[var(--midnight)]/80">
        Theme
      </legend>
      <div className="grid grid-cols-3 rounded-2xl border border-[var(--plum)]/15 bg-[var(--input)] p-1">
        {THEME_TOGGLE_OPTIONS.map(({ value: optionValue, label, Icon }) => {
          const optionId = `${id}-${optionValue}`;
          return (
            <label key={optionValue} htmlFor={optionId} className="cursor-pointer">
              <input
                id={optionId}
                className="peer sr-only"
                type="radio"
                name={name}
                value={optionValue}
                checked={value === optionValue}
                onChange={() => void selectTheme(optionValue)}
              />
              <span className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[var(--midnight)]/65 transition peer-checked:bg-[var(--plum)] peer-checked:text-[var(--on-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--gold)] peer-focus-visible:ring-offset-2">
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </span>
            </label>
          );
        })}
      </div>
      {saving ? (
        <p className="text-xs text-[var(--midnight)]/55">Saving theme…</p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs font-semibold text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
