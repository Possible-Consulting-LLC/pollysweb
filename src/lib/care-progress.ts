import { STORY_REWARDS, STREAK_REWARDS, type StoryRewardGroups, type StreakSummary } from './constellation';
export type CareActivity = { spiderId: string; feeding: boolean; misting: boolean; observation: boolean };
export type ManualCheckin = { spiderId: string; deferred: { feeding?: string; misting?: string } };
export type Celebration = { key: string; title: string; message: string; symbol: string; kind: 'star' | 'badge' };
export function applyCareProgress<T extends { id: string; due: { feeding: boolean; misting: boolean } }>(items: T[], activity: CareActivity[], manual: ManualCheckin[]) {
  return items.map(item => {
    const logged = activity.find(row => row.spiderId === item.id);
    const checked = manual.find(row => row.spiderId === item.id);
    const reviewed = Boolean(checked || logged?.feeding || logged?.misting || logged?.observation);
    const due = { feeding: item.due.feeding && !logged?.feeding, misting: item.due.misting && !logged?.misting };
    const deferred = checked?.deferred ?? {};
    return { ...item, due, reviewed, manuallyReviewed: Boolean(checked), deferred, caredFor: reviewed && (!due.feeding || Boolean(deferred.feeding?.trim())) && (!due.misting || Boolean(deferred.misting?.trim())) };
  });
}
export function earnedCelebrations(streak: StreakSummary, stories: StoryRewardGroups): Celebration[] {
  return [
    ...STREAK_REWARDS.filter(reward => streak.earnedAt[reward.days]).map(reward => ({
      key: `streak:${reward.days}`, title: reward.title, message: `${reward.days} care day${reward.days === 1 ? '' : 's'} in a row!`, symbol: reward.symbol, kind: 'badge' as const,
    })),
    ...STORY_REWARDS.flatMap(reward => stories[reward.id].map(spider => ({
      key: `story:${reward.id}:${spider.spiderId}`, title: reward.title, message: `${spider.spiderName}: ${reward.criterion}.`, symbol: reward.symbol, kind: 'badge' as const,
    }))),
  ];
}
