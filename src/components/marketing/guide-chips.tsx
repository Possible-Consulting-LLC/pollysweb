"use client";

import { GUIDE_CATEGORIES, type GuideCategory } from "@/lib/content/guide-categories";
import { cn } from "@/lib/utils";

const CHIP_ICONS: Record<GuideCategory, string> = {
  feeding: "🍴",
  water: "💧",
  molting: "🌙",
  handling: "🤍",
  cleaning: "✨",
  "life-stages": "🌱",
  health: "➕",
  "species-profiles": "📖",
};

export function GuideChips({ active, onSelect }: { active: GuideCategory | null; onSelect: (category: GuideCategory | null) => void }) {
  return (
    <div role="group" aria-label="Filter guides by topic" className="flex flex-wrap justify-center gap-2">
      {GUIDE_CATEGORIES.map((category) => {
        const isActive = active === category.key;
        return (
          <button
            key={category.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(isActive ? null : category.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition",
              isActive
                ? "border-[var(--plum)] bg-[var(--plum)] text-[var(--on-accent)] shadow-sm"
                : "border-[var(--plum)]/15 bg-[var(--card-solid)] text-[var(--midnight)]/75 hover:border-[var(--plum)]/40 hover:text-[var(--plum)]",
            )}
          >
            <span aria-hidden>{CHIP_ICONS[category.key]}</span>
            {category.label}
          </button>
        );
      })}
    </div>
  );
}