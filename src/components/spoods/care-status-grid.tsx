import { formatRelativeDays } from "@/lib/utils";

export function CareStatusGrid({
  daysSinceFeed,
  daysSinceMist,
  latestBehavior,
}: {
  daysSinceFeed: number | null;
  daysSinceMist: number | null;
  latestBehavior: string | null;
}) {
  const items = [
    ["Food", formatRelativeDays(daysSinceFeed)],
    ["Water", formatRelativeDays(daysSinceMist)],
    ["Behavior", latestBehavior || "No recent note"],
  ] as const;

  return (
    <dl className="grid gap-2 text-xs text-[var(--midnight)]/70 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="min-w-0 rounded-2xl bg-[var(--cream-deep)]/60 px-3 py-2"
        >
          <dt>{label}</dt>
          <dd className="truncate font-semibold text-[var(--midnight)]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
