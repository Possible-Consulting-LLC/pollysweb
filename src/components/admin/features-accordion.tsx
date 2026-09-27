'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducer, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { listHref, categoryLabel, counterChipClass, badgeOnClass, badgeOffClass,
  badgeTintClass } from '@/components/admin/list-shared';
import { LiveSearchInput, NarrowPager, useNarrowing, narrowViaEndpoint,
  type Narrowing } from '@/components/admin/live-search';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { SelectionTray, type SelectionTrayItem } from '@/components/admin/selection-tray';
import { isRegisteredFeatureKey } from '@/lib/features/registry';
import { bulkSetFeatureReleaseAction, saveFeatureMetadataAction,
  setFeatureReleaseAction } from '@/app/admin/features/actions';

/** One catalog row with everything the detail cards need, resolved server-side
 * (assignments come from a single grouped query, never per-row). */
export type FeatureRowView = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
  /** True when the key is no longer in the code registry: the row greys out
   * and every control goes inert. */
  orphan: boolean;
  /** Names of plans with this feature enabled. */
  assignedPlans: string[];
  /** Total plan count for the "N of M plans" line. */
  totalPlans: number;
};

/** Row toggles preserve search/page; pager links drop `open` (paging folds the accordion). */
const listHrefFor = (search: string, page: number, open?: string) =>
  listHref('/admin/features', search, page, open);

export type FeaturesAccordionViewProps = {
  features: FeatureRowView[];
  /** Database feature count for the committed query; the idle counter denominator. */
  total: number;
  search: string;
  page: number;
  pageSize: number;
  /** URL-owned single-open state, keyed by feature key. */
  openKey: string;
  /** The FULL selection as key→title pairs — includes features on other pages
   * or hidden by the current search. Never derived from the rendered rows. */
  selectedItems: SelectionTrayItem[];
  /** Checkbox path: toggling a committed row resolves its title via lookup. */
  onToggleSelected(key: string): void;
  /** Narrowed pick path: the full suggestion {id, title, subtitle} is
   * forwarded so tray chips always carry display data (never a raw key). */
  onPick(item: { id: string; title: string; subtitle?: string }): void;
  trayCollapsed: boolean;
  onToggleTrayCollapsed(): void;
  /** The explicit full-page fallback: submits the URL-param search (resets
   * page and open feature). Plain typing in the live search NEVER navigates. */
  onSearchSubmit(search: string): void;
  /** Headless narrowing state (no dropdown anywhere): while matches for the
   * typed text are in, they REPLACE the committed page. */
  narrowing: Narrowing;
};

/** Mockup detail card: soft-bordered card with a labeled kv grid. */
function DetailCard({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return <div data-detail-card className="rounded-2xl border border-[var(--hover)] bg-[var(--background)] p-3.5">
    <h3 className="mb-2 text-[13px] font-semibold text-[var(--plum)]">Detail</h3>
    <dl data-kv-grid className="grid grid-cols-[minmax(110px,130px)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
      {rows.map(row => [<dt key={`${row.label}-dt`} className="font-semibold opacity-60">{row.label}</dt>,
        <dd key={`${row.label}-dd`} className="min-w-0">{row.value}</dd>])}
    </dl>
  </div>;
}

/** Mockup release-state wording for the kv grid: orphans lock the controls. */
const releaseStateText = (row: FeatureRowView) => row.orphan
  ? 'Orphaned — controls locked until the code/config mismatch is resolved'
  : row.active ? 'Released (available to plans)' : 'Coming soon (globally inactive)';

function FeatureDetail({ row }: { row: FeatureRowView }) {
  return <div className="space-y-2.5 px-3.5 pb-3.5 pt-1">
    <DetailCard rows={[
      { label: 'Key', value: <code className="text-xs">{row.key}</code> },
      { label: 'Description', value: row.description },
      { label: 'Category', value: categoryLabel(row.category) },
      { label: 'Release state', value: releaseStateText(row) },
      { label: 'Plan assignments', value: `${row.assignedPlans.length} of ${row.totalPlans} plans` },
      { label: 'Plans', value: row.assignedPlans.length
        ? row.assignedPlans.join(', ')
        : 'No plans use this feature yet.' },
    ]} />
    {/* A disabled fieldset makes every control inert for orphaned features. */}
    <fieldset disabled={row.orphan} className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <MutationForm action={setFeatureReleaseAction} className="flex flex-wrap items-end gap-2">
          <MutationContextInput />
          <input type="hidden" name="key" value={row.key} />
          <input type="hidden" name="active" value={row.active ? 'false' : 'true'} />
          <Button type="submit" variant="primary" size="md">{row.active ? 'Retire release' : 'Release feature'}</Button>
        </MutationForm>
        <MutationForm action={saveFeatureMetadataAction}
          className="grid gap-3 border-t border-[var(--plum)]/15 pt-3 sm:grid-cols-2">
          <MutationContextInput />
          <input type="hidden" name="key" value={row.key} />
          <label className="grid gap-1">Name
            <input name="name" defaultValue={row.name} required maxLength={120} className="rounded-xl border p-2" />
          </label>
          <label className="grid gap-1">Category
            <input name="category" defaultValue={row.category} required maxLength={40} className="rounded-xl border p-2" />
          </label>
          <label className="grid gap-1 sm:col-span-2">Description
            <textarea name="description" defaultValue={row.description} required maxLength={500} rows={2}
              className="rounded-xl border p-2" />
          </label>
          <Button variant="secondary" size="md" type="submit" className="sm:col-span-2">Save metadata</Button>
        </MutationForm>
      </div>
    </fieldset>
    {row.orphan ? <p className="text-sm">This key is no longer in the code registry. Its record is kept for review: registry sync never modifies it, and its controls stay locked here until the key returns to the registry or the row is removed by a migration.</p> : null}
  </div>;
}

/** Presentational body of the features accordion. Typing narrows the RENDERED
 * LIST in real time (headless narrowing — matches span all rows, server-fed):
 * while narrowed matches are in, they replace the committed page as simple
 * selectable rows with their own pager; clearing the query restores the
 * committed view. The counter stays in the mockup's "N of M selected" format,
 * truthful during narrowing. */
export function FeaturesAccordionView({ features, total, search, page, pageSize, openKey,
  selectedItems, onToggleSelected, onPick, trayCollapsed, onToggleTrayCollapsed,
  onSearchSubmit, narrowing }: FeaturesAccordionViewProps) {
  const selected = new Set(selectedItems.map(item => item.id));
  const narrowed = narrowing.narrowed;
  const counterTotal = narrowed ? narrowing.total : total;
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const categories = [...new Set(features.map(feature => feature.category))].sort();
  return <>
    <div data-testid="features-toolbar" className="flex flex-wrap items-center gap-2">
      <LiveSearchInput id="features-search" label="Search features by name or key"
        placeholder="Search features…" value={narrowing.text}
        onType={narrowing.onType} onEscape={narrowing.onEscape}
        onEnter={onSearchSubmit} className="min-w-0 flex-1" />
      <span className={counterChipClass} data-testid="selected-count">
        {`${selectedItems.length} of ${counterTotal} selected`}
      </span>
    </div>
    <SelectionTray items={selectedItems} onDeselect={onToggleSelected}
      collapsed={trayCollapsed} onCollapsedToggle={onToggleTrayCollapsed} label="Selected">
      {(['true', 'false'] as const).map(setting =>
        <MutationForm key={setting} action={bulkSetFeatureReleaseAction}
          className="flex flex-wrap items-end gap-2">
          <MutationContextInput />
          {selectedItems.map(item =>
            <input key={item.id} type="hidden" name="key" value={item.id} />)}
          <input type="hidden" name="active" value={setting} />
          <Button type="submit" variant="soft" size="sm">
            {setting === 'true' ? 'Release selected' : 'Unrelease selected'}
          </Button>
        </MutationForm>)}
    </SelectionTray>
    {narrowed ? <div data-testid="narrowed-features" className="space-y-1">
      {narrowing.rows.length === 0
        ? <p className="py-3 text-sm text-[var(--midnight)]/70">
            {narrowing.loading ? 'Searching…' : <>Nothing matches “{narrowing.query}”.</>}
          </p>
        : narrowing.rows.map(row => {
            // The orphan lock holds while narrowing: a key absent from the code
            // registry renders exactly like a committed orphan row — visible,
            // greyed, inert — and its pick is a no-op, so it can never enter
            // the selection map behind the bulk Release/Unrelease forms.
            const orphan = !isRegisteredFeatureKey(row.id);
            return <div key={row.id} data-row-id={row.id}
              className={cn('flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 transition-colors',
                !orphan && 'hover:bg-[var(--hover)]', orphan && 'opacity-70')}>
              <input type="checkbox" checked={selected.has(row.id)} disabled={orphan}
                onChange={() => { if (!orphan) onPick(row); }}
                aria-label={`Select ${row.title}`}
                className="h-4 w-4 shrink-0 accent-[var(--plum)]" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{row.title}</span>
                {row.subtitle
                  ? <span className="block truncate font-mono text-[11px] opacity-55">
                      {row.subtitle}{orphan ? ' — orphaned' : ''}
                    </span>
                  : null}
              </span>
            </div>;
          })}
      <NarrowPager page={narrowing.page} total={narrowing.total} pageSize={pageSize}
        onPageChange={narrowing.onPageChange} label="narrowed features" />
    </div> : <>
      {categories.map(category =>
        <section key={category} className="space-y-0">
          <h3 className="mb-1 mt-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--plum)]"
            data-group-header={category}>{categoryLabel(category)}</h3>
          {features.filter(feature => feature.category === category).map(row => {
            const isOpen = row.key === openKey;
            return <div key={row.id} data-row-id={row.key}
              className={cn('rounded-2xl border', row.orphan && 'opacity-70', isOpen
                ? 'border-[var(--plum)]/20 bg-[var(--card)]'
                : 'border-transparent')}>
              <div className={cn('flex items-start gap-3 rounded-2xl px-3.5 py-3',
                !isOpen && 'hover:bg-[var(--hover)]')}>
                {/* Orphaned features are excluded from bulk selection. */}
                <input type="checkbox" checked={selected.has(row.key)} disabled={row.orphan}
                  onChange={() => onToggleSelected(row.key)}
                  aria-label={`Select ${row.name}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--plum)]" />
                {/* Row toggle: a real link keeps Tab/Enter keyboard operability, and the
                    single-open state lives in the URL so back/forward and deep links work. */}
                <Link href={isOpen ? listHrefFor(search, page) : listHrefFor(search, page, row.key)}
                  className="flex flex-1 flex-wrap items-center gap-3" aria-expanded={isOpen}>
                  <ChevronDown aria-hidden="true"
                    className={cn('h-5 w-5 shrink-0 text-[var(--plum)] transition-transform', isOpen && 'rotate-180')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{row.name}</span>
                    <span className="block truncate font-mono text-[11px] opacity-55">
                      {row.key}{row.orphan ? ' — orphaned' : ''}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
                    <span className={badgeTintClass}>{categoryLabel(row.category)}</span>
                    {row.active
                      ? <span className={badgeOnClass}>Released</span>
                      : <span className={badgeOffClass}>Coming soon</span>}
                  </span>
                </Link>
              </div>
              {isOpen ? <FeatureDetail row={row} /> : null}
            </div>;
          })}
        </section>)}
      {features.length === 0
        ? <p className="text-sm text-[var(--midnight)]/70">
            {search ? <>Nothing matches “{search}”.</> : 'No features in the database yet.'}
          </p>
        : null}
      <nav className="mt-4 flex items-center gap-3 border-t border-[var(--hover)] pt-3.5"
        aria-label="Features pagination">
        {page <= 1
          ? <Button type="button" disabled variant="secondary" size="sm">Previous</Button>
          : <Link href={listHrefFor(search, page - 1)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Previous</Link>}
        <span>Page {page} of {lastPage}</span>
        {page >= lastPage
          ? <Button type="button" disabled variant="secondary" size="sm">Next</Button>
          : <Link href={listHrefFor(search, page + 1)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Next</Link>}
        <span className="ml-auto text-xs opacity-55">Grouped by category · sorted by key</span>
      </nav>
    </>}
  </>;
}

/** Client state owner, expressed as a pure reducer so the persistence
 * guarantee is directly testable: the selection map changes only through
 * toggles (copy-on-write) and is never pruned by props — it survives
 * pagination and accordion navigation (both URL-driven). Plain typing in the
 * live search never navigates; the Enter fallback is a soft router.push, so
 * this client island (and its selection map) survives the full-page filtered
 * view — only a hard reload starts a fresh selection. */
export type AccordionState = {
  selection: Map<string, { title: string; subtitle: string }>;
  trayCollapsed: boolean;
};

export type AccordionAction =
  | { type: 'toggle'; key: string; title: string; subtitle: string }
  | { type: 'toggleTrayCollapsed' };

export function accordionReducer(state: AccordionState, action: AccordionAction): AccordionState {
  switch (action.type) {
    case 'toggle': {
      const selection = new Map(state.selection);
      if (selection.has(action.key)) selection.delete(action.key);
      else selection.set(action.key, { title: action.title, subtitle: action.subtitle });
      return { ...state, selection };
    }
    case 'toggleTrayCollapsed':
      return { ...state, trayCollapsed: !state.trayCollapsed };
  }
}

/** Thin client shell around accordionReducer; owns the headless narrowing
 * search. Narrowed feature rows carry the feature KEY as their id (the
 * surface's selection identity), so a narrowed pick lands in the same
 * selection map with full display data. */
export function FeaturesAccordion(props: Omit<FeaturesAccordionViewProps,
  'selectedItems' | 'onToggleSelected' | 'onPick' | 'trayCollapsed' |
  'onToggleTrayCollapsed' | 'onSearchSubmit' | 'narrowing'>) {
  const router = useRouter();
  const [state, dispatch] = useReducer(accordionReducer,
    { selection: new Map<string, { title: string; subtitle: string }>(), trayCollapsed: false });
  const narrowing = useNarrowing({ value: props.search,
    source: narrowViaEndpoint('features', props.pageSize) });
  return <FeaturesAccordionView {...props} narrowing={narrowing}
    selectedItems={[...state.selection].map(([key, item]) =>
      ({ id: key, title: item.title, subtitle: item.subtitle }))}
    onToggleSelected={key => {
      const row = props.features.find(feature => feature.key === key);
      dispatch({ type: 'toggle', key, title: row?.name ?? key, subtitle: key });
    }}
    onPick={item => dispatch({ type: 'toggle', key: item.id, title: item.title,
      subtitle: item.subtitle ?? item.id })}
    trayCollapsed={state.trayCollapsed}
    onToggleTrayCollapsed={() => dispatch({ type: 'toggleTrayCollapsed' })}
    onSearchSubmit={search => router.push(listHrefFor(search, 1))} />;
}
