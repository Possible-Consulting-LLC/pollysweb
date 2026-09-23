export function boundedText(value: FormDataEntryValue | null | undefined, label: string, max: number): string {
  const text = String(value ?? "").trim();
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return text;
}

export function optionalText(value: FormDataEntryValue | null | undefined, label: string, max: number): string | undefined {
  return boundedText(value, label, max) || undefined;
}

export function hydrationMethods(values: FormDataEntryValue[]): string[] {
  if (values.length > 8) throw new Error("Choose at most 8 hydration methods.");
  return values.map((value) => boundedText(value, "Hydration method", 120)).filter(Boolean);
}

export function reminderInterval(value: FormDataEntryValue | null, label: string): number {
  const text = String(value ?? "").trim();
  const days = Number(text);
  if (!text || !Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error(`${label} must be a whole number of days from 1 to 365.`);
  }
  return days;
}
