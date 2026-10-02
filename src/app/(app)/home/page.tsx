import { withCareProgress } from "@/lib/care-progress-data";
import { calendarDayKey } from "@/lib/constellation";
import Link from "next/link";
import { AppHeader } from "@/components/layout/nav";
import { CARE_FEATURE_KEYS, SpoodCareCard, type CareGates } from "@/components/spoods/spood-card";
import { FeatureGate } from "@/components/features/feature-gate";
import { SpoodImage } from "@/components/spoods/spood-image";
import { buttonVariants } from "@/components/ui/button";
import { Card, EmptyState, SectionHeader, StatusPill } from "@/components/ui/card";
import { getRecentActivity, getUserDefaults, listSpidersForUser } from "@/lib/spiders";
import { daysBetween, formatDateTimeInZone, resolveDisplayTimeZone } from "@/lib/utils";
import { resolveUserGates } from "@/lib/features/gate";
import { requireUser } from "@/lib/session";
import { getStreakPreview, reviewItemsFor } from "@/lib/constellation-data";
import { StreakCard } from "@/components/constellation/streak-card";
import { getSpiderWriteState } from "@/lib/spider-write-policy";
import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { legacyVerificationDeadline } from "@/lib/email-verification";
import { prisma } from "@/lib/db";

const JOURNEY_HOME_KEYS = ["journey.streaks.view"] as const;

function greeting(timeZone: string) {
  let hour = 12;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date());
    hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
  } catch {
    hour = new Date().getUTCHours();
  }
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const user = await requireUser();
  const gatesPromise = resolveUserGates(user.id, [...CARE_FEATURE_KEYS, ...JOURNEY_HOME_KEYS]);
  const defaultsPromise = getUserDefaults(user.id!);
  const zonePromise = defaultsPromise.then((defaults) => resolveDisplayTimeZone(defaults.timezone));
  const [defaults, views, activity, zone, constellation, writeState, verificationAccount, gates] = await Promise.all([
    defaultsPromise,
    listSpidersForUser(user.id!),
    getRecentActivity(user.id!),
    zonePromise,
    zonePromise.then((zone) => getStreakPreview(user.id!, zone)),
    getSpiderWriteState(user.id!),
    process.env.PASSWORD_EMAIL_VERIFICATION_GRACE_START
      ? prisma.user.findUnique({ where: { id: user.id! }, select: { passwordHash: true, emailVerified: true } })
      : Promise.resolve(null),
    gatesPromise,
  ]);
  const careGates: CareGates = gates;
  const reviewItems = await withCareProgress(user.id!, calendarDayKey(new Date(), zone), zone, reviewItemsFor(views, defaults.feedDefaultDays, writeState));
  const isReadOnly = (spiderId: string) => !writeState.proAccess && writeState.firstSpiderId !== spiderId;
  const verificationDeadline = verificationAccount
    ? legacyVerificationDeadline(verificationAccount, new Date(), process.env.PASSWORD_EMAIL_VERIFICATION_GRACE_START)
    : null;

  const active = views.filter((v) => !v.spider.memorializedAt);
  const memorial = views.filter((v) => v.spider.memorializedAt);
  const needing = active.filter((v) => v.careStatus !== "All good");
  const name = defaults.name || "keeper";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between [&>header]:mb-0">
        <AppHeader
          title={`${greeting(zone)}, ${name}.`}
          subtitle="Here’s what your little corner needs today."
        />
        <Link
          href="/spoods/new"
          className={buttonVariants({ variant: "gold", size: "sm", className: "shrink-0" })}
        >
          Add spood
        </Link>
      </div>

      {verificationDeadline ? <EmailVerificationNotice deadline={new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" }).format(verificationDeadline) + " UTC"} /> : null}

      <FeatureGate state={gates["journey.streaks.view"]} featureKey="journey.streaks.view" name="Care streaks">
        <StreakCard
          daysTogether={Math.max(0, daysBetween(defaults.createdAt, new Date(), zone))}
          completedToday={constellation.completedToday}
          activeCount={reviewItems.length}
          caredCount={reviewItems.filter(item => item.caredFor).length}
          compact
        />
      </FeatureGate>

      <section>
        <SectionHeader
          title="Needs attention"
          subtitle={
            careGates["care.status.view"] !== "entitled"
              ? undefined
              : needing.length
                ? `${needing.length} spood${needing.length === 1 ? "" : "s"} could use a moment`
                : "Everyone looks cozy"
          }
        />
        {active.length === 0 && memorial.length === 0 ? (
          <EmptyState
            title="No spoods yet"
            body="Your little corner of the web is looking pretty empty."
            action={
              <Link href="/spoods/new" className={buttonVariants()}>Add your first spood</Link>
            }
          />
        ) : (
          <FeatureGate state={careGates["care.status.view"]} featureKey="care.status.view" name="Care status">
            {needing.length === 0 ? (
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
                  <SpoodCareCard key={view.spider.id} view={view} gates={careGates} readOnly={isReadOnly(view.spider.id)} />
                ))}
              </div>
            )}
          </FeatureGate>
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
              className="inline-flex items-center gap-2 rounded-full border border-[var(--plum)]/15 bg-[var(--card)] py-1.5 pl-1.5 pr-3 text-sm transition hover:border-[var(--plum)]/30 hover:bg-[var(--hover-strong)]"
            >
              <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--lavender)] ring-1 ring-[var(--plum)]/10">
                <SpoodImage
                  src={v.spider.profilePhoto}
                  alt=""
                  className="h-full w-full"
                />
              </span>
              <span className="font-semibold text-[var(--midnight)]">{v.spider.name}</span>
              <StatusPill
                status={v.spider.memorializedAt ? "In memory" : v.careStatus}
              />
              {!v.spider.memorializedAt && v.mistDue && v.careStatus !== "Mist today" ? (
                <StatusPill status="Mist today" />
              ) : null}
              {isReadOnly(v.spider.id) ? <span className="text-xs text-[var(--midnight)]/60">Read-only</span> : null}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Recent activity"
          action={
            <Link href="/activity" className={buttonVariants({ variant: "ghost", size: "sm" })}>See all</Link>
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
                    {formatDateTimeInZone(item.date, zone, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
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
          <Link href="/spoods/new" className={buttonVariants({ variant: "secondary", className: "h-14 w-full" })}>Add a Spood</Link>
          <Link href="/activity" className={buttonVariants({ variant: "soft", className: "h-14 w-full" })}>Browse Activity</Link>
        </div>
      </section>
    </div>
  );
}
