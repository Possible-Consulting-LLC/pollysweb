import Link from "next/link";
import { AppHeader } from "@/components/layout/nav";
import { SpoodCareCard } from "@/components/spoods/spood-card";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, SectionHeader, StatusPill } from "@/components/ui/card";
import { getRecentActivity, getUserDefaults, listSpidersForUser } from "@/lib/spiders";
import { requireUser } from "@/lib/session";
import { format } from "date-fns";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const user = await requireUser();
  const defaults = await getUserDefaults(user.id!);
  const views = await listSpidersForUser(user.id!);
  const activity = await getRecentActivity(user.id!);

  const active = views.filter((v) => !v.spider.memorializedAt);
  const memorial = views.filter((v) => v.spider.memorializedAt);
  const needing = active.filter((v) => v.careStatus !== "All good");
  const name = defaults.name || "keeper";

  return (
    <div className="space-y-8">
      <AppHeader
        title={`${greeting()}, ${name}.`}
        subtitle="Here’s what your little corner needs today."
      />

      <section>
        <SectionHeader
          title="Needs attention"
          subtitle={
            needing.length
              ? `${needing.length} spood${needing.length === 1 ? "" : "s"} could use a moment`
              : "Everyone looks cozy"
          }
          action={
            <Link href="/spoods/new">
              <Button variant="ghost" size="sm">
                Add
              </Button>
            </Link>
          }
        />
        {active.length === 0 && memorial.length === 0 ? (
          <EmptyState
            title="No spoods yet"
            body="Your little corner of the web is looking pretty empty."
            action={
              <Link href="/spoods/new">
                <Button>Add your first spood</Button>
              </Link>
            }
          />
        ) : needing.length === 0 ? (
          <Card>
            <p className="font-[family-name:var(--font-display)] text-lg text-[var(--midnight)]">
              All clear among the stars ✦
            </p>
            <p className="mt-1 text-sm text-[var(--midnight)]/60">
              No urgent care needs right now. Enjoy a quiet moment with your spoods.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {needing.map((view) => (
              <SpoodCareCard key={view.spider.id} view={view} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title="All spoods"
          subtitle={`${active.length} active${memorial.length ? ` · ${memorial.length} in memory` : ""}`}
        />
        <div className="flex flex-wrap gap-2">
          {views.map((v) => (
            <Link
              key={v.spider.id}
              href={`/spoods/${v.spider.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--plum)]/15 bg-[var(--card)] px-3 py-2 text-sm transition hover:border-[var(--plum)]/30 hover:bg-[var(--hover-strong)]"
            >
              <span className="font-semibold text-[var(--midnight)]">{v.spider.name}</span>
              <StatusPill
                status={v.spider.memorializedAt ? "In memory" : v.careStatus}
              />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Recent activity"
          action={
            <Link href="/activity">
              <Button variant="ghost" size="sm">
                See all
              </Button>
            </Link>
          }
        />
        {activity.length === 0 ? (
          <EmptyState
            title="Nothing logged yet"
            body="Feedings, molts, mistings and little moments will show up here."
          />
        ) : (
          <Card className="divide-y divide-[var(--plum)]/10 !p-0 overflow-hidden">
            {activity.slice(0, 6).map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={`/spoods/${item.spiderId}`}
                className="block px-4 py-3 transition hover:bg-[var(--hover-strong)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--midnight)]">
                      {item.title}
                    </p>
                    {item.detail ? (
                      <p className="text-xs text-[var(--midnight)]/55">{item.detail}</p>
                    ) : null}
                  </div>
                  <time className="shrink-0 text-xs text-[var(--midnight)]/45">
                    {format(item.date, "MMM d")}
                  </time>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionHeader title="Quick actions" />
        <div className="grid grid-cols-2 gap-2">
          <Link href="/spoods/new">
            <Button variant="secondary" className="h-14 w-full">
              Add a Spood
            </Button>
          </Link>
          <Link href="/activity">
            <Button variant="soft" className="h-14 w-full">
              Browse Activity
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
