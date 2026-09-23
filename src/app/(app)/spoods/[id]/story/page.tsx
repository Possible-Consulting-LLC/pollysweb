import { observationLabel } from "@/lib/constants";
import { SpoodImage } from "@/components/spoods/spood-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityEditorRow } from "@/components/activity/activity-editor";
import { PhotoOpenButton } from "@/components/spoods/photo-gallery";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShortDate, formatDateTimeInZone, resolveDisplayTimeZone, toDateTimeLocalInputValue } from "@/lib/utils";
import { getSpiderStory, getUserDefaults } from "@/lib/spiders";
import { requireUser } from "@/lib/session";
import { parseHydrationMethods } from "@/lib/utils";
import { getSpiderWriteState } from "@/lib/spider-write-policy";

type StoryEvent = {
  id: string;
  date: Date;
  kind: "acquired" | "molt" | "observation" | "feeding" | "photo" | "misting" | "body" | "maintenance";
  title: string;
  detail?: string | null;
  photo?: string | null;
  moltGap?: number | null;
  instarLabel?: string | null;
  editable?: boolean;
  fields?: {
    date: string;
    timeZone?: string;
    preyType?: string;
    quantity?: number;
    preySize?: string | null;
    outcome?: string;
    notes?: string | null;
    methods?: string[];
    previousInstar?: string | null;
    newInstar?: string | null;
    approximate?: boolean;
    successful?: boolean;
    kind?: string;
    condition?: string;
    caption?: string | null;
  };
};

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ before?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { before } = await searchParams;
  const [view, defaults, writeState] = await Promise.all([
    getSpiderStory(user.id!, id, before),
    getUserDefaults(user.id!),
    getSpiderWriteState(user.id!),
  ]);
  if (!view) notFound();
  const { spider } = view;
  const writable = writeState.proAccess || writeState.firstSpiderId === id;
  const zone = await resolveDisplayTimeZone(defaults.timezone);

  const events: StoryEvent[] = [];

  if (spider.acquisitionDate && view.includeAcquisition) {
    events.push({
      id: "acquired",
      date: spider.acquisitionDate,
      kind: "acquired",
      title: "Came home",
      detail: spider.source ? `From ${spider.source}` : "A new corner of the web",
      photo: spider.profilePhoto,
    });
  }

  for (const molt of [...spider.molts].sort(
    (a, b) => a.moltDate.getTime() - b.moltDate.getTime(),
  )) {
    events.push({
      id: molt.id,
      date: molt.moltDate,
      kind: "molt",
      title: molt.newInstar ? `Molted to ${molt.newInstar}` : "Molt",
      detail: molt.notes,
      photo: molt.postMoltPhoto || molt.moltPhoto,
      moltGap: molt.daysSincePriorMolt,
      instarLabel: molt.newInstar,
      editable: true,
      fields: {
        timeZone: zone,
        date: toDateTimeLocalInputValue(molt.moltDate, zone),
        previousInstar: molt.previousInstar,
        newInstar: molt.newInstar,
        approximate: molt.approximate,
        successful: molt.successful,
        notes: molt.notes,
      },
    });
  }

  for (const obs of spider.observations) {
    events.push({
      id: obs.id,
      date: obs.date,
      kind: "observation",
      title: observationLabel(obs.kind),
      detail: obs.notes,
      photo: obs.photoUrl,
      editable: true,
      fields: {
        timeZone: zone,
        date: toDateTimeLocalInputValue(obs.date, zone),
        kind: obs.kind,
        notes: obs.notes,
      },
    });
  }

  for (const feed of spider.feedings) {
    events.push({
      id: feed.id,
      date: feed.date,
      kind: "feeding",
      title: `Fed ${feed.quantity}× ${feed.preyType}`,
      detail: feed.outcome,
      photo: feed.photoUrl,
      editable: true,
      fields: {
        timeZone: zone,
        date: toDateTimeLocalInputValue(feed.date, zone),
        preyType: feed.preyType,
        quantity: feed.quantity,
        preySize: feed.preySize,
        outcome: feed.outcome,
        notes: feed.notes,
      },
    });
  }

  for (const mist of spider.mistings) {
    const methods = parseHydrationMethods(mist);
    events.push({
      id: mist.id,
      date: mist.date,
      kind: "misting",
      title: "Hydration",
      detail: methods.join(" · ") || mist.notes,
      editable: true,
      fields: {
        timeZone: zone,
        date: toDateTimeLocalInputValue(mist.date, zone),
        methods,
        notes: mist.notes,
      },
    });
  }

  for (const body of spider.bodyConditions) {
    events.push({
      id: body.id,
      date: body.date,
      kind: "body",
      title: `Body condition: ${body.condition}`,
      detail: body.notes,
      editable: true,
      fields: {
        timeZone: zone,
        date: toDateTimeLocalInputValue(body.date, zone),
        condition: body.condition,
        notes: body.notes,
      },
    });
  }

  if (spider.enclosure) {
    const maintenance =
      "maintenance" in spider.enclosure && Array.isArray(spider.enclosure.maintenance)
        ? spider.enclosure.maintenance
        : [];
    for (const maint of maintenance as {
      id: string;
      date: Date;
      kind: string;
      notes: string | null;
    }[]) {
      events.push({
        id: maint.id,
        date: maint.date,
        kind: "maintenance",
        title: `Enclosure ${maint.kind}`,
        detail: maint.notes,
        editable: true,
        fields: {
        timeZone: zone,
          date: toDateTimeLocalInputValue(maint.date, zone),
          kind: maint.kind,
          notes: maint.notes,
        },
      });
    }
  }

  for (const photo of spider.photos) {
    if (events.some((e) => e.photo === photo.url)) continue;
    events.push({
      id: photo.id,
      date: photo.takenAt,
      kind: "photo",
      title: photo.caption || "A captured moment",
      photo: photo.url,
      editable: true,
      fields: {
        timeZone: zone,
        date: toDateTimeLocalInputValue(photo.takenAt, zone),
        caption: photo.caption,
      },
    });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const galleryPhotos = events
    .filter((event) => event.photo)
    .map((event) => ({
      id: `${event.kind}-${event.id}`,
      url: event.photo as string,
      caption: event.title,
      takenAt: event.date.toISOString(),
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--plum)]/70">
            Spoodly Story
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--midnight)]">
            {spider.name}&apos;s Story
          </h1>
          <p className="mt-1 text-sm text-[var(--midnight)]/60">
            A scrapbook of little moments — tap Edit on any entry to fix dates or details.
          </p>
        </div>
        <Link href={`/spoods/${spider.id}`} className={buttonVariants({ variant: "soft", size: "sm" })}>Profile</Link>
      </div>

      <nav aria-label="Story pages" className="flex gap-4">
        {before ? <Link href={`/spoods/${spider.id}/story`} className="underline">Newest entries</Link> : null}
        {view.nextCursor ? <Link href={`/spoods/${spider.id}/story?before=${encodeURIComponent(view.nextCursor)}`} className="underline">Older entries</Link> : null}
      </nav>
      <div className="relative space-y-0 pl-2">
        <div className="absolute bottom-4 left-[1.65rem] top-4 w-px bg-gradient-to-b from-[var(--gold)] via-[var(--lavender-deep)] to-[var(--plum)]/40" />

        {events.map((event) => {
          const showMoltGap =
            event.kind === "molt" && event.moltGap != null && event.moltGap > 0;
          return (
            <div key={`${event.kind}-${event.id}`} className="relative pb-8">
              {showMoltGap ? (
                <div className="mb-4 ml-12 inline-flex items-center gap-2 rounded-full bg-[var(--lavender)]/60 px-3 py-1 text-xs font-semibold text-[var(--plum-deep)]">
                  <span aria-hidden>↓</span> {event.moltGap} days
                </div>
              ) : null}
              <div className="flex gap-4">
                <div className="relative z-10 mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--gold)]/60 bg-[var(--cream)] text-sm shadow-sm">
                  {event.kind === "molt"
                    ? "◐"
                    : event.kind === "acquired"
                      ? "✧"
                      : event.kind === "photo"
                        ? "◎"
                        : "✦"}
                </div>
                <Card className="flex-1 !p-3">
                  <div className="flex gap-3">
                    {event.photo ? (
                      <PhotoOpenButton
                        photos={galleryPhotos}
                        index={Math.max(
                          0,
                          galleryPhotos.findIndex(
                            (photo) => photo.id === `${event.kind}-${event.id}`,
                          ),
                        )}
                        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[var(--lavender)]"
                      >
                        <SpoodImage
                          src={event.photo}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </PhotoOpenButton>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {event.instarLabel ? (
                        <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--plum)]">
                          {event.instarLabel}
                        </p>
                      ) : null}
                      {event.editable && event.fields ? (
                        <ActivityEditorRow
                          compact
                          readOnly={!writable}
                          item={{
                            id: event.id,
                            type: event.kind as
                              | "feeding"
                              | "misting"
                              | "molt"
                              | "observation"
                              | "body"
                              | "maintenance"
                              | "photo",
                            spiderId: spider.id,
                            spiderName: spider.name,
                            title: event.title,
                            detail: event.detail,
                            dateLabel: `${formatDateTimeInZone(event.date, zone)}${
                              event.kind === "molt" &&
                              spider.molts.find((m) => m.id === event.id)?.approximate
                                ? " · approx."
                                : ""
                            }`,
                            fields: event.fields,
                          }}
                        />
                      ) : (
                        <>
                          <p className="font-semibold text-[var(--midnight)]">
                            {event.title}
                          </p>
                          {event.detail ? (
                            <p className="mt-0.5 text-sm text-[var(--midnight)]/60">
                              {event.detail}
                            </p>
                          ) : null}
                          <time className="mt-2 block text-xs text-[var(--midnight)]/45">
                            {event.kind === "acquired" ? formatShortDate(event.date) : formatDateTimeInZone(event.date, zone)}
                          </time>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
