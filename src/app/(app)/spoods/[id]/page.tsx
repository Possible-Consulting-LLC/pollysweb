import Link from "next/link";
import { notFound } from "next/navigation";
import { CARE_FEATURE_KEYS, GatedQuickLogButtons } from "@/components/spoods/spood-card";
import { FeatureGate } from "@/components/features/feature-gate";
import { PremoltToggle } from "@/components/spoods/premolt-toggle";
import { AboutForm } from "@/components/spoods/about-form";
import {
  BodyConditionForm,
  EnclosureForm,
  MaintenanceForm,
  PhotoUploadForm,
} from "@/components/spoods/profile-forms";
import { MemorialPanel } from "@/components/spoods/memorial-panel";
import { PhotoGallery } from "@/components/spoods/photo-gallery";
import { SpoodImage } from "@/components/spoods/spood-image";
import { buttonVariants } from "@/components/ui/button";
import { Card, SectionHeader, StatusPill } from "@/components/ui/card";
import { DisclosureCard } from "@/components/ui/disclosure-card";
import { Field } from "@/components/ui/field";
import { formatCareWhen, parseHydrationMethods } from "@/lib/utils";
import { getSpiderCare } from "@/lib/spiders";
import { resolveUserGates } from "@/lib/features/gate";
import { requireUser } from "@/lib/session";
import { formatShortDate } from "@/lib/utils";
import { isPremoltLike } from "@/lib/care";
import { getSpiderWriteState } from "@/lib/spider-write-policy";

const PHOTO_FEATURE_KEYS = [
  "photo.upload",
  "photo.gallery.view",
  "photo.profile.set",
  "photo.delete",
] as const;

const HABITAT_FEATURE_KEYS = ["enclosure.view", "enclosure.manage", "housekeeping.log"] as const;

export default async function SpiderProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string }>;
}) {
  const user = await requireUser();
  const gatesPromise = resolveUserGates(user.id, [...CARE_FEATURE_KEYS, ...PHOTO_FEATURE_KEYS, ...HABITAT_FEATURE_KEYS]);
  const { id } = await params;
  const { photo: photoFlag } = await searchParams;
  const [view, writeState, gates] = await Promise.all([
    getSpiderCare(user.id!, id),
    getSpiderWriteState(user.id!),
    gatesPromise,
  ]);
  const careGates = gates;
  if (!view) notFound();
  const writable = writeState.proAccess || writeState.firstSpiderId === id;

  const { spider, careStatus } = view;
  const memorialized = Boolean(spider.memorializedAt);
  const subtitle = [
    spider.sex,
    spider.commonName || spider.species,
    spider.instar,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      {photoFlag === "skipped" ? (
        <p
          className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Spood saved, but the photo upload was blocked. You can add a photo from
          this profile — if it keeps failing, check the Supabase Storage settings
          and server-only service key in staging.
        </p>
      ) : null}
      {!writable ? (
        <p className="rounded-2xl border border-[var(--plum)]/20 bg-[var(--lavender)]/45 px-4 py-3 text-sm text-[var(--midnight)]" role="status">
          This spood is read-only on your current plan. You can still enjoy its photos and history. <Link href="/upgrade" className="font-semibold underline underline-offset-2">Manage billing</Link> to make changes again.
        </p>
      ) : null}
      <div className="relative overflow-hidden rounded-[2rem] bg-[var(--panel)] p-5 text-[var(--on-panel)]">
        <div className="orbit-ring pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full border border-[var(--gold)]/25" />
        <span className="animate-twinkle absolute right-8 top-6 text-[var(--gold)]">
          ✦
        </span>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 sm:gap-y-0">
          <div className="relative h-24 w-24 sm:row-span-2 sm:h-28 sm:w-28 shrink-0 overflow-hidden rounded-[1.5rem] bg-[var(--lavender)] shadow-lg">
            <SpoodImage
              src={spider.profilePhoto}
              alt={spider.name}
              className="h-full w-full"
              priority
            />
          </div>
          <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--star)]">
              {memorialized ? "In memory" : "Spood profile"}
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-none [overflow-wrap:anywhere]">
              {spider.name}
            </h1>
            <p className="mt-2 text-sm text-[var(--on-panel)]/70 [overflow-wrap:anywhere]">{subtitle}</p>
          </div>
          <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap content-center items-start gap-2 sm:row-start-2 sm:mt-3 sm:content-start">
            <StatusPill status={memorialized ? "In memory" : careStatus} />
            {!memorialized && view.mistDue && careStatus !== "Mist today" ? (
              <StatusPill status="Mist today" />
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/spoods/${spider.id}/story`} className={buttonVariants({ variant: "gold", size: "sm" })}>View {spider.name}&apos;s Story</Link>
        </div>
      </div>

      {memorialized ? (
        <Card className="space-y-2">
          <SectionHeader title="Memorial" />
          {writable ? <MemorialPanel
            spiderId={spider.id}
            spiderName={spider.name}
            memorialized
            passedOn={
              spider.passedOn ? formatShortDate(spider.passedOn) : null
            }
            memorialNote={spider.memorialNote}
          /> : (
            <p className="text-sm text-[var(--midnight)]/75">{spider.memorialNote || "Their story remains here."}</p>
          )}
        </Card>
      ) : null}

      {!memorialized ? (
        <>
          <Card className="space-y-3">
            <SectionHeader title="Current care" />
            <FeatureGate state={careGates["care.status.view"]} featureKey="care.status.view" name="Care status">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
                  <dt className="text-xs text-[var(--midnight)]/55">Last fed</dt>
                  <dd className="font-semibold">
                    {formatCareWhen(view.lastFedAt)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
                  <dt className="text-xs text-[var(--midnight)]/55">
                    Last successful meal
                  </dt>
                  <dd className="font-semibold">
                    {formatCareWhen(view.lastSuccessfulFedAt)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
                  <dt className="text-xs text-[var(--midnight)]/55">Last hydrated</dt>
                  <dd className="font-semibold">
                    {formatCareWhen(view.lastMistedAt)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
                  <dt className="text-xs text-[var(--midnight)]/55">Days since molt</dt>
                  <dd className="font-semibold">
                    {view.daysSinceMolt === null ? "—" : view.daysSinceMolt}
                  </dd>
                </div>
                <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
                  <dt className="text-xs text-[var(--midnight)]/55">Body condition</dt>
                  <dd className="font-semibold">
                    {view.latestBodyCondition ?? "—"}
                  </dd>
                </div>
                <div className="rounded-2xl bg-[var(--cream-deep)]/60 p-3">
                  <dt className="text-xs text-[var(--midnight)]/55">Molt phase</dt>
                  <dd className="font-semibold">{spider.status}</dd>
                </div>
              </dl>
              {isPremoltLike(spider.status) ? (
                <p className="rounded-2xl bg-[var(--lavender)]/50 px-3 py-2 text-sm text-[var(--plum-deep)]">
                  Feeding reminders are paused while {spider.name} may be fasting for
                  a molt.
                </p>
              ) : null}
              {view.mistDue && careStatus !== "Mist today" ? (
                <p className="rounded-2xl bg-emerald-100 px-3 py-2 text-sm text-emerald-950">
                  {spider.name} could use a little mist today.
                </p>
              ) : null}
            </FeatureGate>
            {writable ? <GatedQuickLogButtons
              gates={careGates}
              spiderId={spider.id}
              spiderName={spider.name}
              currentLifeStage={spider.instar}
              hasEnclosure={Boolean(spider.enclosure)}
              lastFeeding={
                spider.feedings[0]
                  ? {
                      preyType: spider.feedings[0].preyType,
                      quantity: spider.feedings[0].quantity,
                      outcome: spider.feedings[0].outcome,
                    }
                  : null
              }
              lastHydration={
                spider.mistings[0]
                  ? {
                      methods: parseHydrationMethods(spider.mistings[0]),
                    }
                  : null
              }
            /> : null}
          </Card>

          {writable ? <DisclosureCard title="Molt phase" defaultOpen={false}>
            <Field label="Current phase">
              <FeatureGate state={careGates["care.premolt.manage"]} featureKey="care.premolt.manage" name="Molt phase tracking">
                <PremoltToggle spiderId={spider.id} status={spider.status} />
              </FeatureGate>
            </Field>
          </DisclosureCard> : null}
        </>
      ) : null}

      <DisclosureCard
        title="About"
        subtitle="Name, species, dates, and notes"
        defaultOpen={false}
      >
        {writable ? <AboutForm
          spiderId={spider.id}
          about={{
            name: spider.name,
            commonName: spider.commonName,
            species: spider.species,
            sex: spider.sex,
            instar: spider.instar,
            hatchDate: spider.hatchDate
              ? spider.hatchDate.toISOString()
              : null,
            acquisitionDate: spider.acquisitionDate
              ? spider.acquisitionDate.toISOString()
              : null,
            source: spider.source,
            notes: spider.notes,
          }}
        /> : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-[var(--midnight)]/60">Species</dt><dd>{spider.commonName || spider.species || "—"}</dd></div>
            <div><dt className="text-[var(--midnight)]/60">Life stage</dt><dd>{spider.instar || "—"}</dd></div>
            <div><dt className="text-[var(--midnight)]/60">Source</dt><dd>{spider.source || "—"}</dd></div>
            <div><dt className="text-[var(--midnight)]/60">Notes</dt><dd>{spider.notes || "—"}</dd></div>
          </dl>
        )}
      </DisclosureCard>

      {!memorialized && writable ? (
        <DisclosureCard title="Body condition observation" defaultOpen={false}>
          <FeatureGate state={careGates["care.body_condition.log"]} featureKey="care.body_condition.log" name="Logging body condition">
            <BodyConditionForm
              spiderId={spider.id}
              currentCondition={view.latestBodyCondition}
            />
          </FeatureGate>
        </DisclosureCard>
      ) : null}

      {!memorialized ? (
        <FeatureGate state={gates["enclosure.view"]} featureKey="enclosure.view" name="Enclosure details">
          <DisclosureCard
            title="Enclosure"
            subtitle={
              spider.enclosure
                ? "View, edit, or log cleaning"
                : "Add a home for this spood"
            }
            defaultOpen={false}
          >
            {writable && gates["enclosure.manage"] === "entitled" ? <EnclosureForm
              spiderId={spider.id}
              timeZone={view.timeZone}
              enclosure={
                spider.enclosure
                  ? {
                      name: spider.enclosure.name,
                      type: spider.enclosure.type,
                      dimensions: spider.enclosure.dimensions,
                      notes: spider.enclosure.notes,
                      setupDate: spider.enclosure.setupDate
                        ? spider.enclosure.setupDate.toISOString()
                        : null,
                      lastCleaned: spider.enclosure.lastCleaned
                        ? spider.enclosure.lastCleaned.toISOString()
                        : null,
                      lastRehoused: spider.enclosure.lastRehoused
                        ? spider.enclosure.lastRehoused.toISOString()
                        : null,
                    }
                  : null
              }
            /> : (
              <>
                <p className="text-sm text-[var(--midnight)]/75">
                  {spider.enclosure?.name || "No enclosure details yet."}
                  {spider.enclosure?.dimensions ? ` · ${spider.enclosure.dimensions}` : ""}
                </p>
                {writable ? (
                  <FeatureGate state={gates["enclosure.manage"]} featureKey="enclosure.manage" name="Managing the enclosure">{null}</FeatureGate>
                ) : null}
              </>
            )}
            {writable && spider.enclosure ? (
              <div className="mt-6">
                <FeatureGate state={gates["housekeeping.log"]} featureKey="housekeeping.log" name="Logging housekeeping">
                  <MaintenanceForm spiderId={spider.id} />
                </FeatureGate>
              </div>
            ) : null}
          </DisclosureCard>
        </FeatureGate>
      ) : null}

      <DisclosureCard
        title="Photos"
        subtitle={
          memorialized
            ? "Moments from their story"
            : writable ? "Add moments to their story" : "Moments from their story"
        }
        defaultOpen={false}
      >
        {memorialized || !writable ? null : (
          <FeatureGate state={gates["photo.upload"]} featureKey="photo.upload" name="Photo uploads">
            <PhotoUploadForm spiderId={spider.id} allowSetAsProfile={gates["photo.profile.set"] === "entitled"} />
          </FeatureGate>
        )}
        <FeatureGate state={gates["photo.gallery.view"]} featureKey="photo.gallery.view" name="Photo gallery">
          <PhotoGallery
            photos={spider.photos.map((photo) => ({
              id: photo.id,
              url: photo.url,
              caption: photo.caption,
              takenAt: photo.takenAt.toISOString(),
            }))}
            profilePhotoUrl={spider.profilePhoto}
            allowManage={writable}
            allowSetProfile={gates["photo.profile.set"] === "entitled"}
            allowDelete={gates["photo.delete"] === "entitled"}
            emptyLabel={
              memorialized
                ? "No photos in this memorial yet."
                : !writable ? "No photos yet." : "No photos yet — add one above."
            }
          />
          {writable ? (
            <>
              <FeatureGate state={gates["photo.profile.set"]} featureKey="photo.profile.set" name="Choosing a profile photo">{null}</FeatureGate>
              <FeatureGate state={gates["photo.delete"]} featureKey="photo.delete" name="Deleting photos">{null}</FeatureGate>
            </>
          ) : null}
        </FeatureGate>
      </DisclosureCard>

      {!memorialized && writable ? (
        <DisclosureCard
          title="Memorial"
          subtitle="Keep their story without using a free plan slot"
          defaultOpen={false}
        >
          <MemorialPanel
            spiderId={spider.id}
            spiderName={spider.name}
            memorialized={false}
            passedOn={null}
            memorialNote={null}
          />
        </DisclosureCard>
      ) : null}
    </div>
  );
}
