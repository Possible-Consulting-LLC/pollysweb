"use client";

import { useState, type ReactNode } from "react";

export type SpoodAccordionItem = {
  id: string;
  identity: ReactNode;
  content: ReactNode;
  profileAction?: ReactNode;
};

export function SpoodAccordion({ items }: { items: SpoodAccordionItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const open = openId === item.id;
        const headerId = `spood-summary-${item.id}`;
        const panelId = `spood-panel-${item.id}`;
        return (
          <section
            key={item.id}
            className="rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] shadow-[0_8px_30px_var(--shadow)]"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-3">
              <button
                id={headerId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : item.id)}
                className="min-h-11 min-w-0 rounded-2xl p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plum)]"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">{item.identity}</div>
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-xl font-semibold leading-none text-[var(--plum-deep)]"
                  >
                    {open ? "−" : "+"}
                  </span>
                  <span className="sr-only">{open ? "Collapse" : "Expand"}</span>
                </div>
              </button>
              {item.profileAction}
            </div>
            <div
              id={panelId}
              aria-labelledby={headerId}
              hidden={!open}
              className="border-t border-[var(--plum)]/10 p-4"
            >
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
