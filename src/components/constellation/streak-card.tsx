import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { StreakSummary } from "@/lib/constellation";

export function StreakCard({
  streak,
  completedToday,
  activeCount,
  compact = false,
  caredCount,
}: {
  streak: StreakSummary;
  completedToday: boolean;
  activeCount: number;
  compact?: boolean;
  caredCount?: number;
}) {
  const content = (
    <div className="flex items-center gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-[var(--gold)]/20 text-[var(--gold)]">
        <Sparkles aria-hidden className="h-7 w-7" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--on-panel)]">Care Constellation</p>
        <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--on-panel)]">
          {streak.current} day{streak.current === 1 ? "" : "s"} together
        </p>
        <p className="text-sm text-[var(--on-panel)]/75">
          {activeCount === 0
            ? "Add a spood to start your care rhythm."
            : completedToday
              ? "Today's star is lit."
              : `${caredCount ?? 0} of ${activeCount} spoods cared for today.`}
        </p>
      </div>
      {compact ? <ArrowRight aria-hidden className="h-5 w-5 shrink-0 text-[var(--gold)]" /> : null}
    </div>
  );
  if (!compact) return <div className="rounded-3xl bg-[var(--panel)] p-5">{content}</div>;
  return (
    <Link href="/constellation" className="block rounded-3xl bg-[var(--panel)] p-5 transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plum)]">
      {content}
    </Link>
  );
}
