import Link from "next/link";
import { notFound } from "next/navigation";
import { QuickLogButtons } from "@/components/spoods/quick-log";
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
import { requireUser } from "@/lib/session";
import { formatShortDate } from "@/lib/utils";
import { isPremoltLike } from "@/lib/care";
import { getSpiderWriteState } from "@/lib/spider-write-policy";

export default async function SpiderProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { photo: photoFlag } = await searchParams;
  const view = await getSpiderCare(user.id!, id);
  if (!view) notFound();
  const writeState = await getSpiderWriteState(user.id!);
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
        <div className="flex gap-4">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[1.5rem] bg-[var(--lavender)] shadow-lg">
            <SpoodImage
              src={spider.profilePhoto}
              alt={spider.name}
              className="h-full w-full"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--star)]">
              {memorialized ? "In memory" : "Spood profile"}
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-none">
              {spider.name}
            </h1>
            <p className="mt-2 text-sm text-[var(--on-panel)]/70">{subtitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill status={memorialized ? "In memory" : careStatus} />
              {!memorialized && view.mistDue && careStatus !== "Mist today" ? (
                <StatusPill status="Mist today" />
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/spoods/${spider.id}/story`} className={buttonVariants({ variant: "gold", size: "sm" })}>{spider.name}&apos;s Story</Link>
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
              <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {spider.name} could use a little mist today.
              </p>
            ) : null}
            {writable ? <QuickLogButtons
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
              <PremoltToggle spiderId={spider.id} status={spider.status} />
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
          <BodyConditionForm
            spiderId={spider.id}
            currentCondition={view.latestBodyCondition}
          />
        </DisclosureCard>
      ) : null}

      {!memorialized ? (
        <DisclosureCard
          title="Enclosure"
          subtitle={
            spider.enclosure
              ? "View, edit, or log cleaning"
              : "Add a home for this spood"
          }
          defaultOpen={false}
        >
          {writable ? <EnclosureForm
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
            <p className="text-sm text-[var(--midnight)]/75">
              {spider.enclosure?.name || "No enclosure details yet."}
              {spider.enclosure?.dimensions ? ` · ${spider.enclosure.dimensions}` : ""}
            </p>
          )}
          {writable && spider.enclosure ? <MaintenanceForm spiderId={spider.id} /> : null}
        </DisclosureCard>
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
        {memorialized || !writable ? null : <PhotoUploadForm spiderId={spider.id} />}
        <PhotoGallery
          photos={spider.photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
            caption: photo.caption,
            takenAt: photo.takenAt.toISOString(),
          }))}
          profilePhotoUrl={spider.profilePhoto}
          allowManage={writable}
          emptyLabel={
            memorialized
              ? "No photos in this memorial yet."
              : !writable ? "No photos yet." : "No photos yet — add one above."
          }
        />
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
