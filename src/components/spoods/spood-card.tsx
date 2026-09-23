import type { ReactNode } from "react";
import Link from "next/link";
import { CareStatusGrid } from "@/components/spoods/care-status-grid";
import { QuickLogButtons } from "@/components/spoods/quick-log";
import { SpoodImage } from "@/components/spoods/spood-image";
import { buttonVariants } from "@/components/ui/button";
import { Card, StatusPill } from "@/components/ui/card";
import { friendlyNeedCopy } from "@/lib/care";
import type { SpiderCareView } from "@/lib/spiders";
import { parseHydrationMethods } from "@/lib/utils";

export function SpoodIdentity({
  view,
  linkName = true,
  readOnly = false,
}: {
  view: SpiderCareView;
  linkName?: boolean;
  readOnly?: boolean;
}): ReactNode {
  const { spider, careStatus } = view;
  const memorialized = Boolean(spider.memorializedAt);
  const subtitle = [spider.sex, spider.commonName || spider.species, spider.instar]
    .filter(Boolean)
    .join(" · ");
  const name = (
    <span className="font-[family-name:var(--font-display)] text-xl text-[var(--midnight)]">
      {spider.name}
    </span>
  );

  return (
    <div className="flex gap-3">
      <Link href={`/spoods/${spider.id}`} className="shrink-0">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-[var(--lavender)]">
          <SpoodImage
            src={spider.profilePhoto}
            alt={spider.name}
            className="h-full w-full"
          />
        </div>
      </Link>
      <div className="min-w-0 flex-1">
        {linkName ? (
          <Link
            href={`/spoods/${spider.id}`}
            className="hover:text-[var(--plum)]"
          >
            {name}
          </Link>
        ) : name}
        <p className="truncate text-sm text-[var(--midnight)]/60">{subtitle}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill status={memorialized ? "In memory" : careStatus} />
          {!memorialized && view.mistDue && careStatus !== "Mist today" ? (
            <StatusPill status="Mist today" />
          ) : null}
        </div>
        <p className="mt-2 text-sm text-[var(--midnight)]/70">
          {memorialized
            ? spider.memorialNote?.trim() ||
              `${spider.name}'s story lives on in your corner of the web.`
            : friendlyNeedCopy(spider.name, careStatus)}
        </p>
        {!memorialized && view.mistDue && careStatus !== "Mist today" ? (
          <p className="mt-1 text-sm font-semibold text-[var(--midnight)]">
            {friendlyNeedCopy(spider.name, "Mist today")}
          </p>
        ) : null}
        {readOnly ? (
          <p className="mt-2 text-sm font-semibold text-[var(--plum)]">
            Read-only while Pro is paused. Your spood and history stay here.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SpoodCareDetails({
  view,
  readOnly = false,
  showProfileLink = false,
  showQuickActions = true,
}: {
  view: SpiderCareView;
  readOnly?: boolean;
  showProfileLink?: boolean;
  showQuickActions?: boolean;
}): ReactNode {
  const { spider } = view;
  if (spider.memorializedAt) return null;

  return (
    <div className="space-y-4">
      <section className="space-y-2" aria-labelledby={`care-status-${spider.id}`}>
        <h3
          id={`care-status-${spider.id}`}
          className="text-sm font-semibold text-[var(--midnight)]"
        >
          Care status
        </h3>
        <CareStatusGrid
          daysSinceFeed={view.daysSinceFeed}
          daysSinceMist={view.daysSinceMist}
          latestBehavior={view.latestBehavior}
        />
      </section>

      {showQuickActions && !readOnly ? (
        <section className="space-y-2" aria-labelledby={`log-care-${spider.id}`}>
          <h3
            id={`log-care-${spider.id}`}
            className="text-sm font-semibold text-[var(--midnight)]"
          >
            Log care
          </h3>
          <QuickLogButtons
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
                ? { methods: parseHydrationMethods(spider.mistings[0]) }
                : null
            }
          />
        </section>
      ) : null}

      {showProfileLink ? (
        <Link
          href={`/spoods/${spider.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          View full profile
        </Link>
      ) : null}
    </div>
  );
}

export function SpoodCareCard({
  view,
  showQuickActions = true,
  readOnly = false,
}: {
  view: SpiderCareView;
  showQuickActions?: boolean;
  readOnly?: boolean;
}) {
  return (
    <Card className="space-y-4">
      <SpoodIdentity view={view} readOnly={readOnly} />
      <SpoodCareDetails
        view={view}
        readOnly={readOnly}
        showQuickActions={showQuickActions}
        showProfileLink
      />
    </Card>
  );
}
