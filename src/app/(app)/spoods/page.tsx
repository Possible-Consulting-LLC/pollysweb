import Link from "next/link";
import { AppHeader } from "@/components/layout/nav";
import { SpoodCareCard } from "@/components/spoods/spood-card";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { listSpidersForUser } from "@/lib/spiders";
import { requireUser } from "@/lib/session";
import { PREMOLT_STATUSES, SEX_OPTIONS } from "@/lib/constants";

export default async function SpoodsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sex?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const views = await listSpidersForUser(user.id!, {
    q: params.q,
    status: params.status,
    sex: params.sex,
  });

  return (
    <div className="space-y-6">
      <AppHeader title="My Spoods" subtitle="Everyone in your little web." />

      <form className="grid gap-2 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-3 sm:grid-cols-4">
        <Field label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={params.q} placeholder="Name or species" />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={params.status || ""}>
            <option value="">Any</option>
            {PREMOLT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sex" htmlFor="sex">
          <Select id="sex" name="sex" defaultValue={params.sex || ""}>
            <option value="">Any</option>
            {SEX_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full" variant="secondary">
            Filter
          </Button>
        </div>
      </form>

      <SectionHeader
        title={`${views.length} spood${views.length === 1 ? "" : "s"}`}
        action={
          <Link href="/spoods/new">
            <Button size="sm">Add a Spood</Button>
          </Link>
        }
      />

      {views.length === 0 ? (
        <EmptyState
          title="No spoods yet"
          body="Your little corner of the web is looking pretty empty."
          action={
            <Link href="/spoods/new">
              <Button>Add your first spood</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {views.map((view) => (
            <SpoodCareCard key={view.spider.id} view={view} />
          ))}
        </div>
      )}
    </div>
  );
}
