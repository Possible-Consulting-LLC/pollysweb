import Link from "next/link";
import { format } from "date-fns";
import { AppHeader } from "@/components/layout/nav";
import { Card, EmptyState, SectionHeader } from "@/components/ui/card";
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
        subtitle="Feedings, molts, mistings and little moments."
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
        <Card className="divide-y divide-[var(--plum)]/10 !p-0 overflow-hidden">
          {activity.map((item) => (
            <Link
              key={`${item.type}-${item.id}`}
              href={`/spoods/${item.spiderId}`}
              className="block px-4 py-3 transition hover:bg-[var(--hover-strong)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--plum)]/70">
                    {item.type}
                  </p>
                  <p className="font-semibold text-[var(--midnight)]">{item.title}</p>
                  {item.detail ? (
                    <p className="text-sm text-[var(--midnight)]/55">{item.detail}</p>
                  ) : null}
                </div>
                <time className="shrink-0 text-xs text-[var(--midnight)]/45">
                  {format(item.date, "MMM d, yyyy")}
                </time>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
