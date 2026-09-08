import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDays(days: number | null): string {
  if (days === null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Prefer clock-aware relative time so same-day logs visibly update. */
export function formatCareWhen(date: Date | string | null): string {
  if (!date) return "never";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "never";
  const diffMs = Date.now() - value.getTime();
  if (diffMs < 60_000) return "just now";
  return `${formatDistanceToNowStrict(value)} ago`;
}

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse `yyyy-MM-dd` as local noon to avoid UTC day-shift. */
export function parseLocalDateInput(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function requireLocalDateInput(
  value: string | null | undefined,
  fallback = new Date(),
) {
  return parseLocalDateInput(value) ?? fallback;
}

export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString();
}

export function daysBetween(from: Date, to: Date = new Date()): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}


export function parseHydrationMethods(event: {
  methods?: string | null;
  mistedEnclosure?: boolean;
  waterDroplet?: boolean;
}): string[] {
  if (event.methods) {
    try {
      const parsed = JSON.parse(event.methods) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(String);
      }
    } catch {
      // fall through
    }
  }
  const fallback: string[] = [];
  if (event.mistedEnclosure) fallback.push("Misted enclosure");
  if (event.waterDroplet) fallback.push("Water droplet on glass");
  return fallback;
}
