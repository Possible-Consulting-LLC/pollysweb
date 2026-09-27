'use client';
import { useActionState, useState } from 'react';
import { FEATURE_REGISTRY, registryCategories } from '@/lib/features/registry';
import { summarizePlanForPricing } from '@/lib/features/pricing';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { SelectionList, type SelectionRow } from '@/components/admin/selection-list';
import { Button } from '@/components/ui/button';
import { saveFeatureMatrixAction } from '@/app/admin/plans/actions';

type SaveResult = { error?: string; success?: boolean; warning?: string };

const PAGE_SIZE = 20;
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const categoryLabel = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

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
  const rows: SelectionRow[] = filtered
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map(definition => ({ id: definition.key, title: definition.name, subtitle: definition.key,
      group: definition.category, selected: enabledKeys.has(definition.key) }));
  return <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
    <h3 className="font-semibold">Feature matrix</h3>
    <p>Every registered feature has an explicit control. Disabling a feature removes that access from every account assigned to {planName} on its next gate check. Saves upsert the enabled state and never delete rows, so a disabled feature can be restored safely.</p>
    {saveState?.warning ? <p role="alert" className="rounded-xl bg-amber-100 p-2 text-sm text-amber-950">{saveState.warning}</p> : null}
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
    <SelectionList rows={rows} total={filtered.length} page={page} pageSize={PAGE_SIZE}
      search={search} selectedCount={enabled.size} groups={registryCategories()}
      emptyLabel="No features match this search."
      selectedRows={selectedRows} selectedOnly={selectedOnly}
      trayCollapsed={trayCollapsed}
      onPageChange={onPageChange} onSearchChange={onSearchChange} onToggle={onToggle}
      onSelectedOnlyChange={onSelectedOnlyChange} onTrayCollapsedToggle={onTrayCollapsedToggle} />
    {/* The save always submits the complete enabled set (the action reconstructs
        the full registry matrix from these keys), whatever page is visible. */}
    <MutationForm action={onSave} className="grid gap-3">
      <MutationContextInput />
      <input type="hidden" name="planId" value={planId} />
      {FEATURE_REGISTRY.filter(definition => enabledKeys.has(definition.key)).map(definition =>
        <input key={definition.key} type="hidden" name="feature" value={definition.key} />)}
      <Button type="submit" variant="primary" size="md" disabled={saving}>
        {saving ? 'Saving…' : 'Save feature matrix'}
      </Button>
      {saveState?.error ? <p role="alert" className="text-sm text-rose-700">{saveState.error}</p> : null}
    </MutationForm>
  </section>;
}

/** Client owner of the enabled set and visual pagination: the map grows and
 * shrinks only through toggles, so paging/searching can never drop a pending
 * change and every save covers all registry keys. */
export function FeatureMatrix({ planId, planName, options, initialEnabledKeys }: {
  planId: string;
  planName: string;
  options: Array<{ planId: string; interval: string; basePriceCents: number; active: boolean }>;
  /** Registry keys enabled in the saved matrix; everything else starts disabled. */
  initialEnabledKeys: string[];
}) {
  const [enabled, setEnabled] = useState<EnabledSet>(() =>
    new Map(initialEnabledKeys.map(key => [key, seedEntry(key)])));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const [saveState, dispatch, saving] = useActionState(
    async (_previous: SaveResult | undefined, formData: FormData): Promise<SaveResult> =>
      saveFeatureMatrixAction(formData),
    undefined,
  );
  return <FeatureMatrixView planId={planId} planName={planName} options={options}
    enabled={enabled} search={search} page={page} selectedOnly={selectedOnly}
    trayCollapsed={trayCollapsed} saveState={saveState} saving={saving} onSave={dispatch}
    onToggle={key => setEnabled(previous => {
      const next = new Map(previous);
      if (next.has(key)) next.delete(key); else next.set(key, seedEntry(key));
      return next;
    })}
    onPageChange={page_ => {
      setPage(page_);
      setSelectedOnly(false);
    }}
    onSearchChange={next => {
      setSearch(next);
      setPage(1);
      setSelectedOnly(false);
    }}
    onSelectedOnlyChange={setSelectedOnly}
    onTrayCollapsedToggle={() => setTrayCollapsed(collapsed => !collapsed)} />;
}
