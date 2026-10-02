import Link from "next/link";
import { AppHeader } from "@/components/layout/nav";
import { CARE_FEATURE_KEYS, SpoodCareDetails, SpoodIdentity } from "@/components/spoods/spood-card";
import { FeatureGate } from "@/components/features/feature-gate";
import { SpoodSearch } from "@/components/spoods/spood-search";
import { SpoodAccordion } from "@/components/spoods/spood-accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { listSpidersForUser } from "@/lib/spiders";
import { resolveUserGates } from "@/lib/features/gate";
import { requireUser } from "@/lib/session";
import { PREMOLT_STATUSES, SEX_OPTIONS } from "@/lib/constants";
import { getSpiderWriteState } from "@/lib/spider-write-policy";

const SPOOD_LIST_FEATURE_KEYS = ["spood.list.view", "spood.about.view", "housekeeping.log"] as const;

export default async function SpoodsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sex?: string }>;
}) {
  const user = await requireUser();
  const gatesPromise = resolveUserGates(user.id, [...CARE_FEATURE_KEYS, ...SPOOD_LIST_FEATURE_KEYS]);
  const params = await searchParams;
  const gates = await gatesPromise;
  if (gates["spood.list.view"] !== "entitled") {
    return (
      <div className="space-y-6">
        <AppHeader title="My Spoods" subtitle="Everyone in your little web." />
        <FeatureGate state={gates["spood.list.view"]} featureKey="spood.list.view" name="Your spood collection">{null}</FeatureGate>
      </div>
    );
  }
  const hasFilters = Boolean(params.q || params.status || params.sex);
  const careGates = gates;
  const aboutVisible = gates["spood.about.view"] === "entitled";
  const [views, allViews, writeState] = await Promise.all([
    listSpidersForUser(user.id!, { q: params.q, status: params.status, sex: params.sex }),
    hasFilters ? listSpidersForUser(user.id!) : Promise.resolve(null),
    getSpiderWriteState(user.id!),
  ]);
  const collection = allViews ?? views;
  const activeCount = collection.filter((v) => !v.spider.memorializedAt).length;
  const memorialCount = collection.length - activeCount;

  return (
    <div className="space-y-6">
      <AppHeader title="My Spoods" subtitle="Everyone in your little web." />

      <form className="grid gap-2 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-3 sm:grid-cols-4">
        <Field label="Search" htmlFor="q">
          <SpoodSearch key={params.q ?? ""} initialQuery={params.q} names={collection.map(view => view.spider.name)} />
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

      <FeatureGate state={gates["spood.about.view"]} featureKey="spood.about.view" name="Spood profile details">{null}</FeatureGate>

      <SectionHeader
        title={`${activeCount} active`}
        subtitle={
          memorialCount
            ? `${memorialCount} in memory`
            : `${collection.length} spood${collection.length === 1 ? "" : "s"}`
        }
        action={
          <Link href="/spoods/new" className={buttonVariants({ size: "sm" })}>Add a Spood</Link>
        }
      />

      {views.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No matching spoods" : "No spoods yet"}
          body={hasFilters ? "Try clearing or changing the filters." : "Your little corner of the web is looking pretty empty."}
          action={
            hasFilters ? undefined : <Link href="/spoods/new" className={buttonVariants()}>Add your first spood</Link>
          }
        />
      ) : (
        <SpoodAccordion
          items={views.map((view) => {
            const readOnly = !writeState.proAccess && writeState.firstSpiderId !== view.spider.id;
            return {
              id: view.spider.id,
              identity: (
                <SpoodIdentity
                  view={view}
                  linkName={false}
                  readOnly={readOnly}
                  showProfileDetails={aboutVisible}
                />
              ),
              content: (
                <SpoodCareDetails
                  view={view}
                  gates={careGates}
                  readOnly={readOnly}
                  showProfileLink
                />
              ),
              profileAction: (
                <Link
                  href={`/spoods/${view.spider.id}`}
                  className={buttonVariants({ variant: "soft", size: "sm" })}
                >
                  Profile
                </Link>
              ),
            };
          })}
        />
      )}
    </div>
  );
}
