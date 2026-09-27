'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducer, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { listHref, categoryLabel, counterChipClass, badgeOnClass, badgeOffClass,
  badgeTintClass, searchHiddenFor } from '@/components/admin/list-shared';
import { LiveSearchInput, NarrowPager, useNarrowing, narrowViaEndpoint,
  fetchSelectableRows, type Narrowing, type NarrowingResult, type Suggestion } from '@/components/admin/live-search';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { SelectionTray, type SelectionTrayItem } from '@/components/admin/selection-tray';
import { isRegisteredFeatureKey } from '@/lib/features/registry';
import type { NarrowFeatureRow, SelectableIdRow } from '@/lib/admin/suggest';
import { bulkSetFeatureReleaseAction, saveFeatureMetadataAction,
  setFeatureReleaseAction } from '@/app/admin/features/actions';

type MutationResult = { error?: string; success?: boolean };

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

// --- S13: narrowed rows are full citizens ---------------------------------

/** S13 refresh mechanics: narrowed rows are client-cached between the
 * debounced fetches, so a successful in-place save re-fetches the CURRENT
 * narrowed page and overlays the fresh rows onto the narrowing state — only
 * while it still answers the same query+page (typing or paging invalidates the
 * overlay naturally, so a stale fetch can never bleed into a new query). The
 * committed view needs no overlay: the action's revalidatePath refreshes it. */
export type NarrowRefresh = { query: string; page: number; rows: Suggestion[]; total: number };

export function narrowingWithRefresh(narrowing: Narrowing,
  refresh: NarrowRefresh | null): Narrowing {
  if (!refresh || !narrowing.narrowed || refresh.query !== narrowing.query ||
    refresh.page !== narrowing.page) return narrowing;
  return { ...narrowing, rows: refresh.rows, total: refresh.total };
}

const refreshNarrowedRows = (source: (query: string, page: number,
  signal?: AbortSignal) => Promise<NarrowingResult>, query: string, page: number,
  apply: (refresh: NarrowRefresh) => void) => {
  source(query, page)
    .then(result => apply({ query, page, rows: result.rows, total: result.total }))
    .catch(() => {});
};

/** S13: narrowed features arrive detail-rich (the committed row shape); map
 * the wire shape onto FeatureRowView so narrowed rows flow through the SAME
 * row renderer and detail card as committed rows — one code path. The orphan
 * lock stays a RENDER-TIME registry check (commit 3163399): the registry is
 * code-owned, so the client's own bundle decides greying/locking; the
 * service's orphan field agrees by construction. */
export function narrowedFeatureView(row: NarrowFeatureRow): FeatureRowView {
  return { id: row.featureId, key: row.key, name: row.name, description: row.description,
    category: row.category, active: row.active, orphan: !isRegisteredFeatureKey(row.id),
    assignedPlans: row.assignedPlans, totalPlans: row.totalPlans };
}

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
  /** S13: client-owned single-open state for the NARROWED view — expanding a
   * narrowed row never navigates; the URL still reflects the committed search
   * until Enter (rowClick: 'expand' semantics, checkbox stays the selector). */
  narrowedOpenId: string;
  onNarrowedOpenToggle(key: string): void;
  /** S13b: which feature is in in-place metadata edit mode (client-owned;
   * editing never navigates; orphaned features can never enter edit mode). */
  editingKey: string;
  onStartEdit(key: string): void;
  onCancelEdit(): void;
  /** The wrapped saveFeatureMetadataAction: on success it closes the editor
   * and refreshes the narrowed rows (the committed rows refresh via the
   * action's revalidatePath — the MutationForm success pattern). */
  onSaveEdit(form: FormData): Promise<MutationResult>;
  /** S13c: the mockup #7 select pair between the search input and the gold
   * counter. Select all spans EVERY selectable feature matching the ACTIVE
   * view across ALL pages (ids endpoint + registry check in the shell);
   * Select none clears the whole selection. Optional — absent → no buttons. */
  onSelectAll?(): void;
  onSelectNone?(): void;
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

const editorFieldClass = 'rounded-xl border p-2';

/** S13b: the in-place metadata editor — read-only detail's Edit metadata turns
 * the card into these fields (mockup editHTML), Save/Cancel, no navigation.
 * The stable feature key is submitted hidden and is never editable. */
function FeatureMetadataEditor({ row, onCancelEdit, onSaveEdit }: {
  row: FeatureRowView;
  onCancelEdit(): void;
  onSaveEdit(form: FormData): Promise<MutationResult>;
}) {
  return <div data-detail-card className="rounded-2xl border border-[var(--hover)] bg-[var(--background)] p-3.5">
    <h3 className="mb-2 text-[13px] font-semibold text-[var(--plum)]">Edit metadata</h3>
    <MutationForm action={onSaveEdit} className="grid gap-3"><MutationContextInput />
      <input type="hidden" name="key" value={row.key} />
      <label className="grid gap-1">Name
        <input name="name" defaultValue={row.name} required maxLength={120}
          className={editorFieldClass} /></label>
      <label className="grid gap-1">Category
        <input name="category" defaultValue={row.category} required maxLength={40}
          className={editorFieldClass} /></label>
      <label className="grid gap-1">Description
        <textarea name="description" defaultValue={row.description} required maxLength={500} rows={2}
          className={editorFieldClass} /></label>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" variant="soft" size="sm" onClick={onCancelEdit}>Cancel</Button>
        <Button type="submit" variant="primary" size="md">Save metadata</Button>
      </div>
    </MutationForm>
    <p className="pt-2 text-[12.5px] opacity-70">The stable key
      (<code className="text-xs">{row.key}</code>) cannot be renamed.</p>
  </div>;
}

function FeatureDetail({ row, editing, onStartEdit, onCancelEdit, onSaveEdit }: {
  row: FeatureRowView;
  editing: boolean;
  onStartEdit(): void;
  onCancelEdit(): void;
  onSaveEdit(form: FormData): Promise<MutationResult>;
}) {
  return <div className="space-y-2.5 px-3.5 pb-3.5 pt-1">
    {/* A disabled fieldset makes every control inert for orphaned features —
        the Edit affordance included (S13b: orphaned entities never edit). */}
    <fieldset disabled={row.orphan} className="grid gap-3">
      {editing && !row.orphan ? <FeatureMetadataEditor row={row} onCancelEdit={onCancelEdit}
        onSaveEdit={onSaveEdit} /> : <>
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
        <div className="flex flex-wrap gap-2 pt-1">
          <MutationForm action={setFeatureReleaseAction} className="flex flex-wrap items-end gap-2">
            <MutationContextInput />
            <input type="hidden" name="key" value={row.key} />
            <input type="hidden" name="active" value={row.active ? 'false' : 'true'} />
            <Button type="submit" variant="primary" size="md">{row.active ? 'Retire release' : 'Release feature'}</Button>
          </MutationForm>
          {/* S13b: Edit opens the in-place metadata editor right here. */}
          <Button type="button" variant="soft" size="sm" onClick={onStartEdit}>Edit metadata</Button>
        </div>
      </>}
    </fieldset>
    {row.orphan ? <p className="text-sm">This key is no longer in the code registry. Its record is kept for review: registry sync never modifies it, and its controls stay locked here until the key returns to the registry or the row is removed by a migration.</p> : null}
  </div>;
}

/** The shared row anatomy (S13): committed and narrowed rows both flow through
 * this — one code path for the key line, badges, detail card, and edit
 * affordance. */
function FeatureRowContent({ row, expanded }: { row: FeatureRowView; expanded: boolean }) {
  return <>
    <ChevronDown aria-hidden="true"
      className={cn('h-5 w-5 shrink-0 text-[var(--plum)] transition-transform', expanded && 'rotate-180')} />
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
  </>;
}

/** One accordion row: the SAME renderer for committed and narrowed features.
 * The row body expands the feature (rowClick: 'expand' semantics — the
 * checkbox stays the select affordance); committed rows expand through their
 * URL link, narrowed rows through a client-side toggle that never navigates. */
function FeatureRow({ row, checked, onToggle, href, expanded, onToggleExpand,
  editing, onStartEdit, onCancelEdit, onSaveEdit }: {
    row: FeatureRowView;
    checked: boolean;
    onToggle(): void;
    /** Committed rows: the URL expand/collapse toggle. Narrowed rows omit it
     * and expand client-side via onToggleExpand. */
    href?: string;
    expanded: boolean;
    onToggleExpand?(): void;
    editing: boolean;
    onStartEdit(): void;
    onCancelEdit(): void;
    onSaveEdit(form: FormData): Promise<MutationResult>;
  }) {
  const rowBody = <FeatureRowContent row={row} expanded={expanded} />;
  return <div data-row-id={row.key}
    className={cn('rounded-2xl border', row.orphan && 'opacity-70', expanded
      ? 'border-[var(--plum)]/20 bg-[var(--card)]'
      : 'border-transparent')}>
    <div className={cn('flex items-start gap-3 rounded-2xl px-3.5 py-3',
      !expanded && 'hover:bg-[var(--hover)]')}>
      {/* Orphaned features are excluded from bulk selection; the guard inside
          onChange keeps even a forced change event a no-op. */}
      <input type="checkbox" checked={checked} disabled={row.orphan}
        onChange={() => { if (!row.orphan) onToggle(); }}
        aria-label={`Select ${row.name}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--plum)]" />
      {href !== undefined
        ? <Link href={href} className="flex flex-1 flex-wrap items-center gap-3"
            aria-expanded={expanded}>{rowBody}</Link>
        : <button type="button" onClick={onToggleExpand} aria-expanded={expanded}
            className="flex flex-1 flex-wrap items-center gap-3 text-left">{rowBody}</button>}
    </div>
    {expanded ? <FeatureDetail row={row} editing={editing} onStartEdit={onStartEdit}
      onCancelEdit={onCancelEdit} onSaveEdit={onSaveEdit} /> : null}
  </div>;
}

/** Presentational body of the features accordion. Typing narrows the RENDERED
 * LIST in real time (headless narrowing — matches span all rows, server-fed):
 * while narrowed matches are in, they replace the committed page with rows
 * rendered through the SAME FeatureRow renderer (S13 — full citizens with
 * client-side expand and in-place edit). The counter stays in the mockup's
 * "N of M selected" format, truthful during narrowing. */
export function FeaturesAccordionView({ features, total, search, page, pageSize, openKey,
  selectedItems, onToggleSelected, onPick, trayCollapsed, onToggleTrayCollapsed,
  onSearchSubmit, narrowing, narrowedOpenId, onNarrowedOpenToggle, editingKey,
  onStartEdit, onCancelEdit, onSaveEdit, onSelectAll, onSelectNone }: FeaturesAccordionViewProps) {
  const selected = new Set(selectedItems.map(item => item.id));
  const narrowed = narrowing.narrowed;
  const counterTotal = narrowed ? narrowing.total : total;
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const categories = [...new Set(features.map(feature => feature.category))].sort();
  return <>
    <div data-testid="features-toolbar" className="flex flex-wrap items-center gap-2">
      {/* S13d: the committed catalog holds less than a page → no search input
          (the pair and the counter stay). The count is the committed total,
          never the narrowed match count, so a live query can't hide its input. */}
      {!searchHiddenFor(total, pageSize) ? <LiveSearchInput id="features-search" label="Search features by name or key"
        placeholder="Search features…" value={narrowing.text}
        onType={narrowing.onType} onEscape={narrowing.onEscape}
        onEnter={onSearchSubmit} className="min-w-0 flex-1" /> : null}
      {/* S13c: the mockup #7 pair between the search input and the gold
          counter — compact soft buttons. */}
      {onSelectAll
        ? <Button type="button" variant="soft" size="sm" data-testid="select-all"
            onClick={onSelectAll}>Select all</Button>
        : null}
      {onSelectNone
        ? <Button type="button" variant="soft" size="sm" data-testid="select-none"
            onClick={onSelectNone}>Select none</Button>
        : null}
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
            // The features endpoint serves detail-rich rows (the committed row
            // shape, S13); live-search's lean Suggestion is the transport
            // contract, so the view re-types them at this one boundary.
            const view = narrowedFeatureView(row as NarrowFeatureRow);
            return <FeatureRow key={view.key} row={view}
              checked={selected.has(row.id)}
              onToggle={() => onPick({ id: row.id, title: row.title, subtitle: row.subtitle })}
              expanded={narrowedOpenId === view.key}
              onToggleExpand={() => onNarrowedOpenToggle(view.key)}
              editing={editingKey === view.key}
              onStartEdit={() => onStartEdit(view.key)}
              onCancelEdit={onCancelEdit} onSaveEdit={onSaveEdit} />;
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
            return <FeatureRow key={row.id} row={row}
              checked={selected.has(row.key)} onToggle={() => onToggleSelected(row.key)}
              href={isOpen ? listHrefFor(search, page) : listHrefFor(search, page, row.key)}
              expanded={isOpen}
              editing={editingKey === row.key}
              onStartEdit={() => onStartEdit(row.key)}
              onCancelEdit={onCancelEdit} onSaveEdit={onSaveEdit} />;
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
 * view — only a hard reload starts a fresh selection. Also owns the S13
 * client-side state: the narrowed view's open row and the in-place editor. */
export type AccordionState = {
  selection: Map<string, { title: string; subtitle: string }>;
  trayCollapsed: boolean;
};

export type AccordionAction =
  | { type: 'toggle'; key: string; title: string; subtitle: string }
  | { type: 'merge'; items: Array<{ key: string; title: string; subtitle: string }> }
  | { type: 'clearSelection' }
  | { type: 'toggleTrayCollapsed' };

export function accordionReducer(state: AccordionState, action: AccordionAction): AccordionState {
  switch (action.type) {
    case 'toggle': {
      const selection = new Map(state.selection);
      if (selection.has(action.key)) selection.delete(action.key);
      else selection.set(action.key, { title: action.title, subtitle: action.subtitle });
      return { ...state, selection };
    }
    // S13c: Select all merges the fetched display triples into the same
    // selection map the manual picks use — adds only, never drops; Select
    // none empties it. Copy-on-write like toggle.
    case 'merge': {
      const selection = new Map(state.selection);
      for (const item of action.items)
        selection.set(item.key, { title: item.title, subtitle: item.subtitle });
      return { ...state, selection };
    }
    case 'clearSelection':
      return { ...state, selection: new Map() };
    case 'toggleTrayCollapsed':
      return { ...state, trayCollapsed: !state.trayCollapsed };
  }
}

/** S13c: the ids endpoint returns display triples keyed by the feature KEY;
 * orphaned keys (absent from the code registry) never join — the render-time
 * registry check rules, same as the committed rows' lock. */
export const selectableSelectionItems = (rows: SelectableIdRow[]) =>
  rows.filter(row => isRegisteredFeatureKey(row.id))
    .map(row => ({ key: row.id, title: row.title, subtitle: row.subtitle }));

/** Thin client shell around accordionReducer; owns the headless narrowing
 * search plus the S13 client-side state. Narrowed feature rows carry the
 * feature KEY as their id (the surface's selection identity), so a narrowed
 * pick lands in the same selection map with full display data. */
export function FeaturesAccordion(props: Omit<FeaturesAccordionViewProps,
  'selectedItems' | 'onToggleSelected' | 'onPick' | 'trayCollapsed' |
  'onToggleTrayCollapsed' | 'onSearchSubmit' | 'narrowing' | 'narrowedOpenId' |
  'onNarrowedOpenToggle' | 'editingKey' | 'onStartEdit' | 'onCancelEdit' | 'onSaveEdit'>) {
  const router = useRouter();
  const [state, dispatch] = useReducer(accordionReducer,
    { selection: new Map<string, { title: string; subtitle: string }>(), trayCollapsed: false });
  const [narrowedOpenId, setNarrowedOpenId] = useState('');
  const [editingKey, setEditingKey] = useState('');
  const [narrowRefresh, setNarrowRefresh] = useState<NarrowRefresh | null>(null);
  const source = narrowViaEndpoint('features', props.pageSize);
  const narrowing = useNarrowing({ value: props.search, source });
  // Any user-driven narrowing move (type / page / escape) voids the fresh-rows
  // overlay a previous save produced — handled by wrapping the narrowing
  // handlers, so no state-sync effect is needed.
  const voidRefresh = { onType: (text: string) => { setNarrowRefresh(null); narrowing.onType(text); },
    onPageChange: (page: number) => { setNarrowRefresh(null); narrowing.onPageChange(page); },
    onEscape: () => { setNarrowRefresh(null); narrowing.onEscape(); } };
  const viewNarrowing: Narrowing =
    { ...narrowingWithRefresh(narrowing, narrowRefresh), ...voidRefresh };
  /** S13b save wrapper: on success the editor closes, the committed rows
   * refresh via the action's revalidatePath, and the narrowed view's cached
   * rows are re-fetched for the current query+page. */
  const saveEdit = (form: FormData) => saveFeatureMetadataAction(form).then(result => {
    if (!result.error) {
      setEditingKey('');
      if (narrowing.narrowed)
        refreshNarrowedRows(source, narrowing.query, narrowing.page, setNarrowRefresh);
    }
    return result;
  });
  // S13c: Select all spans EVERY selectable feature matching the ACTIVE view
  // (the narrowed query while narrowed, else the committed search) across ALL
  // pages — one lean ids fetch on click, merged through the same selection
  // structures as manual picks (display triples, orphans filtered by the
  // render-time registry check). Select none clears the whole map.
  const selectAll = () => {
    const query = narrowing.narrowed ? narrowing.query : props.search;
    return fetchSelectableRows('features', query)
      .then(rows => dispatch({ type: 'merge', items: selectableSelectionItems(rows) }));
  };
  return <FeaturesAccordionView {...props} narrowing={viewNarrowing}
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
    narrowedOpenId={narrowedOpenId}
    onNarrowedOpenToggle={key => setNarrowedOpenId(current => (current === key ? '' : key))}
    editingKey={editingKey}
    onStartEdit={key => setEditingKey(key)}
    onCancelEdit={() => setEditingKey('')}
    onSaveEdit={saveEdit}
    onSelectAll={selectAll}
    onSelectNone={() => dispatch({ type: 'clearSelection' })}
    onSearchSubmit={search => router.push(listHrefFor(search, 1))} />;
}