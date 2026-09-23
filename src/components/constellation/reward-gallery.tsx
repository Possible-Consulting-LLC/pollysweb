import Link from "next/link";
import { Art } from "./reward-art";
import {
  STORY_REWARDS,
  type StoryRewardGroups,
  type StoryRewardProgress,
} from "@/lib/constellation";

export function RewardGallery({
  stories,
  progress,
}: {
  stories: StoryRewardGroups;
  progress: StoryRewardProgress;
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
        {STORY_REWARDS.map((reward) => {
          const earned = stories[reward.id];
          const unlocked = earned.length > 0;
          return (
            <details
              key={reward.id}
              className="group relative overflow-hidden rounded-2xl border border-[var(--plum)]/15 bg-[var(--card)] text-center"
            >
              <summary className="flex min-h-32 cursor-pointer list-none flex-col items-center justify-center p-2 marker:content-none [&::-webkit-details-marker]:hidden">
                <Art symbol={reward.symbol} earned={unlocked} />
                <span className="mt-2 block text-xs font-semibold leading-tight text-[var(--midnight)] sm:text-sm">
                  {reward.title}
                </span>
              </summary>
              <div className="space-y-2 border-t border-[var(--plum)]/15 p-3 text-left text-xs text-[var(--midnight)] sm:text-sm">
                <p>{reward.criterion}</p>
                <p className="font-semibold text-[var(--plum)]">{progress[reward.id].label}</p>
                <p>{earned.length ? `First earned ${earned[0].earnedAt}` : "Not earned yet"}</p>
                {earned.length ? (
                  <ul className="space-y-1">
                    {earned.map((item) => (
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
              {!unlocked ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[var(--background)]/50"
                />
              ) : null}
            </details>
          );
        })}
      </div>
    </section>
  );
}
