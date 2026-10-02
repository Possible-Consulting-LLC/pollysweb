"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { GuideCategory } from "@/lib/content/guide-categories";
import { GuideChips } from "@/components/marketing/guide-chips";

type GuideCard = { slug: string; title: string; category: GuideCategory; excerpt: string };

const CARD_ART: Record<GuideCategory, { gradient: string; emoji: string }> = {
  feeding: { gradient: "from-orange-100/90 to-amber-50", emoji: "🕷️" },
  water: { gradient: "from-sky-100/90 to-cyan-50", emoji: "💧" },
  molting: { gradient: "from-[var(--lavender)]/70 to-purple-50", emoji: "🌙" },
  handling: { gradient: "from-pink-100/90 to-rose-50", emoji: "🤍" },
  cleaning: { gradient: "from-emerald-100/90 to-teal-50", emoji: "✨" },
  "life-stages": { gradient: "from-lime-100/90 to-green-50", emoji: "🌱" },
  health: { gradient: "from-red-100/90 to-orange-50", emoji: "➕" },
  "species-profiles": { gradient: "from-[var(--lavender)]/60 to-sky-50", emoji: "📚" },
};

export function GuideCardGrid({ guides }: { guides: GuideCard[] }) {
  const [active, setActive] = useState<GuideCategory | null>(null);
  const visible = active ? guides.filter((guide) => guide.category === active) : guides;

  return (
    <div className="space-y-8">
      <GuideChips active={active} onSelect={setActive} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((guide) => {
          const art = CARD_ART[guide.category];
          return (
            <Link
              key={guide.slug}
              href={`/care-guides/${guide.slug}`}
              className="group flex flex-col overflow-hidden rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] shadow-[0_8px_30px_var(--shadow)] transition hover:border-[var(--plum)]/25"
            >
              <span
                aria-hidden
                className={`flex h-24 items-center justify-center bg-gradient-to-br text-3xl ${art.gradient}`}
              >
                {art.emoji}
              </span>
              <span className="flex flex-1 flex-col p-5">
                <span className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">
                  {guide.title}
                </span>
                <span className="mt-2 flex-1 text-sm leading-6 text-[var(--midnight)]/65">{guide.excerpt}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--plum)] transition group-hover:gap-2">
                  Read Guide <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}