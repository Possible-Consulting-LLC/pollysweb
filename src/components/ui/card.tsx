import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CareStatus } from "@/lib/constants";
import { careStatusTone } from "@/lib/care";

export function StatusPill({ status }: { status: CareStatus | string }) {
  const tone = careStatusTone(status as CareStatus);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "good" && "bg-emerald-200 text-emerald-950",
        tone === "attention" && "bg-amber-200 text-amber-950",
        tone === "calm" && "bg-[var(--lavender)] text-[var(--plum-deep)]",
      )}
    >
      {status}
    </span>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4 shadow-[0_8px_30px_var(--shadow)] backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--midnight)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-[var(--midnight)]/60">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--plum)]/25 bg-[var(--card)] px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--lavender)] text-lg">
        ✦
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-lg text-[var(--midnight)]">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--midnight)]/65">
        {body}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
