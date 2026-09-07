import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { QuickLogButtons } from "@/components/spoods/quick-log";
import { PremoltToggle } from "@/components/spoods/premolt-toggle";
import {
  BodyConditionForm,
  EnclosureForm,
  MaintenanceForm,
  PhotoUploadForm,
} from "@/components/spoods/profile-forms";
import { PhotoGallery } from "@/components/spoods/photo-gallery";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader, StatusPill } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { formatCareWhen, parseHydrationMethods } from "@/lib/utils";
import { getSpiderCare } from "@/lib/spiders";
import { requireUser } from "@/lib/session";
import { isPremoltLike } from "@/lib/care";

export default async function SpiderProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const view = await getSpiderCare(user.id!, id);
  if (!view) notFound();

  const { spider, careStatus } = view;
  const subtitle = [
    spider.sex,
    spider.commonName || spider.species,
    spider.instar,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] bg-[var(--panel)] p-5 text-[var(--on-panel)]">
        <div className="orbit-ring pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full border border-[var(--gold)]/25" />
        <span className="animate-twinkle absolute right-8 top-6 text-[var(--gold)]">
          ✦
        </span>
        <div className="flex gap-4">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[1.5rem] bg-[var(--lavender)] shadow-lg">
            <Image
              src={spider.profilePhoto || "/spoods/defaults/star.svg"}
              alt={spider.name}
              fill
              unoptimized={
                (spider.profilePhoto || "").endsWith(".svg") ||
                !(spider.profilePhoto || "").startsWith("/uploads/")
              }
              className="object-cover"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lavender)]">
              Spood profile
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-none">
              {spider.name}
            </h1>
            <p className="mt-2 text-sm text-[var(--on-panel)]/70">{subtitle}</p>
            <div className="mt-3">
              <StatusPill status={careStatus} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/spoods/${spider.id}/story`}>
            <Button variant="gold" size="sm">
              {spider.name}&apos;s Story
            </Button>
          </Link>
        </div>
      </div>

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
            <dt className="text-xs text-[var(--midnight)]/55">Premolt</dt>
            <dd className="font-semibold">{spider.status}</dd>
          </div>
        </dl>
        {isPremoltLike(spider.status) ? (
          <p className="rounded-2xl bg-[var(--lavender)]/50 px-3 py-2 text-sm text-[var(--plum-deep)]">
            Feeding reminders are paused while {spider.name} may be fasting for
            a molt.
          </p>
        ) : null}
        <QuickLogButtons
          spiderId={spider.id}
          spiderName={spider.name}
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
        />
      </Card>

      <Card className="space-y-3">
        <SectionHeader title="Premolt mode" />
        <Field label="Current phase">
          <PremoltToggle spiderId={spider.id} status={spider.status} />
        </Field>
      </Card>

      <Card className="space-y-2 text-sm">
        <SectionHeader title="About" />
        <p>
          <span className="text-[var(--midnight)]/55">Species: </span>
          {spider.species || "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Acquired: </span>
          {spider.acquisitionDate
            ? format(spider.acquisitionDate, "MMM d, yyyy")
            : "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Hatch: </span>
          {spider.hatchDate
            ? format(spider.hatchDate, "MMM d, yyyy")
            : "Unknown"}
        </p>
        <p>
          <span className="text-[var(--midnight)]/55">Source: </span>
          {spider.source || "Unknown"}
        </p>
        {spider.notes ? (
          <p className="rounded-2xl bg-[var(--cream-deep)]/50 p-3 text-[var(--midnight)]/80">
            {spider.notes}
          </p>
        ) : null}
      </Card>

      <Card>
        <SectionHeader title="Body condition observation" />
        <BodyConditionForm
          spiderId={spider.id}
          currentCondition={view.latestBodyCondition}
        />
      </Card>

      <Card className="space-y-3">
        <SectionHeader
          title="Enclosure"
          subtitle={
            spider.enclosure
              ? "View, edit, or log cleaning"
              : "Add a home for this spood"
          }
        />
        <EnclosureForm
          spiderId={spider.id}
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
        />
        {spider.enclosure ? <MaintenanceForm spiderId={spider.id} /> : null}
      </Card>

      <Card className="space-y-3">
        <SectionHeader title="Photos" subtitle="Add moments to their story" />
        <PhotoUploadForm spiderId={spider.id} />
        <PhotoGallery
          photos={spider.photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
            caption: photo.caption,
            takenAt: photo.takenAt.toISOString(),
          }))}
          profilePhotoUrl={spider.profilePhoto}
          emptyLabel="No photos yet — add one above."
        />
      </Card>
    </div>
  );
}
