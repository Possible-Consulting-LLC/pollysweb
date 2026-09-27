'use client';
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
};

/** Shared, fully controlled selectable list for every admin surface. The parent
 * owns selection state (a Set/array of ids) — this component stores nothing, so
 * paging and searching can never lose a selection and saves always submit the
 * complete set, not just the visible page. All controls are themed via
 * ui/button; no bespoke button styling. */
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
}: SelectionListProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const toggleAllIds = rows.filter((row) => !row.disabled).map((row) => row.id);
  const sections: Array<{ header: string | null; rows: SelectionRow[] }> = groups
    ? [
        ...groups.map((group) => ({ header: group, rows: rows.filter((row) => row.group === group) })),
        { header: null, rows: rows.filter((row) => !row.group || !groups.includes(row.group)) },
      ].filter((section) => section.rows.length > 0)
    : rows.length > 0
      ? [{ header: null, rows }]
      : [];
  const renderRow = (row: SelectionRow) => (
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid max-w-sm gap-1">
          Search
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="rounded-xl border border-[var(--plum)]/15 p-2"
          />
        </label>
        <p className="rounded-full bg-[var(--lavender)] px-3 py-1 text-sm font-semibold text-[var(--midnight)]" data-testid="selected-count">
          {selectedCount} selected
        </p>
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
        {onToggleAll ? (
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
      </div>
    </section>
  );
}
