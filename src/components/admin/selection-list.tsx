'use client';
import type { ReactNode } from 'react';
import { SelectionTray } from '@/components/admin/selection-tray';
import { counterChipClass } from '@/components/admin/list-shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SelectionRow = {
  id: string;
  title: string;
  subtitle?: string;
  group?: string;
  selected?: boolean;
  disabled?: boolean;
  /** Optional leading glyph (e.g. the keeper avatar's initials) — mockup row
   * anatomy for single-mode pickers. */
  leading?: string;
};

export type SelectionMode = 'multi' | 'single';

export type SelectionListProps = {
  rows: SelectionRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  selectedCount: number;
  onPageChange(page: number): void;
  onSearchChange(search: string): void;
  onToggle(id: string): void;
  onToggleAll?(ids: string[]): void;
  groups?: string[];
  emptyLabel?: string;
  /** Full selected set across all pages (multi mode). When non-empty the
   * shared SelectionTray renders it and a "Selected only" content filter
   * becomes available. Absent/empty → no tray, no toggle. */
  selectedRows?: SelectionRow[];
  /** 'multi' (default): checkboxes + counter + tray. 'single': click-to-select
   * rows via `onRowSelect`, no checkboxes/counter/tray, and a selected row
   * folds the list into a focused view with a `onChange` affordance. */
  selectionMode?: SelectionMode;
  /** Single mode only: fired when a row is clicked. (Multi mode keeps using
   * `onToggle` for its checkboxes.) */
  onRowSelect?(id: string): void;
  /** Single mode only: fired by the focused view's change affordance to
   * unfold the list again. */
  onChange?(): void;
  /** Parent-owned state for the "Selected only" content filter (multi mode). */
  selectedOnly?: boolean;
  onSelectedOnlyChange?(selectedOnly: boolean): void;
  /** Parent-owned collapsed flag for the shared tray (multi mode). */
  trayCollapsed?: boolean;
  onTrayCollapsedToggle?(): void;
  /** Replaces the plain search input inside the toolbar — the host renders a
   * live-search there. Absent → the plain (mockup-styled) input. */
  searchSlot?: ReactNode;
  /** When false the host renders the toolbar itself (picker surfaces whose
   * live search owns the toolbar row). Rows, tray, and pager still render. */
  toolbar?: boolean;
};

/** Shared, fully controlled selectable list for every admin surface. The parent
 * owns all selection and fold state (a Set/array of ids, the tray collapse,
 * the selected-only filter) — this component stores nothing, so paging and
 * searching can never lose a selection and saves always submit the complete
 * set, not just the visible page. Visual language is the user-approved mockup:
 * freestanding hover-tinted rows (no enclosing card grid), a toolbar pairing
 * the search input with the gold counter chip, and a soft bordered tray. */
export function SelectionList({
  rows,
  total,
  page,
  pageSize,
  search,
  selectedCount,
  onPageChange,
  onSearchChange,
  onToggle,
  onToggleAll,
  groups,
  emptyLabel = 'Nothing matches yet.',
  selectedRows,
  selectionMode = 'multi',
  onRowSelect,
  onChange,
  selectedOnly = false,
  onSelectedOnlyChange,
  trayCollapsed = false,
  onTrayCollapsedToggle,
  searchSlot,
  toolbar = true,
}: SelectionListProps) {
  const single = selectionMode === 'single';
  const selectedRow = rows.find((row) => row.selected) ?? selectedRows?.find((row) => row.selected);
  // Single-mode focused view: when a row is selected the rest folds out of
  // sight; a change affordance lets the parent unfold the list again.
  if (single && selectedRow) {
    return (
      <section data-testid="focused-selection"
        className="space-y-2 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] px-3 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--plum)]">Selected</p>
        <div className="flex items-center gap-2.5">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--plum)]">{selectedRow.title}</span>
            {selectedRow.subtitle
              ? <span className="block truncate text-[11.5px] opacity-55">{selectedRow.subtitle}</span>
              : null}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onChange?.()}>Change</Button>
        </div>
      </section>
    );
  }
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const toggleAllIds = rows.filter((row) => !row.disabled).map((row) => row.id);
  const trayItems = single || !selectedRows?.length
    ? []
    : selectedRows.map(({ id, title, subtitle }) => ({ id, title, subtitle }));
  const visibleRows = !single && selectedOnly && trayItems.length > 0 ? selectedRows ?? [] : rows;
  const onlyToggle = !single && trayItems.length > 0
    ? (
      <Button variant={selectedOnly ? 'gold' : 'ghost'} size="sm"
        onClick={() => onSelectedOnlyChange?.(!selectedOnly)}>
        {selectedOnly ? 'Show all' : 'Selected only'}
      </Button>
    )
    : undefined;
  const sections: Array<{ header: string | null; rows: SelectionRow[] }> = groups
    ? [
        ...groups.map((group) => ({ header: group, rows: visibleRows.filter((row) => row.group === group) })),
        { header: null, rows: visibleRows.filter((row) => !row.group || !groups.includes(row.group)) },
      ].filter((section) => section.rows.length > 0)
    : visibleRows.length > 0
      ? [{ header: null, rows: visibleRows }]
      : [];
  const renderRow = (row: SelectionRow) => single ? (
    <li key={row.id} data-row-id={row.id}>
      {/* Deliberate deviation from the "ui/button only" constraint (Task 8
       * parity ledger): picker rows render as raw row-styled buttons because
       * the approved mockup's picker rows are rows, not action buttons —
       * variant chrome (background pill, etc.) would break the mockup's row
       * anatomy (hover tint + plum selected border). Still a semantic button
       * with aria-pressed, so keyboard/screen-reader behavior is unchanged. */}
      <button
        type="button"
        aria-pressed={Boolean(row.selected)}
        aria-label={`Select ${row.title}`}
        disabled={row.disabled}
        onClick={() => onRowSelect?.(row.id)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
          'hover:bg-[var(--hover)]',
          row.selected ? 'border-[var(--plum)] bg-[var(--card)]' : 'border-transparent',
          row.disabled && 'cursor-not-allowed opacity-45')}
      >
        {row.leading
          ? <span aria-hidden="true" data-row-avatar={row.leading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-[13px] font-bold text-[var(--midnight)]">
              {row.leading}
            </span>
          : null}
        <span className="min-w-0">
          <span className={cn('block truncate text-sm font-semibold',
            row.selected && 'text-[var(--plum)]', row.disabled && 'opacity-60')}>{row.title}</span>
          {row.subtitle
            ? <span className="block truncate text-[11.5px] opacity-55">{row.subtitle}</span>
            : null}
        </span>
      </button>
    </li>
  ) : (
    <li key={row.id} data-row-id={row.id}
      className={cn('flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:bg-[var(--hover)]',
        row.disabled && 'cursor-not-allowed opacity-45')}>
      <input
        type="checkbox"
        checked={Boolean(row.selected)}
        disabled={row.disabled}
        onChange={() => onToggle(row.id)}
        aria-label={`Toggle ${row.title}`}
        className="h-4 w-4 shrink-0 accent-[var(--plum)]"
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-semibold',
          row.selected && 'text-[var(--plum)]', row.disabled && 'opacity-60')}>{row.title}</span>
        {row.subtitle
          ? <span className="block truncate font-mono text-[11px] opacity-55">{row.subtitle}</span>
          : null}
      </span>
    </li>
  );
  return (
    <section className="space-y-3">
      {toolbar && !selectedOnly ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="list-toolbar">
          {searchSlot ?? (
            <input
              value={search}
              aria-label="Search rows"
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-[var(--lavender-deep)] bg-[var(--input)] px-3.5 text-sm"
            />
          )}
          {!single
            ? <span className={counterChipClass} data-testid="selected-count">
                {`${selectedCount} of ${total} selected`}
              </span>
            : null}
        </div>
      ) : null}
      {trayItems.length > 0 ? (
        <SelectionTray
          items={trayItems}
          onDeselect={onToggle}
          collapsed={trayCollapsed}
          onCollapsedToggle={onTrayCollapsedToggle}
          trailing={onlyToggle}
        />
      ) : null}
      {sections.length === 0 ? <p className="text-sm text-[var(--midnight)]/70">{emptyLabel}</p> : null}
      {sections.map((section, index) => (
        <div key={section.header ?? `ungrouped-${index}`} className="space-y-0">
          {section.header ? (
            <h4
              className="mb-1 mt-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--plum)]"
              data-group-header={section.header}
            >
              {section.header}
            </h4>
          ) : null}
          <ul>{section.rows.map(renderRow)}</ul>
        </div>
      ))}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--hover)] pt-3.5">
        {onToggleAll && !single && !selectedOnly ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label="Toggle all on page"
            disabled={toggleAllIds.length === 0}
            onClick={() => onToggleAll(toggleAllIds)}
          >
            Toggle all on page
          </Button>
        ) : <span />}
        {!selectedOnly ? (
          <div className="flex items-center gap-2">
            <Button
              variant="soft"
              size="sm"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Prev
            </Button>
            <span className="text-[12.5px] opacity-70" data-page-label>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="soft"
              size="sm"
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}