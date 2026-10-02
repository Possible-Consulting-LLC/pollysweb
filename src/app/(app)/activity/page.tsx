import { AppHeader } from "@/components/layout/nav";
import { ActivityEditorList } from "@/components/activity/activity-editor";
import { FeatureGate } from "@/components/features/feature-gate";
import { EmptyState, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import {
  getRecentActivity,
  getUserDefaults,
} from "@/lib/spiders";
import { formatDateTimeInZone, resolveDisplayTimeZone } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { resolveUserGates } from "@/lib/features/gate";
import { requireUser } from "@/lib/session";
import { getSpiderWriteState } from "@/lib/spider-write-policy";

const ACTIVITY_FEATURE_KEYS = ["activity.full_history.view", "activity.edit", "activity.delete"] as const;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ spiderId?: string; type?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const gates = await resolveUserGates(user.id, ACTIVITY_FEATURE_KEYS);
  if (gates["activity.full_history.view"] !== "entitled") {
    return (
      <div className="space-y-6">
        <AppHeader title="Recent Activity" subtitle="Feedings, molts, mistings and little moments." />
        <FeatureGate state={gates["activity.full_history.view"]} featureKey="activity.full_history.view" name="Activity history">{null}</FeatureGate>
      </div>
    );
  }
  const [spiders, activity, defaults, writeState] = await Promise.all([
    prisma.spider.findMany({ where: { userId: user.id! }, select: { id: true, name: true, memorializedAt: true }, orderBy: { name: "asc" } }),
    getRecentActivity(user.id!, {
      spiderId: params.spiderId,
      type: params.type,
    }),
    getUserDefaults(user.id!),
    getSpiderWriteState(user.id!),
  ]);
  const zone = await resolveDisplayTimeZone(defaults.timezone);

  return (
    <div className="space-y-6">
      <AppHeader
        title="Recent Activity"
        subtitle="Feedings, molts, mistings and little moments — tap Edit to fix a time or detail."
      />

      <form className="grid gap-2 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-3 sm:grid-cols-3">
        <Field label="Spider" htmlFor="spiderId">
          <Select id="spiderId" name="spiderId" defaultValue={params.spiderId || ""}>
            <option value="">All spoods</option>
            {[...spiders].sort((a, b) => Number(Boolean(a.memorializedAt)) - Number(Boolean(b.memorializedAt)) || a.name.localeCompare(b.name)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" defaultValue={params.type || "all"}>
            <option value="all">All</option>
            <option value="feeding">Feeding</option>
            <option value="misting">Misting</option>
            <option value="molt">Molt</option>
            <option value="observation">Observation</option>
            <option value="maintenance">Maintenance</option>
            <option value="body">Body condition</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">
            Filter
          </Button>
        </div>
      </form>

      <FeatureGate state={gates["activity.edit"]} featureKey="activity.edit" name="Editing activity entries">{null}</FeatureGate>
      <FeatureGate state={gates["activity.delete"]} featureKey="activity.delete" name="Deleting activity entries">{null}</FeatureGate>

      <SectionHeader title={`${activity.length} moments`} />

      {activity.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          body="Feedings, molts, mistings and little moments will show up here."
        />
      ) : (
        <ActivityEditorList
          allowEdit={gates["activity.edit"] === "entitled"}
          allowDelete={gates["activity.delete"] === "entitled"}
          writableSpiderIds={writeState.proAccess ? spiders.map((spider) => spider.id) : writeState.firstSpiderId ? [writeState.firstSpiderId] : []}
          items={activity.map((item) => ({
            id: item.id,
            type: item.type,
            spiderId: item.spiderId,
            spiderName: item.spiderName,
            title: item.title,
            detail: item.detail,
            dateLabel: formatDateTimeInZone(item.date, zone),
            fields: item.fields,
          }))}
        />
      )}
    </div>
  );
}
