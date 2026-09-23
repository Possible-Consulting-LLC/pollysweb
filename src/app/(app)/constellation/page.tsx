import { AppHeader } from "@/components/layout/nav";
import { CareReview } from "@/components/constellation/care-review";
import { RecentCareMeter } from "@/components/constellation/recent-care-meter";
import { RewardGallery } from "@/components/constellation/reward-gallery";
import { getConstellationData } from "@/lib/constellation-data";
import { requireUser } from "@/lib/session";
import Link from "next/link";

export default async function ConstellationPage() {
  const user = await requireUser();
  const data = await getConstellationData(user.id!);
  return (
    <div className="space-y-7">
      <AppHeader
        title="Your Care Journey"
        subtitle="Shared progress for every spood in your care, gathered in one place."
      />
      <RecentCareMeter
        todayKey={data.todayKey}
        completedDayKeys={data.completedDayKeys}
        streak={data.streak}
      />
      {data.reviewItems.length === 0 ? (
        <p className="rounded-2xl bg-[var(--card)] p-4 text-sm text-[var(--midnight)]">
          Your first care day begins after you <Link href="/spoods/new" className="font-semibold text-[var(--plum)] underline underline-offset-2">add a spood</Link>.
        </p>
      ) : null}
      <CareReview items={data.reviewItems} completedToday={data.completedToday} />
      <RewardGallery stories={data.stories} progress={data.storyProgress} />
    </div>
  );
}
