'use client';
import Link from 'next/link';
import { useReducer } from 'react';
import { ChevronDown } from 'lucide-react';
import { buttonVariants, Button } from '@/components/ui/button';
import { cardClassName } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { listHref, categoryLabel } from '@/components/admin/list-shared';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { SelectionTray, type SelectionTrayItem } from '@/components/admin/selection-tray';
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
  /** Database feature count for the current query; the counter denominator. */
  total: number;
  search: string;
  page: number;
  /** URL-owned single-open state, keyed by feature key. */
  openKey: string;
  /** The FULL selection as key→title pairs — includes features on other pages
   * or hidden by the current search. Never derived from the rendered rows. */
  selectedItems: SelectionTrayItem[];
  onToggleSelected(key: string): void;
  trayCollapsed: boolean;
  onToggleTrayCollapsed(): void;
};

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={cn(cardClassName, 'space-y-2 p-4')}>
    <h3 className="text-sm font-semibold text-[var(--plum)]">{title}</h3>
    {children}
  </div>;
}

function FeatureDetail({ row }: { row: FeatureRowView }) {
  return <div className="space-y-3 border-t border-[var(--plum)]/10 p-4">
    <div className="grid gap-3 md:grid-cols-3">
      <DetailCard title="Identity">
        <p>Key: <code className="text-xs">{row.key}</code></p>
        <p>Category: {categoryLabel(row.category)}</p>
        <p>{row.description}</p>
      </DetailCard>
      <DetailCard title="Release state">
        <p>{row.active
          ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Released</span>
          : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Not released</span>}</p>
      </DetailCard>
      <DetailCard title="Plan assignments">
        <p>{row.assignedPlans.length} of {row.totalPlans} plans</p>
        {row.assignedPlans.length
          ? <p>{row.assignedPlans.join(', ')}</p>
          : <p>No plans use this feature yet.</p>}
      </DetailCard>
    </div>
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

/** Presentational body of the features accordion (hook-free; the default export
 * below owns the selection/collapse state). Grouping is derived from the rows
 * themselves — orphaned categories slot in alphabetically like registry ones. */
export function FeaturesAccordionView({ features, total, search, page, openKey, selectedItems,
  onToggleSelected, trayCollapsed, onToggleTrayCollapsed }: FeaturesAccordionViewProps) {
  const selected = new Set(selectedItems.map(item => item.id));
  const categories = [...new Set(features.map(feature => feature.category))].sort();
  return <>
    <p className="text-sm">
      {selectedItems.length > 0
        ? <span className="rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-semibold text-[var(--panel)]"
            data-testid="selection-counter">
            {`${selectedItems.length} of ${total} selected`}
          </span>
        : <span>{`${total} feature${total === 1 ? '' : 's'}${search ? ' matching the search' : ''}`}</span>}
    </p>
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
    {categories.map(category =>
      <section key={category} className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--midnight)]/70"
          data-group-header={category}>{categoryLabel(category)}</h3>
        {features.filter(feature => feature.category === category).map(row => {
          const isOpen = row.key === openKey;
          return <div key={row.id} className={cn(cardClassName, 'space-y-3', row.orphan && 'opacity-70')}>
            <div className="flex items-start gap-3 p-4">
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
                  <span className="block font-semibold">{row.name}</span>
                  <span className="block text-sm text-[var(--midnight)]/60">{row.description}</span>
                </span>
                <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">{row.key}</span>
                  {row.active
                    ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Released</span>
                    : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Not released</span>}
                  {row.orphan ? <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-950">Orphaned</span> : null}
                </span>
              </Link>
            </div>
            {isOpen ? <FeatureDetail row={row} /> : null}
          </div>;
        })}
      </section>)}
  </>;
}

/** Client state owner, expressed as a pure reducer so the persistence
 * guarantee is directly testable: the selection map changes only through
 * toggles (copy-on-write) and is never pruned by props — it survives
 * pagination and accordion navigation (both URL-driven). A fresh search
 * submit is a GET form navigation that remounts the client island, so
 * selection resets there by design. */
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

/** Thin client shell around accordionReducer. */
export function FeaturesAccordion(props: Omit<FeaturesAccordionViewProps,
  'selectedItems' | 'onToggleSelected' | 'trayCollapsed' | 'onToggleTrayCollapsed'>) {
  const [state, dispatch] = useReducer(accordionReducer,
    { selection: new Map<string, { title: string; subtitle: string }>(), trayCollapsed: false });
  return <FeaturesAccordionView {...props}
    selectedItems={[...state.selection].map(([key, item]) =>
      ({ id: key, title: item.title, subtitle: item.subtitle }))}
    onToggleSelected={key => {
      const row = props.features.find(feature => feature.key === key);
      dispatch({ type: 'toggle', key, title: row?.name ?? key, subtitle: key });
    }}
    trayCollapsed={state.trayCollapsed}
    onToggleTrayCollapsed={() => dispatch({ type: 'toggleTrayCollapsed' })} />;
}
