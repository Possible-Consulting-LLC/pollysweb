'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlanSummary } from '@/lib/admin/plans';
import type { NarrowPlanRow } from '@/lib/admin/suggest';
import { FEATURE_REGISTRY } from '@/lib/features/registry';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { counterChipClass, badgeTintClass, badgeOnClass, badgeOffClass,
  searchHiddenFor } from '@/components/admin/list-shared';
import { LiveSearchInput, NarrowPager, useNarrowing, narrowViaEndpoint,
  fetchSelectableRows, type Narrowing, type NarrowingResult, type Suggestion } from '@/components/admin/live-search';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { SelectionTray, type SelectionTrayItem } from '@/components/admin/selection-tray';
import { bulkSetPlanFlagsAction, deletePlanAction, duplicatePlanAction,
  reorderPlanAction, updatePlanAction } from '@/app/admin/plans/actions';

type MutationResult = { error?: string; success?: boolean };

const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom', INTERNAL: 'Internal' };

/** Mockup row-meta price summary: "$X.XX/mo · $X.XX/yr" from the active
 * billing options (one per interval); inactive-only rows keep their price with
 * an "(inactive)" marker; no options at all render as the mockup's "n/a". */
export function priceSummary(options: PlanSummary['billingOptions']): string {
  if (options.length === 0) return 'n/a';
  const active = options.filter(option => option.active);
  const usable = active.length > 0 ? active : options;
  const parts = usable.map(option => {
    const dollars = option.basePriceCents / 100;
    if (dollars === 0) return '$0';
    return `$${dollars.toFixed(2)}/${option.interval === 'ANNUAL' ? 'yr' : 'mo'}`;
  });
  const suffix = active.length > 0 ? '' : ' (inactive)';
  return `${parts.join(' · ')}${suffix}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const shortDate = (date: Date) => `${MONTHS[date.getMonth()]} ${date.getDate()}`;

/** Mockup "updated 2h ago" style: relative within a week, a short human date
 * beyond it; anything in the future (incl. clock skew) reads "just now". */
export function formatUpdatedAt(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minute = 60_000, hour = 3_600_000, day = 86_400_000;
  if (diffMs < minute) return 'just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return shortDate(date);
}

/** Row toggles preserve search/page; pager links drop `open` (paging folds the accordion). */
const listHref = (search: string, page: number, open?: string) =>
  `/admin/plans?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page),
    ...(open ? { open } : {}) })}`;

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

/** S13: narrowed plans arrive detail-rich (the committed row shape); map the
 * wire shape onto PlanSummary so narrowed rows flow through the SAME row
 * renderer and detail card as committed rows — one code path. */
export function narrowedPlanView(row: NarrowPlanRow): PlanSummary {
  return { id: row.id, name: row.name, description: row.description,
    planType: row.planType, maxSpiders: row.maxSpiders, active: row.active,
    public: row.public, sortOrder: row.sortOrder, updatedAt: new Date(row.updatedAt),
    billingOptionCount: row.billingOptionCount, enabledFeatureCount: row.enabledFeatureCount,
    subscriptionCount: row.subscriptionCount, billingOptions: row.billingOptions };
}

export type PlansAccordionViewProps = {
  plans: PlanSummary[];
  total: number;
  search: string;
  page: number;
  pageSize: number;
  openId: string;
  /** The FULL selection as id→title pairs — includes plans on other pages or
   * hidden by the current search. Never derived from the rendered rows. */
  selectedItems: SelectionTrayItem[];
  /** Checkbox path: toggling a committed row resolves its title via lookup. */
  onToggleSelected(id: string): void;
  /** Narrowed pick path: the full suggestion {id, title, subtitle} is
   * forwarded so tray chips always carry display data (never a raw id). */
  onPick(item: { id: string; title: string; subtitle?: string }): void;
  trayCollapsed: boolean;
  onToggleTrayCollapsed(): void;
  /** The explicit full-page fallback: submits the URL-param search (resets
   * page and open plan). Plain typing in the live search NEVER navigates. */
  onSearchSubmit(search: string): void;
  /** Headless narrowing state (no dropdown anywhere): while matches for the
   * typed text are in, they REPLACE the committed page. */
  narrowing: Narrowing;
  /** S13: client-owned single-open state for the NARROWED view — expanding a
   * narrowed row never navigates; the URL still reflects the committed search
   * until Enter (rowClick: 'expand' semantics, checkbox stays the selector). */
  narrowedOpenId: string;
  onNarrowedOpenToggle(id: string): void;
  /** S13b: which plan is in in-place edit mode (client-owned; editing never
   * navigates). */
  editingId: string;
  onStartEdit(id: string): void;
  onCancelEdit(): void;
  /** The wrapped updatePlanAction: on success it closes the editor and
   * refreshes the narrowed rows (the committed rows refresh via the action's
   * revalidatePath — the MutationForm success pattern). */
  onSaveEdit(form: FormData): Promise<MutationResult>;
  /** S13c: the mockup #7 select pair between the search input and the gold
   * counter. Select all spans EVERY plan matching the ACTIVE view across ALL
   * pages (ids endpoint in the shell); Select none clears the whole
   * selection. Optional — absent → no buttons. */
  onSelectAll?(): void;
  onSelectNone?(): void;
  /** FINALE F3: clears the COMMITTED URL-owned search (a soft navigation to
   * the unsearched first page). The Clear affordance renders whenever a
   * committed search exists and the view is not live-narrowed — including
   * below-page catalogs where the S13d rule hides the input itself. */
  onClearSearch?(): void;
};

/** Mockup detail card: soft-bordered card with a labeled kv grid. */
function DetailCard({ title, rows }: { title: string; rows: Array<{ label: string; value: ReactNode }> }) {
  return <div data-detail-card className="rounded-2xl border border-[var(--hover)] bg-[var(--background)] p-3.5">
    <h3 className="mb-2 text-[13px] font-semibold text-[var(--plum)]">{title}</h3>
    <dl data-kv-grid className="grid grid-cols-[minmax(110px,130px)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
      {rows.map(row => [<dt key={`${row.label}-dt`} className="font-semibold opacity-60">{row.label}</dt>,
        <dd key={`${row.label}-dd`} className="min-w-0">{row.value}</dd>])}
    </dl>
  </div>;
}

const editorFieldClass = 'rounded-xl border p-2';

/** S13b: the in-place plan editor — read-only detail's Edit turns the card
 * into these fields (mockup editHTML), Save/Cancel, no navigation. The
 * feature matrix, billing options, and pricing preview stay in the full
 * editor (the plan-builder page), reached from the link below the form. */
function PlanEditor({ plan, onCancelEdit, onSaveEdit }: {
  plan: PlanSummary;
  onCancelEdit(): void;
  onSaveEdit(form: FormData): Promise<MutationResult>;
}) {
  return <div className="space-y-2.5 px-3.5 pb-3.5 pt-1">
    <div data-detail-card className="rounded-2xl border border-[var(--hover)] bg-[var(--background)] p-3.5">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--plum)]">Edit plan</h3>
      <MutationForm action={onSaveEdit} className="grid gap-3"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <label className="grid gap-1">Name
          <input name="name" defaultValue={plan.name} required maxLength={80}
            className={editorFieldClass} /></label>
        <label className="grid gap-1">Description
          <textarea name="description" defaultValue={plan.description} maxLength={500} rows={2}
            className={editorFieldClass} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">Plan type
            <select name="planType" defaultValue={plan.planType} className={editorFieldClass}>
              <option value="STANDARD">Standard</option>
              <option value="CUSTOM">Custom</option>
              <option value="INTERNAL">Internal</option>
            </select></label>
          <label className="grid gap-1">Maximum spoods (empty = unlimited)
            <input name="maxSpiders" type="number" min={1} step={1}
              defaultValue={plan.maxSpiders ?? ''} className={editorFieldClass} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={plan.active}
            className="h-4 w-4 accent-[var(--plum)]" /> Active</label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="public" defaultChecked={plan.public}
            className="h-4 w-4 accent-[var(--plum)]" /> Public (shown on pricing)</label>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="soft" size="sm" onClick={onCancelEdit}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm">Save changes</Button>
        </div>
      </MutationForm>
      <p className="pt-2 text-[12.5px] opacity-70">The feature matrix, billing options, and
        {' '}pricing preview live in the <Link href={`/admin/plans/${plan.id}/edit`}
          className="underline">full editor</Link> — the approved plan-builder page.</p>
    </div>
  </div>;
}

function PlanDetail({ plan, index, onStartEdit }: {
  plan: PlanSummary; index: number; onStartEdit(): void }) {
  return <div className="space-y-2.5 px-3.5 pb-3.5 pt-1">
    <DetailCard title="Identity" rows={[
      { label: 'Type', value: typeLabel[plan.planType] ?? plan.planType },
      { label: 'Active', value: plan.active ? 'Yes' : 'No' },
      { label: 'Public', value: plan.public
        ? 'Yes — appears on public pricing (future phase)'
        : 'No — assignable only' },
      { label: 'Active spoods', value: plan.maxSpiders === null ? 'Unlimited' : plan.maxSpiders },
      ...(plan.description ? [{ label: 'Description', value: plan.description as ReactNode }] : []),
    ]} />
    <DetailCard title="Billing options" rows={plan.billingOptions.length === 0
      ? [{ label: 'Options', value: 'None' }]
      : plan.billingOptions.map(option => ({ label: option.interval,
          value: `${(option.basePriceCents / 100).toFixed(2)}${option.active ? '' : ' (inactive)'}` }))} />
    <DetailCard title="Usage" rows={[
      { label: 'Enabled features', value: `${plan.enabledFeatureCount} of ${FEATURE_COUNT}` },
      { label: 'Effective subscriptions', value: plan.subscriptionCount },
      { label: 'Last updated', value: formatUpdatedAt(plan.updatedAt) },
    ]} />
    {/* Mockup drow: Edit opens the in-place editor (S13b); the kept extra
        actions (P2 ruling) sit beside it as soft sm buttons. */}
    <div className="flex flex-wrap gap-2 pt-1">
      <Button type="button" variant="primary" size="sm" onClick={onStartEdit}>Edit</Button>
      <MutationForm action={duplicatePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <Button variant="soft" size="sm">Duplicate</Button>
      </MutationForm>
      <MutationForm action={deletePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <Button variant="soft" size="sm">Delete or deactivate</Button>
      </MutationForm>
      <MutationForm action={reorderPlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="direction" value={index === 0 ? 'down' : 'up'} />
        <Button variant="soft" size="sm">Move {index === 0 ? 'down' : 'up'}</Button>
      </MutationForm>
    </div>
  </div>;
}

/** The shared row anatomy (S13): committed and narrowed rows both flow through
 * this — one code path for badges, meta, detail card, and edit affordance. */
function PlanRowContent({ plan, expanded }: { plan: PlanSummary; expanded: boolean }) {
  return <>
    <ChevronDown aria-hidden="true"
      className={cn('h-5 w-5 shrink-0 text-[var(--plum)] transition-transform', expanded && 'rotate-180')} />
    <span className="min-w-0">
      <span className="block text-[15px] font-bold">{plan.name}</span>
      {plan.description ? <span className="block text-xs opacity-60">{plan.description}</span> : null}
    </span>
    <span className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
      <span className={badgeTintClass}>{typeLabel[plan.planType] ?? plan.planType}</span>
      <span className="flex gap-1.5">
        {plan.active
          ? <span className={badgeOnClass}>Active</span>
          : <span className={badgeOffClass}>Inactive</span>}
        {plan.public
          ? <span className={badgeOnClass}>Public</span>
          : <span className={badgeOffClass}>Private</span>}
      </span>
    </span>
    <span className="w-full text-[11.5px] leading-relaxed opacity-70 md:w-auto md:text-right">
      {plan.maxSpiders === null ? 'Unlimited' : `${plan.maxSpiders} spoods`} ·
      {' '}{priceSummary(plan.billingOptions)}
      <br />
      {plan.enabledFeatureCount} features · {plan.subscriptionCount} subscriber{plan.subscriptionCount === 1 ? '' : 's'} ·
      {' '}updated {formatUpdatedAt(plan.updatedAt)}
    </span>
  </>;
}

/** One accordion row: the SAME renderer for committed and narrowed plans.
 * The row body expands the plan (rowClick: 'expand' semantics — the checkbox
 * stays the select affordance); committed rows expand through their URL link,
 * narrowed rows through a client-side toggle that never navigates. */
function PlanRow({ plan, index, checked, onToggle, href, expanded, onToggleExpand,
  editing, onStartEdit, onCancelEdit, onSaveEdit }: {
    plan: PlanSummary;
    index: number;
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
  const rowBody = <PlanRowContent plan={plan} expanded={expanded} />;
  return <div data-row-id={plan.id}
    className={cn('rounded-2xl border', expanded
      ? 'border-[var(--plum)]/20 bg-[var(--card)]'
      : 'border-transparent')}>
    <div className={cn('flex items-start gap-3 rounded-2xl px-3.5 py-3',
      !expanded && 'hover:bg-[var(--hover)]')}>
      <input type="checkbox" checked={checked} onChange={onToggle}
        aria-label={`Select ${plan.name}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--plum)]" />
      {href !== undefined
        ? <Link href={href} className="flex flex-1 flex-wrap items-center gap-3"
            aria-expanded={expanded}>{rowBody}</Link>
        : <button type="button" onClick={onToggleExpand} aria-expanded={expanded}
            className="flex flex-1 flex-wrap items-center gap-3 text-left">{rowBody}</button>}
    </div>
    {expanded ? (editing
      ? <PlanEditor plan={plan} onCancelEdit={onCancelEdit} onSaveEdit={onSaveEdit} />
      : <PlanDetail plan={plan} index={index} onStartEdit={onStartEdit} />)
      : null}
  </div>;
}

const FEATURE_COUNT = FEATURE_REGISTRY.length;

/** Presentational body of the plans accordion. Typing narrows the RENDERED
 * LIST in real time (headless narrowing — matches span all rows, server-fed);
 * the counter stays in the mockup's "N of M selected" format, truthful during
 * narrowing. Narrowed rows are full citizens (S13): detail-rich rows rendered
 * through the same PlanRow renderer, expanding client-side, editing in place. */
export function PlansAccordionView({ plans, total, search, page, pageSize, openId,
  selectedItems, onToggleSelected, onPick, trayCollapsed, onToggleTrayCollapsed,
  onSearchSubmit, narrowing, narrowedOpenId, onNarrowedOpenToggle, editingId,
  onStartEdit, onCancelEdit, onSaveEdit, onSelectAll, onSelectNone, onClearSearch }: PlansAccordionViewProps) {
  const selected = new Set(selectedItems.map(item => item.id));
  const narrowed = narrowing.narrowed;
  const counterTotal = narrowed ? narrowing.total : total;
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return <>
    <div data-testid="plans-toolbar" className="flex flex-wrap items-center gap-2">
      {/* S13d: the committed catalog holds less than a page (the real catalog
          is ~4 plans) → no search input; the pair and the counter stay. The
          count is the committed total, never the narrowed match count. */}
      {!searchHiddenFor(total, pageSize) ? <LiveSearchInput id="plans-search" label="Search plans by name"
        placeholder="Search plans by name…" value={narrowing.text}
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
      {/* FINALE F3: the committed search's in-place Clear (subscriptions-list
          placement). It survives the S13d input-hiding — the real catalog is
          below one page, so a committed search here MUST keep its in-place
          recovery. While a live narrowing query owns the view, it hides. */}
      {search && !narrowed && onClearSearch
        ? <Button type="button" variant="ghost" size="sm" data-testid="clear-search"
            onClick={onClearSearch}>Clear</Button>
        : null}
    </div>
    <SelectionTray items={selectedItems} onDeselect={onToggleSelected}
      collapsed={trayCollapsed} onCollapsedToggle={onToggleTrayCollapsed} label="Selected">
      {(['active', 'public'] as const).flatMap(field =>
        [true, false].map(setting => {
          const labelText = field === 'active'
            ? (setting ? 'Activate' : 'Deactivate')
            : (setting ? 'Publish' : 'Unpublish');
          return <MutationForm key={`${field}:${setting}`} action={bulkSetPlanFlagsAction}
            className="flex flex-wrap items-end gap-2">
            <MutationContextInput />
            {selectedItems.map(item =>
              <input key={item.id} type="hidden" name="planId" value={item.id} />)}
            <input type="hidden" name="field" value={field} />
            <input type="hidden" name="value" value={String(setting)} />
            <Button variant="soft" size="sm">{labelText}</Button>
          </MutationForm>;
        }))}
    </SelectionTray>
    {narrowed ? <div data-testid="narrowed-plans" className="space-y-1">
      {narrowing.rows.length === 0
        ? <p className="py-3 text-sm text-[var(--midnight)]/70">
            {narrowing.loading ? 'Searching…' : <>Nothing matches “{narrowing.query}”.</>}
          </p>
        : narrowing.rows.map((row, index) => {
            // The plans endpoint serves detail-rich rows (the committed row
            // shape, S13); live-search's lean Suggestion is the transport
            // contract, so the view re-types them at this one boundary.
            const plan = narrowedPlanView(row as NarrowPlanRow);
            return <PlanRow key={plan.id} plan={plan} index={index}
              checked={selected.has(plan.id)}
              onToggle={() => onPick({ id: row.id, title: row.title, subtitle: row.subtitle })}
              expanded={narrowedOpenId === plan.id}
              onToggleExpand={() => onNarrowedOpenToggle(plan.id)}
              editing={editingId === plan.id}
              onStartEdit={() => onStartEdit(plan.id)}
              onCancelEdit={onCancelEdit} onSaveEdit={onSaveEdit} />;
          })}
      <NarrowPager page={narrowing.page} total={narrowing.total} pageSize={pageSize}
        onPageChange={narrowing.onPageChange} label="narrowed plans" />
    </div> : <>
      {plans.map((plan, index) => {
        const isOpen = plan.id === openId;
        return <PlanRow key={plan.id} plan={plan} index={index}
          checked={selected.has(plan.id)} onToggle={() => onToggleSelected(plan.id)}
          href={isOpen ? listHref(search, page) : listHref(search, page, plan.id)}
          expanded={isOpen}
          editing={editingId === plan.id}
          onStartEdit={() => onStartEdit(plan.id)}
          onCancelEdit={onCancelEdit} onSaveEdit={onSaveEdit} />;
      })}
      {plans.length === 0
        ? <p className="text-sm text-[var(--midnight)]/70">
            {search ? <>Nothing matches “{search}”.</> : 'No plans yet.'}
          </p>
        : null}
      <nav className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--hover)] pt-3.5"
        aria-label="Plans pagination">
        {page <= 1
          ? <Button type="button" disabled variant="secondary" size="sm">Previous</Button>
          : <Link href={listHref(search, page - 1)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Previous</Link>}
        <span>Page {page} of {lastPage}</span>
        {page >= lastPage
          ? <Button type="button" disabled variant="secondary" size="sm">Next</Button>
          : <Link href={listHref(search, page + 1)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Next</Link>}
        <span className="ml-auto text-xs opacity-55">Sorted by display order</span>
      </nav>
    </>}
  </>;
}

/** Client owner of the selection state: an id→{title,subtitle} map that grows
 * as boxes are checked and is never pruned by pagination or search, so
 * selections and the tray survive page changes, new searches, and re-renders.
 * Plain typing in the live search never navigates; the explicit fallback
 * (Enter with the typed filter) is the sole navigation. Also owns the S13
 * client-side state: the narrowed view's open row and the in-place editor. */
export function PlansAccordion(props: Omit<PlansAccordionViewProps,
  'selectedItems' | 'onToggleSelected' | 'onPick' | 'trayCollapsed' |
  'onToggleTrayCollapsed' | 'onSearchSubmit' | 'narrowing' | 'narrowedOpenId' |
  'onNarrowedOpenToggle' | 'editingId' | 'onStartEdit' | 'onCancelEdit' | 'onSaveEdit'>) {
  const router = useRouter();
  const [selection, setSelection] = useState<Map<string, { title: string; subtitle: string }>>(new Map());
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const [narrowedOpenId, setNarrowedOpenId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [narrowRefresh, setNarrowRefresh] = useState<NarrowRefresh | null>(null);
  const source = narrowViaEndpoint('plans', props.pageSize);
  const narrowing = useNarrowing({ value: props.search, source });
  // Any user-driven narrowing move (type / page / escape) voids the fresh-rows
  // overlay a previous save produced — handled by wrapping the narrowing
  // handlers, so no state-sync effect is needed.
  const voidRefresh = { onType: (text: string) => { setNarrowRefresh(null); narrowing.onType(text); },
    onPageChange: (page: number) => { setNarrowRefresh(null); narrowing.onPageChange(page); },
    onEscape: () => { setNarrowRefresh(null); narrowing.onEscape(); } };
  const viewNarrowing: Narrowing =
    { ...narrowingWithRefresh(narrowing, narrowRefresh), ...voidRefresh };
  const saveEdit = (form: FormData) => updatePlanAction(form).then(result => {
    if (!result.error) {
      setEditingId('');
      // The committed rows refresh via the action's revalidatePath; the
      // narrowed view's cached rows are re-fetched for the current query+page.
      if (narrowing.narrowed)
        refreshNarrowedRows(source, narrowing.query, narrowing.page, setNarrowRefresh);
    }
    return result;
  });
  const rowOf = (id: string) => props.plans.find(plan => plan.id === id);
  // S13c: Select all spans EVERY plan matching the ACTIVE view (the narrowed
  // query while narrowed, else the committed search) across ALL pages — one
  // lean ids fetch on click, merged into the same selection map as manual
  // picks with display data. Select none clears the whole map.
  const selectAll = () => {
    const query = narrowing.narrowed ? narrowing.query : props.search;
    return fetchSelectableRows('plans', query).then(rows =>
      setSelection(previous => {
        const next = new Map(previous);
        for (const row of rows)
          next.set(row.id, { title: row.title, subtitle: row.subtitle });
        return next;
      }));
  };
  return <PlansAccordionView {...props} narrowing={viewNarrowing}
    selectedItems={[...selection].map(([id, item]) => ({ id, title: item.title, subtitle: item.subtitle }))}
    onToggleSelected={id => setSelection(previous => {
      const next = new Map(previous);
      if (next.has(id)) next.delete(id);
      else next.set(id, { title: rowOf(id)?.name ?? id, subtitle: typeLabel[rowOf(id)?.planType ?? ''] ?? '' });
      return next;
    })}
    onPick={item => setSelection(previous => {
      const next = new Map(previous);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, { title: item.title, subtitle: item.subtitle ?? '' });
      return next;
    })}
    trayCollapsed={trayCollapsed}
    onToggleTrayCollapsed={() => setTrayCollapsed(collapsed => !collapsed)}
    narrowedOpenId={narrowedOpenId}
    onNarrowedOpenToggle={id => setNarrowedOpenId(current => (current === id ? '' : id))}
    editingId={editingId}
    onStartEdit={id => setEditingId(id)}
    onCancelEdit={() => setEditingId('')}
    onSaveEdit={saveEdit}
    onSelectAll={selectAll}
    onSelectNone={() => setSelection(new Map())}
    onSearchSubmit={search => router.push(listHref(search, 1))}
    onClearSearch={() => router.push(listHref('', 1))} />;
}
