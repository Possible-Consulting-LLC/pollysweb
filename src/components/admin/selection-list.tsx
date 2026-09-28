'use client';
import type { ReactNode } from 'react';
import { SelectionTray } from '@/components/admin/selection-tray';
import { counterChipClass, searchHiddenFor } from '@/components/admin/list-shared';
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
  /** Optional trailing meta badge (mockup row anatomy: "Valid", "deleting",
   * "Selected"). */
  badge?: { label: string; tone?: 'ok' | 'muted' | 'selected' };
};

export type SelectionMode = 'multi' | 'single';

/** Mockup meta badge (user-picker row anatomy ~49-52): "Valid" is the plum
 * outline chip, "deleting" the dashed muted chip, "Selected" the gold chip. */
const badgeToneClass: Record<'ok' | 'muted' | 'selected', string> = {
  ok: 'border border-[var(--plum)]/30 bg-[var(--hover)] text-[var(--plum)]',
  muted: 'border border-dashed border-[var(--lavender-deep)] bg-transparent text-[var(--foreground)] opacity-50',
  selected: 'bg-[var(--gold)] text-[var(--panel)]',
};

function RowBadge({ badge, className }: { badge: NonNullable<SelectionRow['badge']>;
  className?: string }) {
  return (
    <span data-row-badge={badge.label}
      className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold',
        className, badgeToneClass[badge.tone ?? 'ok'])}>
      {badge.label}
    </span>
  );
}

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
   * shared SelectionTray renders it and a "Selected only" paginated filter
   * over the SAME list becomes available (the host pages over the selected
   * rows; toolbar, pager, and counter stay live). Absent/empty → no tray,
   * no toggle. */
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
  /** Parent-owned state for the "Selected only" paginated filter (multi mode). */
  selectedOnly?: boolean;
  onSelectedOnlyChange?(selectedOnly: boolean): void;
  /** Parent-owned collapsed flag for the shared tray (multi mode). */
  trayCollapsed?: boolean;
  onTrayCollapsedToggle?(): void;
  /** Replaces the plain search input inside the toolbar — the host renders
   * the headless narrowing input there (LiveSearchInput). Absent → the plain
   * (mockup-styled) input. A search slot must narrow the RENDERED LIST
   * headlessly (ruling 1): no dropdown by construction. */
  searchSlot?: ReactNode;
  /** S13a — what a whole-row click means in multi mode. 'select' (default):
   * the S8 click-to-toggle (every current consumer). 'expand': the row click
   * expands/collapses the row's detail (parent-owned via `expandedId` +
   * `detailFor`, fired through `onExpandToggle`); the checkbox stays the
   * select affordance and keeps firing `onToggle`. Single mode is untouched —
   * its rows are pick buttons. */
  rowClick?: 'select' | 'expand';
  /** Task 10: an ALWAYS-VISIBLE per-row detail line rendered beneath the row's
   * subtitle in both modes (unlike S13a's expand-only `detailFor`) — the plan
   * picker's read-only "Included features" line. Receives the row; extra
   * host fields (e.g. features) survive on it. Absent → nothing renders. */
  rowDetail?: (row: SelectionRow) => ReactNode;
  /** S13a expand mode: which row's detail is open (parent-owned, one at a
   * time if the host so chooses). */
  expandedId?: string;
  /** S13a expand mode: renders the expanded row's detail beneath the row. */
  detailFor?(row: SelectionRow): ReactNode;
  /** S13a expand mode: fired by a row click (and never by the checkbox). */
  onExpandToggle?(id: string): void;
  /** S13c — the mockup #7 select pair, rendered between the search input and
   * the gold counter when the host passes the handlers (absent → they don't
   * render; single mode never renders them). Select-all semantics span ALL
   * pages of the current view, so the HOST closes over its full set — this
   * component stays a passive renderer of the affordance. */
  onSelectAll?(): void;
  onSelectNone?(): void;
  /** Primary footer action rendered at the footer's right (mockup's "Save
   * matrix", INT:89-96) — the host passes its own form/button. */
  footerAction?: ReactNode;
  /** S13d: the COMMITTED list size the search-visibility rule keys on — for
   * hosts whose `total` narrows with the live query (the feature matrix's
   * client-side filter) so a live query can never hide its own input.
   * Absent → `total` rules (the URL-owned surfaces' committed count). */
  listSize?: number;
  /** When false the host renders the toolbar itself (picker surfaces whose
   * live search owns the toolbar row). Rows, tray, and pager still render. */
  toolbar?: boolean;
  /** FINALE F3: a host-provided Clear affordance for a COMMITTED URL-owned
   * search, rendered at the toolbar's end (subscriptions-list placement). It
   * is NOT gated by the S13d search-hidden rule — a committed below-page
   * search hides the input but must keep its in-place recovery. Absent →
   * nothing renders. */
  clearSlot?: ReactNode;
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
  footerAction,
  toolbar = true,
  rowClick = 'select',
  rowDetail,
  expandedId,
  detailFor,
  onExpandToggle,
  onSelectAll,
  onSelectNone,
  listSize,
  clearSlot,
}: SelectionListProps) {
  const single = selectionMode === 'single';
  // S13d: less than one page of rows → no search input (default input and a
  // host-provided searchSlot alike — the rule is the toolbar's, not the
  // input's). The count is the COMMITTED size, never the narrowed total.
  const searchHidden = searchHiddenFor(listSize ?? total, pageSize);
  const selectedRow = rows.find((row) => row.selected) ?? selectedRows?.find((row) => row.selected);
  // Single-mode focused view: when a row is selected the rest folds out of
  // sight; a change affordance lets the parent unfold the list again.
  if (single && selectedRow) {
    return (
      <section data-testid="focused-selection"
        className="space-y-2 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] px-3 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--plum)]">Selected</p>
        <div className="flex items-center gap-2.5">
          {/* U1: the focused view keeps the full row anatomy — the leading
           * avatar glyph comes with the selection instead of being dropped. */}
          {selectedRow.leading
            ? <span aria-hidden="true" data-row-avatar={selectedRow.leading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-[13px] font-bold text-[var(--midnight)]">
                {selectedRow.leading}
              </span>
            : null}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[var(--plum)]">{selectedRow.title}</span>
            {selectedRow.subtitle
              ? <span className="block truncate text-[11.5px] opacity-55">{selectedRow.subtitle}</span>
              : null}
          </span>
          {selectedRow.badge ? <RowBadge badge={selectedRow.badge} /> : null}
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
  // "Selected only" is a paginated filter over the SAME list: the host pages
  // over the selected rows, so this component just renders what it is given —
  // toolbar, pager, and counter stay live either way.
  const visibleRows = rows;
  const onlyToggle = !single && trayItems.length > 0 && onSelectedOnlyChange
    ? (
      // Mockup affordance (INT:82): a checkbox label in the tray head, not a button.
      <label data-testid="selected-only-toggle"
        className="flex cursor-pointer items-center gap-1.5 text-[13px] font-bold text-[var(--plum)]">
        <input type="checkbox" checked={selectedOnly}
          onChange={() => onSelectedOnlyChange(!selectedOnly)}
          className="h-4 w-4 shrink-0 accent-[var(--plum)]" />
        Selected only
      </label>
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
        onClick={() => { if (!row.disabled) onRowSelect?.(row.id); }}
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
          {rowDetail
            ? <span data-row-detail-line className="mt-1.5 block">{rowDetail(row)}</span>
            : null}
        </span>
        {row.badge ? <RowBadge badge={row.badge} className="ml-auto" /> : null}
      </button>
    </li>
  ) : (
    // Multi-mode rows: the click's meaning is the surface's rowClick flag
    // (S13a). 'select' (default) is the S8 click-to-toggle (mockup's delegated
    // rows, INT:222-227) — the whole row toggles and a checkbox-originated
    // click is ignored to guard against a double fire. 'expand' makes the row
    // click expand/collapse the row's detail instead; the checkbox stays the
    // select affordance, so both mockup languages share one component.
    <li key={row.id} data-row-id={row.id}
      onClick={single ? undefined : (event) => {
        const target = event.target as HTMLElement;
        if (row.disabled || target.tagName === 'INPUT' ||
          target.closest?.('[data-row-detail]')) return;
        if (rowClick === 'expand') onExpandToggle?.(row.id);
        else onToggle(row.id);
      }}
      className={cn('flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:bg-[var(--hover)]',
        rowClick === 'expand' && 'flex-wrap',
        !single && !row.disabled && 'cursor-pointer',
        row.disabled && 'cursor-not-allowed opacity-45')}>
      <input
        type="checkbox"
        checked={Boolean(row.selected)}
        disabled={row.disabled}
        onChange={() => onToggle(row.id)}
        aria-label={`Toggle ${row.title}`}
        className="h-4 w-4 shrink-0 accent-[var(--plum)]"
      />
      {row.leading
        ? <span aria-hidden="true" data-row-avatar={row.leading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-[13px] font-bold text-[var(--midnight)]">
            {row.leading}
          </span>
        : null}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-semibold',
          row.selected && 'text-[var(--plum)]', row.disabled && 'opacity-60')}>{row.title}</span>
        {row.subtitle
          ? <span className="block truncate font-mono text-[11px] opacity-55">{row.subtitle}</span>
          : null}
        {rowDetail
          ? <span data-row-detail-line className="mt-1.5 block">{rowDetail(row)}</span>
          : null}
      </span>
      {row.badge ? <RowBadge badge={row.badge} /> : null}
      {rowClick === 'expand' && expandedId === row.id && detailFor ? (
        <div data-row-detail className="w-full pt-1">{detailFor(row)}</div>
      ) : null}
    </li>
  );
  return (
    <section className="space-y-3">
      {/* S13d: in single mode the search IS the toolbar — with the input
          hidden the whole row folds away. Multi mode keeps the row for the
          S13c pair and the counter. */}
      {toolbar && !(single && searchHidden) ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="list-toolbar">
          {!searchHidden ? (searchSlot ?? (
            <input
              value={search}
              placeholder="Search features…"
              aria-label="Search rows"
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-[var(--lavender-deep)] bg-[var(--input)] px-3.5 text-sm"
            />
          )) : null}
          {/* S13c: the mockup #7 pair between search and counter — the compact
              .btn-soft mini equivalent. Handlers optional; absent → no render. */}
          {!single && onSelectAll
            ? <Button type="button" variant="soft" size="sm" data-testid="select-all"
                onClick={onSelectAll}>Select all</Button>
            : null}
          {!single && onSelectNone
            ? <Button type="button" variant="soft" size="sm" data-testid="select-none"
                onClick={onSelectNone}>Select none</Button>
            : null}
          {!single
            ? <span className={counterChipClass} data-testid="selected-count">
                {`${selectedCount} of ${total} selected`}
              </span>
            : null}
          {clearSlot}
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
      {sections.length === 0 ? (
        <p className="text-sm text-[var(--midnight)]/70">
          {search.trim() ? <>Nothing matches “{search.trim()}”.</> : emptyLabel}
        </p>
      ) : null}
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
      {totalPages > 1 || footerAction || (onToggleAll && !single) ? (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--hover)] pt-3.5">
          {/* S12: the pager is hidden on single-page lists (mockup parity). */}
          {totalPages > 1 ? (
            <div className="flex items-center gap-2" data-testid="list-pager">
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
          ) : <span />}
          <div className="flex items-center gap-2">
            {onToggleAll && !single ? (
              <Button
                variant="secondary"
                size="sm"
                aria-label="Toggle all on page"
                disabled={toggleAllIds.length === 0}
                onClick={() => onToggleAll(toggleAllIds)}
              >
                Toggle all on page
              </Button>
            ) : null}
            {footerAction}
          </div>
        </div>
      ) : null}
    </section>
  );
}
