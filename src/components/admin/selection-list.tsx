'use client';
import { SelectionTray } from '@/components/admin/selection-tray';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SelectionRow = {
  id: string;
  title: string;
  subtitle?: string;
  group?: string;
  selected?: boolean;
  disabled?: boolean;
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
};

/** Shared, fully controlled selectable list for every admin surface. The parent
 * owns all selection and fold state (a Set/array of ids, the tray collapse,
 * the selected-only filter) — this component stores nothing, so paging and
 * searching can never lose a selection and saves always submit the complete
 * set, not just the visible page. All controls are themed via ui/button; no
 * bespoke button styling. */
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
}: SelectionListProps) {
  const single = selectionMode === 'single';
  const selectedRow = rows.find((row) => row.selected) ?? selectedRows?.find((row) => row.selected);
  // Single-mode focused view: when a row is selected the rest folds out of
  // sight; a change affordance lets the parent unfold the list again.
  if (single && selectedRow) {
    return (
      <section className="space-y-2 rounded-3xl border border-[var(--plum)]/15 bg-[var(--panel)] p-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--midnight)]/70">Selected</p>
        <p className="font-medium">
          {selectedRow.title}
          {selectedRow.subtitle ? <span className="block text-sm text-[var(--midnight)]/70">{selectedRow.subtitle}</span> : null}
        </p>
        <Button variant="soft" size="sm" onClick={() => onChange?.()}>Change</Button>
      </section>
    );
  }
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const toggleAllIds = rows.filter((row) => !row.disabled).map((row) => row.id);
  const trayItems = single || !selectedRows?.length
    ? []
    : selectedRows.map(({ id, title, subtitle }) => ({ id, title, subtitle }));
  const visibleRows = !single && selectedOnly && trayItems.length > 0 ? selectedRows ?? [] : rows;
  const sections: Array<{ header: string | null; rows: SelectionRow[] }> = groups
    ? [
        ...groups.map((group) => ({ header: group, rows: visibleRows.filter((row) => row.group === group) })),
        { header: null, rows: visibleRows.filter((row) => !row.group || !groups.includes(row.group)) },
      ].filter((section) => section.rows.length > 0)
    : visibleRows.length > 0
      ? [{ header: null, rows: visibleRows }]
      : [];
  const renderRow = (row: SelectionRow) => single ? (
    <li key={row.id}>
      <Button
        variant={row.selected ? 'gold' : 'soft'}
        size="md"
        className="w-full justify-between"
        aria-pressed={Boolean(row.selected)}
        aria-label={`Select ${row.title}`}
        disabled={row.disabled}
        onClick={() => onRowSelect?.(row.id)}
      >
        <span className="min-w-0 text-left">
          <span className={cn('block truncate font-medium', row.disabled && 'opacity-60')}>{row.title}</span>
          {row.subtitle ? <span className="block truncate text-sm text-[var(--midnight)]/70">{row.subtitle}</span> : null}
        </span>
      </Button>
    </li>
  ) : (
    <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--plum)]/15 bg-[var(--card)] px-3 py-2">
      <span className="min-w-0">
        <span className={cn('block truncate font-medium', row.disabled && 'opacity-60')}>{row.title}</span>
        {row.subtitle ? <span className="block truncate text-sm text-[var(--midnight)]/70">{row.subtitle}</span> : null}
      </span>
      <Button
        variant={row.selected ? 'gold' : 'soft'}
        size="sm"
        role="checkbox"
        aria-checked={Boolean(row.selected)}
        aria-label={`Toggle ${row.title}`}
        disabled={row.disabled}
        onClick={() => onToggle(row.id)}
      >
        {row.selected ? 'Selected' : 'Select'}
      </Button>
    </li>
  );
  return (
    <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--panel)] p-4">
      {trayItems.length > 0 ? (
        <SelectionTray
          items={trayItems}
          onDeselect={onToggle}
          collapsed={trayCollapsed}
          onCollapsedToggle={onTrayCollapsedToggle}
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {!selectedOnly ? (
          <label className="grid max-w-sm gap-1">
            Search
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="rounded-xl border border-[var(--plum)]/15 p-2"
            />
          </label>
        ) : null}
        {!single ? (
          <div className="flex items-center gap-2">
            {trayItems.length > 0 ? (
              <Button
                variant="soft"
                size="sm"
                onClick={() => onSelectedOnlyChange?.(!selectedOnly)}
              >
                {selectedOnly ? 'Show all' : 'Selected only'}
              </Button>
            ) : null}
            <p className="rounded-full bg-[var(--lavender)] px-3 py-1 text-sm font-semibold text-[var(--midnight)]" data-testid="selected-count">
              {selectedCount} selected
            </p>
          </div>
        ) : null}
      </div>
      {sections.length === 0 ? <p className="text-sm text-[var(--midnight)]/70">{emptyLabel}</p> : null}
      {sections.map((section, index) => (
        <div key={section.header ?? `ungrouped-${index}`} className="space-y-2">
          {section.header ? (
            <h4
              className="text-xs font-semibold uppercase tracking-wide text-[var(--midnight)]/70"
              data-group-header={section.header}
            >
              {section.header}
            </h4>
          ) : null}
          <ul className="space-y-2">{section.rows.map(renderRow)}</ul>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
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
            <span className="text-sm text-[var(--midnight)]/70" data-page-label>
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
