import Link from "next/link";
import { Art } from "./reward-art";
import {
  STORY_REWARDS, STREAK_REWARDS,
  type StoryRewardGroups, type StreakSummary,
} from "@/lib/constellation";

function RewardTile({
  title, criterion, symbol, earnedAt, children,
}: {
  title: string;
  criterion: string;
  symbol: Parameters<typeof Art>[0]['symbol'];
  earnedAt?: string;
  children?: React.ReactNode;
}) {
  const earned = Boolean(earnedAt);
  const content = (
    <>
      <Art symbol={symbol} earned={earned} />
      <span className="mt-3 block font-semibold text-[var(--midnight)]">{title}</span>
      <span className="mt-1 block text-sm text-[var(--midnight)]/85">{criterion}</span>
      <span className="mt-2 block text-xs font-semibold text-[var(--plum)]">{earned ? `Earned ${earnedAt}` : "To discover"}</span>
    </>
  );
  return earned && children ? (
    <details className="group rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4 text-center">
      <summary className="flex cursor-pointer list-none flex-col items-center marker:hidden">{content}</summary>
      <div className="mt-3 border-t border-[var(--plum)]/15 pt-3 text-left text-sm text-[var(--midnight)]">{children}</div>
    </details>
  ) : (
    <div className="flex flex-col items-center rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-4 text-center">{content}</div>
  );
}

export function RewardGallery({ streak, stories }: { streak: StreakSummary; stories: StoryRewardGroups }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="care-rhythm-heading">
        <h2 id="care-rhythm-heading" className="font-[family-name:var(--font-display)] text-2xl text-[var(--midnight)]">Care rhythm</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {STREAK_REWARDS.map((reward) => (
            <RewardTile key={reward.days} title={reward.title} criterion={`${reward.days} care day${reward.days === 1 ? "" : "s"} in a row`} symbol={reward.symbol} earnedAt={streak.earnedAt[reward.days]} />
          ))}
        </div>
      </section>
      <section aria-labelledby="spood-stories-heading">
        <h2 id="spood-stories-heading" className="font-[family-name:var(--font-display)] text-2xl text-[var(--midnight)]">Spood stories</h2>
        <p className="mt-1 text-sm text-[var(--midnight)]/85">Little moments that happen in their own time.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {STORY_REWARDS.map((reward) => {
            const earned = stories[reward.id];
            return (
              <RewardTile key={reward.id} title={reward.title} criterion={reward.criterion} symbol={reward.symbol} earnedAt={earned[0]?.earnedAt}>
                <ul className="space-y-2">
                  {earned.map((item) => (
                    <li key={item.spiderId}>
                      <Link href={`/spoods/${item.spiderId}`} className="font-semibold text-[var(--plum)] underline underline-offset-2">{item.spiderName}</Link>
                      <span className="text-[var(--midnight)]/70"> · {item.earnedAt}</span>
                    </li>
                  ))}
                </ul>
              </RewardTile>
            );
          })}
        </div>
      </section>
    </div>
  );
}
