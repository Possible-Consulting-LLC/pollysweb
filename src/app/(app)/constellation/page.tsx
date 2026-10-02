import { AppHeader } from "@/components/layout/nav";
import { CareReview } from "@/components/constellation/care-review";
import { RecentCareMeter } from "@/components/constellation/recent-care-meter";
import { RewardGallery } from "@/components/constellation/reward-gallery";
import { FeatureGate } from "@/components/features/feature-gate";
import { getConstellationData } from "@/lib/constellation-data";
import { resolveUserGates } from "@/lib/features/gate";
import { requireUser } from "@/lib/session";
import Link from "next/link";

const JOURNEY_FEATURE_KEYS = [
  "universe.view",
  "journey.check_in",
  "journey.streaks.view",
  "journey.badges.view",
] as const;

export default async function ConstellationPage() {
  const user = await requireUser();
  const [data, gates] = await Promise.all([
    getConstellationData(user.id!),
    resolveUserGates(user.id, JOURNEY_FEATURE_KEYS),
  ]);
  return (
    <div className="space-y-7">
      <AppHeader
        title="Your Care Journey"
        subtitle="Shared progress for every spood in your care, gathered in one place."
      />
      <FeatureGate state={gates["universe.view"]} featureKey="universe.view" name="Care journey">
        <div className="space-y-7">
          <FeatureGate state={gates["journey.streaks.view"]} featureKey="journey.streaks.view" name="Care streaks">
            <RecentCareMeter
              daysTogether={data.daysTogether}
              todayKey={data.todayKey}
              completedDayKeys={data.completedDayKeys}
              streak={data.streak}
            />
          </FeatureGate>
          {data.reviewItems.length === 0 ? (
            <p className="rounded-2xl bg-[var(--card)] p-4 text-sm text-[var(--midnight)]">
              Your first care day begins after you <Link href="/spoods/new" className="font-semibold text-[var(--plum)] underline underline-offset-2">add a spood</Link>.
            </p>
          ) : null}
          <FeatureGate state={gates["journey.check_in"]} featureKey="journey.check_in" name="Completing your care day">
            <CareReview items={data.reviewItems} completedToday={data.completedToday} />
          </FeatureGate>
          <FeatureGate state={gates["journey.badges.view"]} featureKey="journey.badges.view" name="Rewards and stories">
            <RewardGallery streak={data.streak} stories={data.stories} progress={data.storyProgress} />
          </FeatureGate>
        </div>
      </FeatureGate>
    </div>
  );
}
