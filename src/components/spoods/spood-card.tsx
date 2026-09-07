import Link from "next/link";
import { Card, StatusPill } from "@/components/ui/card";
import { formatRelativeDays, parseHydrationMethods } from "@/lib/utils";
import { friendlyNeedCopy } from "@/lib/care";
import type { SpiderCareView } from "@/lib/spiders";
import { QuickLogButtons } from "@/components/spoods/quick-log";
import { SpoodImage } from "@/components/spoods/spood-image";

export function SpoodCareCard({
  view,
  showQuickActions = true,
}: {
  view: SpiderCareView;
  showQuickActions?: boolean;
}) {
  const { spider, careStatus } = view;
  const subtitle = [spider.sex, spider.commonName || spider.species, spider.instar]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="space-y-3">
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link
                href={`/spoods/${spider.id}`}
                className="font-[family-name:var(--font-display)] text-xl text-[var(--midnight)] hover:text-[var(--plum)]"
              >
                {spider.name}
              </Link>
              <p className="truncate text-sm text-[var(--midnight)]/60">{subtitle}</p>
            </div>
            <StatusPill status={careStatus} />
          </div>
          <p className="mt-1 text-sm text-[var(--midnight)]/70">
            {friendlyNeedCopy(spider.name, careStatus)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs text-[var(--midnight)]/70 sm:grid-cols-4">
        <div className="rounded-2xl bg-[var(--cream-deep)]/60 px-3 py-2">
          <dt>Last fed</dt>
          <dd className="font-semibold text-[var(--midnight)]">
            {formatRelativeDays(view.daysSinceFeed)}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--cream-deep)]/60 px-3 py-2">
          <dt>Last hydrated</dt>
          <dd className="font-semibold text-[var(--midnight)]">
            {formatRelativeDays(view.daysSinceMist)}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--cream-deep)]/60 px-3 py-2">
          <dt>Last molt</dt>
          <dd className="font-semibold text-[var(--midnight)]">
            {formatRelativeDays(view.daysSinceMolt)}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--cream-deep)]/60 px-3 py-2">
          <dt>Status</dt>
          <dd className="font-semibold text-[var(--midnight)]">{careStatus}</dd>
        </div>
      </dl>

      {showQuickActions ? (
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
      ) : null}
    </Card>
  );
}
