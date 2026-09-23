import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cardClassName } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DisclosureCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={cn(cardClassName, "group p-0")} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl p-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-[family-name:var(--font-display)] text-xl text-[var(--midnight)]">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-0.5 block text-sm text-[var(--midnight)]/60">
              {subtitle}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-[var(--plum)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-[var(--plum)]/10 px-4 pb-4 pt-4">
        {children}
      </div>
    </details>
  );
}
