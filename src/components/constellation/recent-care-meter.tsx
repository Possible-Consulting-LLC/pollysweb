import { Art } from "@/components/constellation/reward-art";
import {
  STREAK_REWARDS,
  type StreakSummary,
} from "@/lib/constellation";

function recentDays(todayKey: string): string[] {
  const today = Date.parse(`${todayKey}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(today - (6 - index) * 86_400_000).toISOString().slice(0, 10),
  );
}

export function RecentCareMeter({
  daysTogether,
  todayKey,
  completedDayKeys,
  streak,
}: {
  daysTogether: number;
  todayKey: string;
  completedDayKeys: string[];
  streak: StreakSummary;
}) {
  const completed = new Set(completedDayKeys);
  const reward = [...STREAK_REWARDS]
    .reverse()
    .find((item) => item.days <= streak.current) ?? STREAK_REWARDS[0];
  const earned = streak.current >= reward.days;

  return (
    <section
      aria-label="Recent care days"
      className="rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-5"
    >
      <div className="flex items-center gap-4">
        <Art symbol={reward.symbol} earned={earned} />
        <div>
          <p className="text-sm font-semibold text-[var(--plum)]">Your shared care rhythm</p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--midnight)]">
            {streak.current}-day streak
          </h2>
          <p className="text-sm text-[var(--midnight)]/85">
            {daysTogether} day{daysTogether === 1 ? "" : "s"} on Polly&apos;s Web
          </p>
        </div>
      </div>
      <ol className="mt-5 grid grid-cols-7 gap-1 sm:gap-2">
        {recentDays(todayKey).map((day) => {
          const lit = completed.has(day);
          return (
            <li key={day} className="min-w-0 text-center">
              <span
                className={`mx-auto flex aspect-square w-full max-w-10 items-center justify-center rounded-full ${lit ? "bg-[var(--gold)] text-[var(--panel)]" : "bg-[var(--lavender)]/50 text-[var(--midnight)]/65"}`}
                aria-label={`${day}: ${lit ? "care day completed" : "no completed care day"}`}
              >
                {lit ? "✦" : "·"}
              </span>
              <span className="mt-1 block text-xs text-[var(--midnight)]/85">{day.slice(8)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
