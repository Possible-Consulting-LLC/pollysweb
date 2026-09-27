'use client';
import type { ReactNode } from 'react';
import { cardClassName } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type SelectionTrayItem = { id: string; title: string; subtitle?: string };

/** Presentational "selected items" tray shared by every selection surface
 * (plans list today, SelectionList and the features catalog next). State-free:
 * the parent owns the selection and the collapsed flag, this component only
 * renders chips and hosts the parent's bulk actions as children. Hidden
 * entirely while the selection is empty. */
export function SelectionTray({ items, onDeselect, collapsed = false, onCollapsedToggle,
  children, label = 'Selected' }: {
  items: SelectionTrayItem[];
  onDeselect(id: string): void;
  collapsed?: boolean;
  onCollapsedToggle?(): void;
  children?: ReactNode;
  label?: string;
}) {
  if (items.length === 0) return null;
  return <section aria-label={`${label} items`} className={cn(cardClassName, 'p-4')}>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onCollapsedToggle} aria-expanded={!collapsed}
        className="text-sm font-semibold text-[var(--plum)]">
        {`${collapsed ? '▸' : '▾'} ${label} (${items.length})`}
      </button>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
    {!collapsed ? <div className="mt-3 flex flex-wrap gap-2">
      {items.map(item => <span key={item.id}
        className="flex items-center gap-2 rounded-full bg-[var(--lavender)] px-3 py-1 text-xs font-semibold text-[var(--plum-deep)]">
        <span>
          {item.title}{item.subtitle ? <span className="opacity-60"> — {item.subtitle}</span> : null}
        </span>
        <button type="button" aria-label={`Deselect ${item.title}`} data-id={item.id}
          onClick={() => onDeselect(item.id)}
          className="rounded-full px-1 text-sm leading-none text-[var(--plum-deep)] hover:text-[var(--plum)]">×</button>
      </span>)}
    </div> : null}
  </section>;
}
