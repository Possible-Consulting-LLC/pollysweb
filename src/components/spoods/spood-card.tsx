import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { FeatureGate } from "@/components/features/feature-gate";
import { CareStatusGrid } from "@/components/spoods/care-status-grid";
import { QuickLogButtons, type QuickLogAction } from "@/components/spoods/quick-log";
import { SpoodImage } from "@/components/spoods/spood-image";
import { buttonVariants } from "@/components/ui/button";
import { Card, StatusPill } from "@/components/ui/card";
import { friendlyNeedCopy } from "@/lib/care";
import type { FeatureGateState } from "@/lib/features/gate";
import type { SpiderCareView } from "@/lib/spiders";
import { parseHydrationMethods } from "@/lib/utils";

export const CARE_FEATURE_KEYS = [
  "care.feed.log",
  "care.hydrate.log",
  "care.molt.log",
  "care.observe.log",
  "care.play.log",
  "care.body_condition.log",
  "care.premolt.manage",
  "care.status.view",
] as const;

export type CareFeatureKey = (typeof CARE_FEATURE_KEYS)[number];
export type CareGates = Record<CareFeatureKey, FeatureGateState>;

const GATED_QUICK_ACTIONS: Partial<Record<QuickLogAction, { key: CareFeatureKey; name: string }>> = {
  feed: { key: "care.feed.log", name: "Logging feedings" },
  hydrate: { key: "care.hydrate.log", name: "Logging hydration" },
  molt: { key: "care.molt.log", name: "Logging molts" },
  note: { key: "care.observe.log", name: "Logging observations" },
  play: { key: "care.play.log", name: "Logging play" },
};

const ALL_QUICK_ACTIONS: readonly QuickLogAction[] = ["feed", "hydrate", "molt", "note", "play", "housekeeping"];

export function GatedQuickLogButtons({
  gates,
  actions = ALL_QUICK_ACTIONS,
  ...props
}: ComponentProps<typeof QuickLogButtons> & { gates: CareGates }): ReactNode {
  const open = actions.filter((action) => {
    const gated = GATED_QUICK_ACTIONS[action];
    return !gated || gates[gated.key] === "entitled";
  });
  const locked = actions.flatMap((action) => {
    const gated = GATED_QUICK_ACTIONS[action];
    return gated && gates[gated.key] !== "entitled" ? [gated] : [];
  });

  return (
    <>
      {open.length ? <QuickLogButtons {...props} actions={open} /> : null}
      {locked.map(({ key, name }) => (
        <FeatureGate key={key} state={gates[key]} featureKey={key} name={name}>
          {null}
        </FeatureGate>
      ))}
    </>
  );
}

export function SpoodIdentity({
  view,
  linkName = true,
  readOnly = false,
  showCareCopy = true,
}: {
  view: SpiderCareView;
  linkName?: boolean;
  readOnly?: boolean;
  showCareCopy?: boolean;
}): ReactNode {
  const { spider, careStatus } = view;
  const memorialized = Boolean(spider.memorializedAt);
  const subtitle = [spider.sex, spider.commonName || spider.species, spider.instar]
    .filter(Boolean)
    .join(" · ");
  const name = (
    <span className="[overflow-wrap:anywhere] font-[family-name:var(--font-display)] text-xl text-[var(--midnight)]">
      {spider.name}
    </span>
  );
  const portrait = (
    <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-[var(--lavender)]">
      <SpoodImage
        src={spider.profilePhoto}
        alt={spider.name}
        className="h-full w-full"
      />
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-3 min-[480px]:flex-row">
      {linkName ? (
        <Link href={`/spoods/${spider.id}`} className="shrink-0">
          {portrait}
        </Link>
      ) : (
        <div className="shrink-0">{portrait}</div>
      )}
      <div className="min-w-0 flex-1">
        {linkName ? (
          <Link
            href={`/spoods/${spider.id}`}
            className="hover:text-[var(--plum)]"
          >
            {name}
          </Link>
        ) : name}
        <p className="[overflow-wrap:anywhere] text-sm text-[var(--midnight)]/60">{subtitle}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusPill status={memorialized ? "In memory" : careStatus} />
          {!memorialized && view.mistDue && careStatus !== "Mist today" ? (
            <StatusPill status="Mist today" />
          ) : null}
        </div>
        {showCareCopy ? (
          <p className="mt-2 text-sm text-[var(--midnight)]/70">
            {memorialized
              ? spider.memorialNote?.trim() ||
                `${spider.name}'s story lives on in your corner of the web.`
              : friendlyNeedCopy(spider.name, careStatus)}
          </p>
        ) : null}
        {showCareCopy && !memorialized && view.mistDue && careStatus !== "Mist today" ? (
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
  gates,
  readOnly = false,
  showProfileLink = false,
  showQuickActions = true,
  showStatus = true,
  showActionHeading = true,
  actions,
}: {
  view: SpiderCareView;
  gates: CareGates;
  readOnly?: boolean;
  showProfileLink?: boolean;
  showQuickActions?: boolean;
  showStatus?: boolean;
  showActionHeading?: boolean;
  actions?: readonly QuickLogAction[];
}): ReactNode {
  const { spider } = view;
  if (spider.memorializedAt) return null;

  return (
    <div className="space-y-4">
      {showStatus ? <section className="space-y-2" aria-labelledby={`care-status-${spider.id}`}>
        <h3
          id={`care-status-${spider.id}`}
          className="text-sm font-semibold text-[var(--midnight)]"
        >
          Care status
        </h3>
        <FeatureGate state={gates["care.status.view"]} featureKey="care.status.view" name="Care status">
          <CareStatusGrid
            daysSinceFeed={view.daysSinceFeed}
            daysSinceMist={view.daysSinceMist}
            latestBehavior={view.latestBehavior}
          />
        </FeatureGate>
      </section> : null}

      {showQuickActions && !readOnly ? (
        <section
          className="space-y-2"
          aria-labelledby={showActionHeading ? `log-care-${spider.id}` : undefined}
          aria-label={showActionHeading ? undefined : "Care actions"}
        >
          {showActionHeading ? (
            <h3
              id={`log-care-${spider.id}`}
              className="text-sm font-semibold text-[var(--midnight)]"
            >
              Log care
            </h3>
          ) : null}
          <GatedQuickLogButtons
            gates={gates}
            spiderId={spider.id}
            spiderName={spider.name}
            currentLifeStage={spider.instar}
            hasEnclosure={Boolean(spider.enclosure)}
            actions={actions}
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
  gates,
  showQuickActions = true,
  readOnly = false,
}: {
  view: SpiderCareView;
  gates: CareGates;
  showQuickActions?: boolean;
  readOnly?: boolean;
}) {
  return (
    <Card className="relative space-y-4">
      <Link
        href={`/spoods/${view.spider.id}`}
        className={buttonVariants({ variant: "soft", size: "sm", className: "absolute right-4 top-4" })}
      >
        Profile
      </Link>
      <div className="min-[480px]:pr-20">
        <SpoodIdentity
          view={view}
          readOnly={readOnly}
          showCareCopy={false}
        />
      </div>
      <SpoodCareDetails
        view={view}
        gates={gates}
        readOnly={readOnly}
        showQuickActions={showQuickActions}
        showStatus={false}
        showActionHeading={false}
        actions={["feed", "hydrate"]}
      />
    </Card>
  );
}
