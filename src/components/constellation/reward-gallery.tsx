import Link from "next/link";
import { Art } from "./reward-art";
import {
  STORY_REWARDS,
  STREAK_REWARDS,
  type StreakSummary,
  type StoryRewardGroups,
  type StoryRewardProgress,
} from "@/lib/constellation";

export function RewardGallery({
  stories,
  progress,
  streak,
}: {
  stories: StoryRewardGroups;
  progress: StoryRewardProgress;
  streak: StreakSummary;
}) {
  return (
    <section aria-labelledby="spood-stories-heading">
      <h2
        id="spood-stories-heading"
        className="font-[family-name:var(--font-display)] text-2xl text-[var(--midnight)]"
      >
        Journey badges
      </h2>
      <p className="mt-1 text-sm text-[var(--midnight)]/85">
        Little moments that happen in their own time.
      </p>
      <p className="mt-2 rounded-2xl bg-[var(--lavender)]/35 px-3 py-2 text-sm text-[var(--midnight)]/80">
        Physical interaction is optional and never required for your shared care streak.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {STREAK_REWARDS.map((reward) => {
          const earnedAt = streak.earnedAt[reward.days];
          const earned = Boolean(earnedAt);
          return (
            <details key={`streak-${reward.days}`} className="group min-w-0 [overflow-wrap:anywhere] relative overflow-hidden rounded-2xl border border-[var(--plum)]/15 bg-[var(--card)] text-center">
              <summary className="flex min-h-32 cursor-pointer list-none flex-col items-center justify-center px-0.5 py-2 sm:px-2 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="relative block rounded-full">
                  <Art symbol={reward.symbol} earned={earned} />
                  {earned ? null : <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[var(--background)]/50" />}
                </span>
                <span className="mt-2 block text-xs font-semibold leading-tight text-[var(--midnight)] sm:text-sm">{reward.title}</span>
              </summary>
              <div className="space-y-2 border-t border-[var(--plum)]/15 p-3 text-left text-xs text-[var(--midnight)] sm:text-sm">
                <p>{reward.days === 1 ? "Complete your first care day" : `Complete ${reward.days} consecutive care days`}</p>
                {earned ? (
                  <p>First earned {earnedAt}</p>
                ) : (
                  <>
                    <p className="font-semibold text-[var(--plum)]">{streak.current} of {reward.days} consecutive care days</p>
                    <p>Not earned yet</p>
                  </>
                )}
              </div>
            </details>
          );
        })}
        {STORY_REWARDS.map((reward) => {
          const earnedStories = stories[reward.id];
          const earned = earnedStories.length > 0;
          return (
            <details
              key={reward.id}
              className="group min-w-0 [overflow-wrap:anywhere] relative overflow-hidden rounded-2xl border border-[var(--plum)]/15 bg-[var(--card)] text-center"
            >
              <summary className="flex min-h-32 cursor-pointer list-none flex-col items-center justify-center px-0.5 py-2 sm:px-2 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="relative block rounded-full">
                  <Art symbol={reward.symbol} earned={earned} />
                  {earned ? null : (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[var(--background)]/50"
                    />
                  )}
                </span>
                <span className="mt-2 block text-xs font-semibold leading-tight text-[var(--midnight)] sm:text-sm">
                  {reward.title}
                </span>
              </summary>
              <div className="space-y-2 border-t border-[var(--plum)]/15 p-3 text-left text-xs text-[var(--midnight)] sm:text-sm">
                <p>{reward.criterion}</p>
                <p className="font-semibold text-[var(--plum)]">{progress[reward.id].label}</p>
                <p>{earned ? `First earned ${earnedStories[0].earnedAt}` : "Not earned yet"}</p>
                {earned ? (
                  <ul className="space-y-1">
                    {earnedStories.map((item) => (
                      <li key={item.spiderId}>
                        <Link
                          href={`/spoods/${item.spiderId}`}
                          className="font-semibold text-[var(--plum)] underline underline-offset-2"
                        >
                          {item.spiderName}
                        </Link>
                        <span className="text-[var(--midnight)]/70"> · {item.earnedAt}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
