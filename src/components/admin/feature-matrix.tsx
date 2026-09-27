'use client';
import { useActionState, useReducer } from 'react';
import { FEATURE_REGISTRY, registryCategories } from '@/lib/features/registry';
import { summarizePlanForPricing } from '@/lib/features/pricing';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { SelectionList, type SelectionRow } from '@/components/admin/selection-list';
import { categoryLabel } from '@/components/admin/list-shared';
import { Button } from '@/components/ui/button';
import { saveFeatureMatrixAction } from '@/app/admin/plans/actions';

type SaveResult = { error?: string; success?: boolean; warning?: string };

const PAGE_SIZE = 20;
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The full enabled set: feature key → display triple. This map is the single
 * source of truth — toggles mutate it, pagination/search never touch it, so a
 * save during any page or search state reconstructs the complete matrix. */
export type EnabledEntry = { title: string; subtitle: string; group: string };
export type EnabledSet = Map<string, EnabledEntry>;

export type FeatureMatrixViewProps = {
  planId: string;
  planName: string;
  /** The plan's billing options; the preview uses active rows only. */
  options: Array<{ planId: string; interval: string; basePriceCents: number; active: boolean }>;
  /** Full enabled set across every page — never derived from rendered rows. */
  enabled: EnabledSet;
  page: number;
  search: string;
  selectedOnly: boolean;
  trayCollapsed: boolean;
  onToggle(key: string): void;
  onPageChange(page: number): void;
  onSearchChange(search: string): void;
  onSelectedOnlyChange(selectedOnly: boolean): void;
  onTrayCollapsedToggle(): void;
  saveState?: SaveResult;
  saving: boolean;
  onSave(formData: FormData): void;
};

const seedEntry = (key: string): EnabledEntry => {
  const definition = FEATURE_REGISTRY.find(feature => feature.key === key);
  return { title: definition?.name ?? key, subtitle: key, group: definition?.category ?? '' };
};

/** The enabled map seeded from the saved matrix (registry keys only — the page
 * never hands over orphaned keys). */
export const seedEnabledSet = (keys: string[]): EnabledSet =>
  new Map(keys.map(key => [key, seedEntry(key)]));

export type MatrixState = {
  enabled: EnabledSet;
  page: number;
  search: string;
  selectedOnly: boolean;
  trayCollapsed: boolean;
};

export const seedMatrixState = (keys: string[]): MatrixState =>
  ({ enabled: seedEnabledSet(keys), page: 1, search: '', selectedOnly: false, trayCollapsed: false });

export type MatrixAction =
  | { type: 'toggle'; key: string }
  | { type: 'page'; page: number }
  | { type: 'search'; search: string }
  | { type: 'selectedOnly'; selectedOnly: boolean }
  | { type: 'trayCollapsed' };

/** Pure state owner of the matrix: the enabled map changes ONLY through
 * toggles (copy-on-write), so pagination, search, and the selected-only
 * filter can never prune, alter, or lose a pending change — a save during any
 * visible page still reconstructs the complete set. Search resets to page 1;
 * "Selected only" persists across paging and typing (the mockup filters the
 * same list; both filters apply together). */
export function matrixReducer(state: MatrixState, action: MatrixAction): MatrixState {
  switch (action.type) {
    case 'toggle': {
      const enabled = new Map(state.enabled);
      if (enabled.has(action.key)) enabled.delete(action.key);
      else enabled.set(action.key, seedEntry(action.key));
      return { ...state, enabled };
    }
    case 'page':
      return { ...state, page: action.page };
    case 'search':
      return { ...state, search: action.search, page: 1 };
    case 'selectedOnly':
      return { ...state, selectedOnly: action.selectedOnly, page: 1 };
    case 'trayCollapsed':
      return { ...state, trayCollapsed: !state.trayCollapsed };
  }
}

/** Presentational body of the matrix (hook-free; the default export below owns
 * the enabled set, pagination, and save state). Consumes the shared
 * SelectionList in multi mode with `selectedRows` so the tray and "Selected
 * only" toggle work off the full set, and pagination is purely visual over the
 * code registry. */
export function FeatureMatrixView({ planId, planName, options, enabled, page, search,
  selectedOnly, trayCollapsed, onToggle, onPageChange, onSearchChange, onSelectedOnlyChange,
  onTrayCollapsedToggle, saveState, saving, onSave }: FeatureMatrixViewProps) {
  const enabledKeys = new Set(enabled.keys());
  const entries = FEATURE_REGISTRY.map(definition =>
    ({ key: definition.key, enabled: enabledKeys.has(definition.key) }));
  const summary = summarizePlanForPricing({ id: planId }, options, entries);
  // selectedRows is the complete set (group included), rows the visual page.
  const selectedRows: SelectionRow[] = FEATURE_REGISTRY
    .filter(definition => enabledKeys.has(definition.key))
    .map(definition => ({ id: definition.key, ...seedEntry(definition.key), selected: true }));
  const query = search.trim().toLowerCase();
  const filtered = query
    ? FEATURE_REGISTRY.filter(definition =>
        `${definition.key} ${definition.name} ${definition.description} ${definition.category}`
          .toLowerCase().includes(query))
    : FEATURE_REGISTRY;
  const filteredSelected = selectedRows.filter(row =>
    !query || `${row.id} ${row.title} ${row.subtitle ?? ''} ${row.group ?? ''}`.toLowerCase().includes(query));
  // "Selected only" is a paginated filter over the SAME list (mockup INT:160,
  // 176-180): the pool becomes the selected rows, the search still applies,
  // and the pager pages over the matches with live toolbar/counter.
  const pool: SelectionRow[] = selectedOnly
    ? filteredSelected.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        .map(definition => ({ id: definition.key, title: definition.name,
          subtitle: definition.key, group: definition.category,
          selected: enabledKeys.has(definition.key) }));
  const rows: SelectionRow[] = pool;
  const shownTotal = selectedOnly ? filteredSelected.length : filtered.length;
  return <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
    <h3 className="font-semibold">Feature matrix</h3>
    <p>Every registered feature has an explicit control. Disabling a feature removes that access from every account assigned to {planName} on its next gate check. Saves upsert the enabled state and never delete rows, so a disabled feature can be restored safely.</p>
    {saveState?.warning ? <p role="alert"
      className="rounded-2xl border border-dashed border-[var(--lavender-deep)] bg-[var(--hover)] p-3 text-sm text-[var(--plum)]">{saveState.warning}</p> : null}
    <div className="grid gap-2 rounded-2xl border border-[var(--plum)]/15 p-3">
      <h4 className="font-semibold">Pricing preview</h4>
      <p className="text-sm">Monthly: {summary.monthlyCents === null ? 'No active monthly price' : price(summary.monthlyCents)} · Annual: {summary.annualCents === null ? 'No active annual price' : price(summary.annualCents)}</p>
      {summary.enabledFeatures.length === 0
        ? <p className="text-sm">No enabled features yet — public pricing would list nothing as included.</p>
        : registryCategories().map(category => {
          const names = summary.enabledFeatures
            .filter(feature => feature.category === category).map(feature => feature.name);
          return names.length
            ? <p key={category} className="text-sm"><span className="font-semibold">{categoryLabel(category)}</span>: {names.join(', ')}</p>
            : null;
        })}
    </div>
    <SelectionList rows={rows} total={shownTotal} page={page} pageSize={PAGE_SIZE}
      search={search} selectedCount={enabled.size} groups={registryCategories()}
      emptyLabel="No features match this search."
      selectedRows={selectedRows} selectedOnly={selectedOnly}
      trayCollapsed={trayCollapsed}
      onPageChange={onPageChange} onSearchChange={onSearchChange} onToggle={onToggle}
      onSelectedOnlyChange={onSelectedOnlyChange} onTrayCollapsedToggle={onTrayCollapsedToggle}
      footerAction={
        /* The mockup's footer primary action (INT:89-96): the save form lives
           in the shared list's footer slot and always submits the complete
           enabled set, whatever page is visible. */
        <MutationForm action={onSave} className="contents">
          <MutationContextInput />
          <input type="hidden" name="planId" value={planId} />
          {FEATURE_REGISTRY.filter(definition => enabledKeys.has(definition.key)).map(definition =>
            <input key={definition.key} type="hidden" name="feature" value={definition.key} />)}
          <Button type="submit" variant="primary" size="md" disabled={saving}>
            {saving ? 'Saving…' : 'Save feature matrix'}
          </Button>
          {saveState?.error ? <p role="alert" className="text-sm text-rose-700">{saveState.error}</p> : null}
        </MutationForm>} />
  </section>;
}

/** Client shell around the pure matrix state owner: useReducer holds the
 * enabled set and visual pagination (see matrixReducer), useActionState the
 * save boundary. Nothing else. */
export function FeatureMatrix({ planId, planName, options, initialEnabledKeys }: {
  planId: string;
  planName: string;
  options: Array<{ planId: string; interval: string; basePriceCents: number; active: boolean }>;
  /** Registry keys enabled in the saved matrix; everything else starts disabled. */
  initialEnabledKeys: string[];
}) {
  const [state, dispatch] = useReducer(matrixReducer, initialEnabledKeys, seedMatrixState);
  const [saveState, dispatchSave, saving] = useActionState(
    async (_previous: SaveResult | undefined, formData: FormData): Promise<SaveResult> =>
      saveFeatureMatrixAction(formData),
    undefined,
  );
  return <FeatureMatrixView planId={planId} planName={planName} options={options}
    enabled={state.enabled} search={state.search} page={state.page}
    selectedOnly={state.selectedOnly} trayCollapsed={state.trayCollapsed}
    saveState={saveState} saving={saving} onSave={dispatchSave}
    onToggle={key => dispatch({ type: 'toggle', key })}
    onPageChange={page => dispatch({ type: 'page', page })}
    onSearchChange={search => dispatch({ type: 'search', search })}
    onSelectedOnlyChange={selectedOnly => dispatch({ type: 'selectedOnly', selectedOnly })}
    onTrayCollapsedToggle={() => dispatch({ type: 'trayCollapsed' })} />;
}
