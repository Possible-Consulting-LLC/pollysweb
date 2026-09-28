'use client';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SelectionTrayItem = { id: string; title: string; subtitle?: string };

/** Presentational "selected items" tray shared by every selection surface
 * (plans list today, SelectionList and the features catalog next). State-free:
 * the parent owns the selection and the collapsed flag, this component only
 * renders chips and hosts the parent's bulk actions as children (plus an
 * optional trailing control, e.g. the "Selected only" toggle). Mockup parity:
 * a soft bordered panel with gold-highlighted chips (plan line 199: plum
 * toggle, gold-highlighted chips) — gold border and gold removal accent on the
 * hover ground, token-driven for both themes. Hidden
 * entirely while the selection is empty. */
export function SelectionTray({ items, onDeselect, collapsed = false, onCollapsedToggle,
  children, trailing, label = 'Selected' }: {
  items: SelectionTrayItem[];
  onDeselect(id: string): void;
  collapsed?: boolean;
  onCollapsedToggle?(): void;
  children?: ReactNode;
  trailing?: ReactNode;
  label?: string;
}) {
  if (items.length === 0) return null;
  return <section aria-label={`${label} items`} data-testid="selection-tray"
    className="rounded-2xl border border-[var(--hover)] bg-[var(--card)] px-3 py-2.5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onCollapsedToggle} aria-expanded={!collapsed}
        className="text-[13px] font-bold text-[var(--plum)]">
        {`${collapsed ? '▸' : '▾'} ${label} (${items.length})`}
      </button>
      {children || trailing
        ? <div className="flex flex-wrap items-center gap-2">
            {children}
            {trailing}
          </div>
        : null}
    </div>
    {!collapsed ? <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map(item => <span key={item.id} data-tray-chip={item.id}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gold)] bg-[var(--hover)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)]">
        <span>
          {item.title}{item.subtitle ? <span className="opacity-60"> — {item.subtitle}</span> : null}
        </span>
        <button type="button" aria-label={`Deselect ${item.title}`} data-id={item.id}
          onClick={() => onDeselect(item.id)}
          className="rounded-full px-1 text-sm leading-none font-extrabold text-[var(--gold)] hover:opacity-70">×</button>
      </span>)}
    </div> : null}
  </section>;
}
