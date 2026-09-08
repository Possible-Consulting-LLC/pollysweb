import { format } from "date-fns";
import { AppHeader } from "@/components/layout/nav";
import { ActivityEditorList } from "@/components/activity/activity-editor";
import { EmptyState, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { getRecentActivity, listSpidersForUser } from "@/lib/spiders";
import { requireUser } from "@/lib/session";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ spiderId?: string; type?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const spiders = await listSpidersForUser(user.id!);
  const activity = await getRecentActivity(user.id!, {
    spiderId: params.spiderId,
    type: params.type,
  });

  return (
    <div className="space-y-6">
      <AppHeader
        title="Recent Activity"
        subtitle="Feedings, molts, mistings and little moments — tap Edit to fix a date or detail."
      />

      <form className="grid gap-2 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-3 sm:grid-cols-3">
        <Field label="Spider" htmlFor="spiderId">
          <Select id="spiderId" name="spiderId" defaultValue={params.spiderId || ""}>
            <option value="">All spoods</option>
            {spiders.map((s) => (
              <option key={s.spider.id} value={s.spider.id}>
                {s.spider.name}
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

      <SectionHeader title={`${activity.length} moments`} />

      {activity.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          body="Feedings, molts, mistings and little moments will show up here."
        />
      ) : (
        <ActivityEditorList
          items={activity.map((item) => ({
            id: item.id,
            type: item.type,
            spiderId: item.spiderId,
            spiderName: item.spiderName,
            title: item.title,
            detail: item.detail,
            dateLabel: format(item.date, "MMM d, yyyy"),
            fields: item.fields,
          }))}
        />
      )}
    </div>
  );
}
