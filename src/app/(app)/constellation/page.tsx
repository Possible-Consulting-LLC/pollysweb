import { AppHeader } from "@/components/layout/nav";
import { CareReview } from "@/components/constellation/care-review";
import { RewardGallery } from "@/components/constellation/reward-gallery";
import { StreakCard } from "@/components/constellation/streak-card";
import { getConstellationData } from "@/lib/constellation-data";
import { requireUser } from "@/lib/session";
import Link from "next/link";

function recentDays(todayKey: string): string[] {
  const today = Date.parse(`${todayKey}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => new Date(today - (6 - index) * 86_400_000).toISOString().slice(0, 10));
}

export default async function ConstellationPage() {
  const user = await requireUser();
  const data = await getConstellationData(user.id!);
  const completed = new Set(data.completedDayKeys);
  return (
    <div className="space-y-7">
      <AppHeader title="Your Constellation" subtitle="A scrapbook of care and little milestones." />
      <StreakCard streak={data.streak} completedToday={data.completedToday} activeCount={data.reviewItems.length} caredCount={data.reviewItems.filter(item => item.caredFor).length} />
      <section aria-label="Recent care days" className="rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--midnight)]">Your last seven days</h2>
          <p className="text-sm text-[var(--midnight)]/85">Best: {data.streak.best} days</p>
        </div>
        <ol className="mt-4 grid grid-cols-7 gap-2">
          {recentDays(data.todayKey).map((day) => {
            const lit = completed.has(day);
            return <li key={day} className="text-center">
              <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${lit ? "bg-[var(--gold)] text-[var(--panel)]" : "bg-[var(--lavender)]/50 text-[var(--midnight)]/65"}`} aria-label={`${day}: ${lit ? "care day completed" : "no completed care day"}`}>
                {lit ? "✦" : "·"}
              </span>
              <span className="mt-1 block text-xs text-[var(--midnight)]/85">{day.slice(8)}</span>
            </li>;
          })}
        </ol>
      </section>
      {data.reviewItems.length === 0 ? (
        <p className="rounded-2xl bg-[var(--card)] p-4 text-sm text-[var(--midnight)]">
          Your first care day begins after you <Link href="/spoods/new" className="font-semibold text-[var(--plum)] underline underline-offset-2">add a spood</Link>.
        </p>
      ) : null}
      <CareReview items={data.reviewItems} completedToday={data.completedToday} />
      <RewardGallery streak={data.streak} stories={data.stories} />
    </div>
  );
}
