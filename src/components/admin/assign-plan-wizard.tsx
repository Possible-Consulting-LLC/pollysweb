'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SelectionList, type SelectionRow } from '@/components/admin/selection-list';
import { counterChipClass, searchHiddenFor } from '@/components/admin/list-shared';
import { LiveSearchInput, useNarrowing, narrowViaEndpoint, fetchSelectableRows,
  type Narrowing } from '@/components/admin/live-search';
import { Button, buttonVariants } from '@/components/ui/button';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { cn } from '@/lib/utils';
import { assignSubscriptionAction } from '@/app/admin/subscriptions/actions';

export type WizardUser = { id: string; name: string; email: string };
export type WizardOption = { id: string; interval: string; basePriceCents: number;
  active: boolean };
export type WizardPlan = { id: string; name: string; planType: string;
  billingOptions: WizardOption[] };
export type PickerRow = { id: string; title: string; subtitle?: string;
  leading?: string; disabled?: boolean; badgeLabel?: string;
  /** The plan's enabled feature names — the picker's read-only
   * "Included features" line (Task 10; nothing feature-editable here). */
  features?: string[] };
export type PickerData = { rows: PickerRow[]; total: number; page: number;
  pageSize: number; search: string };
export type AssignResult = { error?: string; success?: boolean };

/** The wizard's step/plan/option state is URL-owned (`?wizard=open&step=…&plan=…&option=…`
 * plus per-picker `usearch/upage/psearch/ppage`) so it survives re-renders,
 * back/forward, and deep links. The KEEPER selection is client-owned (Task 10
 * multi-select): a tray of picks that persists across picker pages and
 * searches exactly like the accordions' selection maps — carried by the
 * wrapper's state, submitted with the assign form. A Reassign deep link seeds
 * it via `prefilledKeepers`. */
export type WizardNav = { step: number; user?: string; plan?: string; option?: string;
  usearch?: string; upage?: number; psearch?: string; ppage?: number };
type ListLocation = { search: string; page: number };

/** URL for the subscriptions list alone (the wizard folded away). */
export function subscriptionsHref(list: ListLocation): string {
  const params = new URLSearchParams();
  if (list.search) params.set('search', list.search);
  if (list.page > 1) params.set('page', String(list.page));
  const query = params.toString();
  return `/admin/subscriptions${query ? `?${query}` : ''}`;
}

/** URL for the wizard at a given state. Empty values are dropped so a fresh
 * step shows a fresh picker; callers pass `upage`/`ppage` <= 1 to reset pages. */
export function wizardHref(list: ListLocation, nav: WizardNav): string {
  const params = new URLSearchParams();
  if (list.search) params.set('search', list.search);
  if (list.page > 1) params.set('page', String(list.page));
  params.set('wizard', 'open');
  params.set('step', String(nav.step));
  if (nav.user) params.set('user', nav.user);
  if (nav.plan) params.set('plan', nav.plan);
  if (nav.option) params.set('option', nav.option);
  if (nav.usearch) params.set('usearch', nav.usearch);
  if (nav.upage && nav.upage > 1) params.set('upage', String(nav.upage));
  if (nav.psearch) params.set('psearch', nav.psearch);
  if (nav.ppage && nav.ppage > 1) params.set('ppage', String(nav.ppage));
  return `/admin/subscriptions?${params.toString()}`;
}

const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom',
  INTERNAL: 'Internal' };
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const renewalLabel = (interval: string) =>
  interval === 'ANNUAL' ? 'Renews annually' : 'Renews monthly';

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(word => word.charAt(0)).join('')
    .slice(0, 2).toUpperCase();
}

const STEPS = [{ n: 1, label: 'Keepers' }, { n: 2, label: 'Plan' },
  { n: 3, label: 'Options' }];

/** Keeper row anatomy (user-picker mockup ~44,49-52,194-196): a circular
 * lavender initials chip up front and a trailing meta badge — "Valid" on
 * selectable accounts, the deleting status on greyed, unselectable ones. */
function userRowToSelection(row: PickerRow, selected: boolean): SelectionRow {
  return {
    id: row.id, title: row.title, subtitle: row.subtitle,
    leading: row.leading ?? initialsOf(row.title),
    disabled: row.disabled,
    selected,
    badge: row.disabled
      ? { label: row.badgeLabel ?? 'deleting', tone: 'muted' }
      : selected
        ? { label: 'Selected', tone: 'selected' }
        : { label: 'Valid', tone: 'ok' },
  };
}

/** The selected-keeper tray row (mockup: the same anatomy, gold Selected badge). */
function keeperToSelection(keeper: WizardUser): SelectionRow {
  return { id: keeper.id, title: keeper.name || keeper.email, subtitle: keeper.email,
    leading: initialsOf(keeper.name || keeper.email),
    badge: { label: 'Selected', tone: 'selected' } };
}

/** The plan picker's read-only "Included features" line (mockup's .flist):
 * the ONLY feature content on the page — nothing feature-editable exists here. */
function IncludedFeatures({ features }: { features: string[] }) {
  return <span data-testid="plan-features" className="mt-1 block text-xs leading-relaxed opacity-75">
    <span className="mb-0.5 block text-[10.5px] font-extrabold uppercase tracking-[0.08em]
      text-[var(--plum)]">Included features — read-only</span>
    {features.length > 0 ? features.join(', ') : 'No enabled features yet'}
  </span>;
}

/** Today as a `YYYY-MM-DD` date string — the effective date's mockup prefill. */
export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** SelectionList's type keeps `onToggle`/`onPageChange`/`onSearchChange`
 * required (multi mode's callbacks); single-mode focused views fire none of
 * them, so focused views pass this stable inert set. */
const inertListCallbacks = { onToggle: () => {}, onPageChange: () => {},
  onSearchChange: () => {} };

/** The pickers' page size (S13d): the options list shares it so the same
 * less-than-a-page rule keeps a couple of billing options search-free. */
const PICKER_PAGE_SIZE = 20;

export type AssignPlanWizardViewProps = {
  /** Requested step (the server clamps it to the URL state; the view further
   * clamps any step beyond 1 back to 1 while the keeper batch is empty — the
   * selection is client-owned, so a stale deep link lands on step 1). */
  step: number;
  /** Current list location, carried through every wizard URL. */
  listSearch: string;
  listPage: number;
  /** The client-owned keeper batch (tray + context bar + summary + submit). */
  selectedKeepers: WizardUser[];
  selectedPlan: WizardPlan | null;
  selectedOptionId: string;
  /** Server-fed page for the user picker (committed rows while not narrowed). */
  userPicker: PickerData;
  planPicker: PickerData;
  /** Headless narrowing searches for the two pickers (no dropdown anywhere):
   * while narrowed matches for the typed text are in, they REPLACE the
   * committed picker page and the counter shows the truthful live match
   * count. */
  userNarrowing: Narrowing;
  planNarrowing: Narrowing;
  effectiveAt: string;
  onEffectiveAtChange(value: string): void;
  /** Multi-select handlers — the parent (client wrapper) owns the batch. */
  onToggleKeeper(id: string): void;
  /** S13c: Select all spans EVERY selectable keeper across all pages
   * (deleting accounts never join); Select none clears the batch. */
  onSelectAllKeepers(): unknown;
  onSelectNoneKeepers(): void;
  /** Parent-owned tray collapse flag. */
  trayCollapsed: boolean;
  onTrayCollapsedToggle(): void;
  navigate(href: string): void;
  /** Debounced navigation for search inputs (one round trip per typing pause). */
  navigateSearch(href: string): void;
  assignDispatch(form: FormData): void;
  assignResult?: AssignResult;
  assignPending?: boolean;
};

/** Presentational body of the assignment wizard (hook-free; the default export
 * below owns the selection state, action state, router, and search debounce). */
export function AssignPlanWizardView({ step, listSearch, listPage, selectedKeepers,
  selectedPlan, selectedOptionId, userPicker, planPicker, userNarrowing, planNarrowing,
  effectiveAt, onEffectiveAtChange, onToggleKeeper, onSelectAllKeepers, onSelectNoneKeepers,
  trayCollapsed, onTrayCollapsedToggle, navigate, navigateSearch, assignDispatch,
  assignResult, assignPending = false }: AssignPlanWizardViewProps) {
  const list = { search: listSearch, page: listPage };
  // Keepers are client-owned: a step beyond 1 with an empty batch folds back
  // to step 1 (deep links can never strand on a phantom batch).
  const effectiveStep = step > 1 && selectedKeepers.length === 0 ? 1 : step;
  // Narrowed matches for the typed text replace the committed picker page.
  const userLive = userNarrowing.narrowed;
  const planLive = planNarrowing.narrowed;
  const planId = selectedPlan?.id ?? '';
  const selectedIds = new Set(selectedKeepers.map(keeper => keeper.id));
  const keeperNames = selectedKeepers
    .map(keeper => keeper.name || keeper.email).join(', ');
  const optionRows = (selectedPlan?.billingOptions ?? []).filter(option => option.active)
    .map(option => ({ id: option.id,
      title: `${intervalLabel[option.interval] ?? option.interval} — ${price(option.basePriceCents)}`,
      subtitle: renewalLabel(option.interval), selected: option.id === selectedOptionId }));
  const selectedOption = optionRows.find(option => option.selected);
  // Plan rows (committed or narrowed) carry their read-only feature names.
  const planSource: Array<{ id: string; title: string; subtitle?: string;
    features?: string[] }> = planLive
    ? planNarrowing.rows as Array<{ id: string; title: string; subtitle?: string;
        features?: string[] }>
    : planPicker.rows;
  const featuresFor = (id: string) => planSource.find(row => row.id === id)?.features ?? [];
  const userPickerLocation = { usearch: userPicker.search, upage: userPicker.page };
  return <section data-testid="assign-wizard" aria-label="Assign a plan"
    className="space-y-4 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Assign a plan</h3>
      <Button type="button" variant="ghost" size="sm"
        onClick={() => navigate(subscriptionsHref(list))}>Cancel</Button>
    </div>
    <nav aria-label="Assignment steps" className="flex flex-wrap items-center gap-2">
      {STEPS.map(({ n, label }, index) => <span key={n} className="flex items-center gap-2">
        {index > 0 ? <span aria-hidden="true" className="text-sm opacity-40">→</span> : null}
        <span aria-current={effectiveStep === n ? 'step' : undefined}
          className={cn('rounded-full px-3 py-1 text-xs font-semibold',
            effectiveStep === n ? 'bg-[var(--plum)] text-[var(--on-accent)]'
              : effectiveStep > n ? 'bg-[var(--lavender)] text-[var(--midnight)]'
              : 'bg-[var(--hover)] text-[var(--midnight)] opacity-55')}>
          {n} · {label}
        </span>
      </span>)}
    </nav>
    {/* Persistent context: steps 2+3 (mockup's ctxbar) — the batch follows the
     * admin through the plan and options steps. */}
    {effectiveStep >= 2 ? <div data-testid="wizard-context"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] px-3 py-2.5">
      <div className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--plum)]">Assigning to</span>
        <span className="block text-[13px]"><b>
          {`${selectedKeepers.length} keeper${selectedKeepers.length === 1 ? '' : 's'}`}
        </b>: {keeperNames}</span>
      </div>
      <Button type="button" variant="ghost" size="sm" aria-label="Change keepers"
        className="ml-auto" onClick={() => navigate(wizardHref(list, { step: 1,
          ...userPickerLocation }))}>Change</Button>
    </div> : null}
    {effectiveStep === 1 ? <section data-wizard-step="1" className="space-y-3">
      {/* Multi-select keepers (Task 10, amended user-picker mockup): click rows
       * or checkboxes to build a LIST; the tray and gold counter follow across
       * pages; Select all takes every selectable keeper on every page (S13c
       * machinery via the users ids endpoint — deleting accounts never join). */}
      <SelectionList selectionMode="multi"
        rows={(userLive ? userNarrowing.rows : userPicker.rows).map(row =>
          userRowToSelection(row as PickerRow, selectedIds.has(row.id)))}
        total={userLive ? userNarrowing.total : userPicker.total}
        page={userLive ? userNarrowing.page : userPicker.page}
        pageSize={userPicker.pageSize}
        search="" selectedCount={selectedKeepers.length}
        onToggle={onToggleKeeper}
        onSelectAll={onSelectAllKeepers} onSelectNone={onSelectNoneKeepers}
        selectedRows={selectedKeepers.map(keeperToSelection)}
        trayCollapsed={trayCollapsed} onTrayCollapsedToggle={onTrayCollapsedToggle}
        emptyLabel={userLive
          ? `Nothing matches “${userNarrowing.query}”.`
          : 'No keepers match this search.'}
        onPageChange={page => userLive
          ? userNarrowing.onPageChange(page)
          : navigate(wizardHref(list, { step: 1, ...userPickerLocation,
              upage: page }))}
        onSearchChange={() => {}}
        searchSlot={!searchHiddenFor(userPicker.total, userPicker.pageSize)
          ? <LiveSearchInput id="wizard-user-search"
            label="Search keepers by name or email"
            placeholder="Search keepers by name or email…" value={userNarrowing.text}
            onType={userNarrowing.onType} onEscape={userNarrowing.onEscape}
            onEnter={text => navigateSearch(wizardHref(list, { step: 1,
              usearch: text, upage: 1 }))}
            className="min-w-0 flex-1" />
          : undefined}
        footerAction={selectedKeepers.length > 0
          ? <Link href={wizardHref(list, { step: 2, ...userPickerLocation })}
              className={buttonVariants({ variant: 'primary', size: 'sm' })}>Continue ›</Link>
          : <Button type="button" variant="primary" size="sm" disabled>Continue ›</Button>} />
      <p className="text-xs leading-relaxed opacity-60">
        Build a <b>list</b> of keepers: click rows (or checkboxes) to select as
        many as you like — the tray and gold counter follow you across pages.{' '}
        <b>Select all</b> takes every selectable keeper on every page (deleting
        accounts never join). Click a chip&apos;s <b>×</b> to remove someone.
        Then continue to the plan.
      </p>
    </section> : null}
    {effectiveStep === 2 ? <section data-wizard-step="2" className="space-y-3">
      {selectedPlan
        ? <SelectionList selectionMode="single" rows={[]} total={1} page={1} pageSize={1}
            search="" selectedCount={1} {...inertListCallbacks}
            selectedRows={[{ id: selectedPlan.id, title: selectedPlan.name,
              subtitle: `${typeLabel[selectedPlan.planType] ?? selectedPlan.planType} · ${
                selectedPlan.billingOptions.filter(option => option.active).length} active billing option(s)`,
              selected: true, badge: { label: 'Selected', tone: 'selected' } }]}
            onChange={() => navigate(wizardHref(list, { step: 2,
              psearch: planPicker.search, ppage: planPicker.page }))} />
        : <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* S13d: the committed picker holds less than a page (~4 plans
                  real) → no search input; the count chip stays. The count is
                  the committed total, never the narrowed match count. */}
              {!searchHiddenFor(planPicker.total, planPicker.pageSize)
                ? <LiveSearchInput id="wizard-plan-search" label="Search plans by name"
                placeholder="Search plans by name…" value={planNarrowing.text}
                onType={planNarrowing.onType} onEscape={planNarrowing.onEscape}
                onEnter={text => navigateSearch(wizardHref(list, { step: 2,
                  psearch: text, ppage: 1 }))}
                className="min-w-0 flex-1" />
                : null}
              <span className={counterChipClass} data-testid="picker-count">
                {`${planLive ? planNarrowing.total : planPicker.total} plan${
                  (planLive ? planNarrowing.total : planPicker.total) === 1 ? '' : 's'}`}
              </span>
            </div>
            <SelectionList selectionMode="single" toolbar={false}
              rows={planSource.map(row => ({ id: row.id, title: row.title,
                subtitle: row.subtitle }))}
              rowDetail={row => <IncludedFeatures features={featuresFor(row.id)} />}
              total={planLive ? planNarrowing.total : planPicker.total}
              page={planLive ? planNarrowing.page : planPicker.page}
              pageSize={planPicker.pageSize}
              search="" selectedCount={0} {...inertListCallbacks}
              emptyLabel={planLive
                ? `Nothing matches “${planNarrowing.query}”.`
                : 'No active plans match this search.'}
              onRowSelect={id => navigate(wizardHref(list, { step: 3, plan: id,
                psearch: planPicker.search, ppage: planPicker.page }))}
              onPageChange={page => planLive
                ? planNarrowing.onPageChange(page)
                : navigate(wizardHref(list, { step: 2,
                    psearch: planPicker.search, ppage: page }))} />
          </section>}
      <p className="text-xs leading-relaxed opacity-60">
        Plans exist <b>ahead of time</b> — only active, existing plans are
        listed; nothing is created here. Clicking a plan selects it and
        continues straight to options. Each plan shows its <b>included features
        read-only</b> — the only feature content on this page.
      </p>
      <div className="flex items-center justify-between gap-2">
        <Link href={wizardHref(list, { step: 1, ...userPickerLocation })}
          className={buttonVariants({ variant: 'soft', size: 'md' })}>Back to keepers</Link>
        {selectedPlan
          ? <Link href={wizardHref(list, { step: 3, plan: planId })}
              className={buttonVariants({ variant: 'primary', size: 'md' })}>Continue to options</Link>
          : <Button type="button" variant="primary" size="md" disabled>Continue to options</Button>}
      </div>
    </section> : null}
    {effectiveStep === 3 ? <section data-wizard-step="3" className="space-y-4">
      {optionRows.length === 0
        ? <p className="text-sm text-[var(--midnight)]/70">This plan has no active billing options yet.</p>
        : <SelectionList selectionMode="single" rows={optionRows} total={optionRows.length}
            page={1} pageSize={PICKER_PAGE_SIZE} search=""
            selectedCount={0} {...inertListCallbacks}
            emptyLabel="No active billing options."
            onRowSelect={id => navigate(wizardHref(list, { step: 3, plan: planId,
              option: id }))}
            onChange={() => navigate(wizardHref(list, { step: 3, plan: planId }))} />}
      <MutationForm action={assignDispatch} className="space-y-3"><MutationContextInput />
        <input type="hidden" name="userIds" value={selectedKeepers.map(keeper => keeper.id).join(',')} />
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="planBillingOptionId" value={selectedOptionId} />
        <label className="grid max-w-xs gap-1 text-sm">Effective date
          <input name="effectiveAt" type="date" value={effectiveAt} suppressHydrationWarning
            onChange={event => onEffectiveAtChange(event.target.value)}
            className="rounded-xl border border-[var(--lavender-deep)] bg-[var(--input)] p-2" />
        </label>
        <div data-testid="wizard-summary"
          className="space-y-1 rounded-2xl border border-[var(--hover)] bg-[var(--card)] p-3.5 text-sm">
          <p><span className="font-semibold">Assigning:</span> {selectedPlan?.name ?? '—'}{selectedOption ? ` (${selectedOption.title})` : ''}</p>
          <p><span className="font-semibold">
            {`To ${selectedKeepers.length} keeper${selectedKeepers.length === 1 ? '' : 's'}`}:
          </span> {keeperNames || '—'}</p>
          <p><span className="font-semibold">Effective:</span> {effectiveAt ? effectiveAt.replace('T', ' ') : 'today'}</p>
          <p><span className="font-semibold">Execution:</span> one audited transaction, per-user row locks; each keeper&apos;s prior effective subscription is end-dated first; all-or-nothing.</p>
        </div>
        <p className="text-xs leading-relaxed opacity-60">
          One audited transaction with per-user row locks; each selected
          keeper&apos;s prior effective subscription is end-dated first.{' '}
          <b>All-or-nothing</b> — any ineligible keeper aborts the whole batch
          with a named error, never a partial assignment. The audit reason is
          derived — no input needed.
        </p>
        {assignResult?.error
          ? <p role="alert" className="text-sm text-[var(--rose)]">{assignResult.error}</p> : null}
        <div className="flex items-center justify-between gap-2">
          <Link href={wizardHref(list, { step: 2, plan: planId })}
            className={buttonVariants({ variant: 'soft', size: 'md' })}>Back to plan</Link>
          <Button type="submit" variant="primary" size="md"
            disabled={!selectedOption || selectedKeepers.length === 0 || !planId ||
              assignPending}>
            {assignPending ? 'Assigning…' : 'Assign plan'}</Button>
        </div>
      </MutationForm>
    </section> : null}
  </section>;
}

/** The keeper batch's client state owner (a Map of picks with display data —
 * exactly the accordions' selection-map pattern): selections persist across
 * picker pages and searches, the tray and counter follow, and the assign form
 * submits the COMPLETE batch. Also owns the effective date, the action state,
 * and the debounced search navigation. Steps and plan/option stay URL-owned. */
export type AssignPlanWizardProps = Omit<AssignPlanWizardViewProps, 'selectedKeepers' |
  'navigate' | 'navigateSearch' | 'userNarrowing' | 'planNarrowing' | 'effectiveAt' |
  'onEffectiveAtChange' | 'onToggleKeeper' | 'onSelectAllKeepers' | 'onSelectNoneKeepers' |
  'trayCollapsed' | 'onTrayCollapsedToggle' | 'assignDispatch' | 'assignResult' |
  'assignPending'> & {
  /** A Reassign deep link's keeper (`?user=<id>`), resolved server-side —
   * seeds the batch on mount and whenever the URL preselect changes. */
  prefilledKeepers: WizardUser[];
};

export function AssignPlanWizard({ prefilledKeepers, ...viewProps }: AssignPlanWizardProps) {
  const router = useRouter();
  // The effective date is prefilled with today (mockup parity, U5); lazy init
  // keeps today's date current when the wizard mounts.
  const [effectiveAt, setEffectiveAt] = useState(() => todayISO());
  // The keeper batch: id → display data, parent-owned so paging/searching
  // never loses a pick. A Reassign preselect seeds it.
  const [selection, setSelection] = useState<Map<string, { name: string; email: string }>>(
    () => new Map(prefilledKeepers.map(keeper =>
      [keeper.id, { name: keeper.name, email: keeper.email }])));
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const [assignResult, setAssignResult] = useState<AssignResult | undefined>();
  const [assignPending, setAssignPending] = useState(false);
  // One narrowing search per picker; only the mounted step's input ever types,
  // so at most one fetch pipeline is ever in flight.
  const userNarrowing = useNarrowing({ value: viewProps.userPicker.search,
    source: narrowViaEndpoint('users', viewProps.userPicker.pageSize) });
  const planNarrowing = useNarrowing({ value: viewProps.planPicker.search,
    source: narrowViaEndpoint('assignable-plans', viewProps.planPicker.pageSize) });
  // A Reassign link clicked while the wizard is already open swaps the batch
  // to the URL's preselect; navigating within the wizard (no `user` param)
  // never touches it.
  const latestPrefill = useRef(prefilledKeepers);
  useEffect(() => { latestPrefill.current = prefilledKeepers; });
  const prefillKey = prefilledKeepers.map(keeper => keeper.id).join(',');
  const lastPrefill = useRef(prefillKey);
  useEffect(() => {
    if (lastPrefill.current === prefillKey) return;
    lastPrefill.current = prefillKey;
    const seeded = latestPrefill.current;
    if (seeded.length > 0)
      setSelection(new Map(seeded.map(keeper =>
        [keeper.id, { name: keeper.name, email: keeper.email }])));
  }, [prefillKey]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = (href: string) => {
    if (searchTimer.current) { clearTimeout(searchTimer.current); searchTimer.current = null; }
    router.push(href);
  };
  const navigateSearch = (href: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      router.push(href);
    }, 250);
  };
  // A pending search navigation must not fire after the wizard unmounts.
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);
  // Toggling merges the row's display data into the batch (from the narrowed
  // rows while narrowed, else the committed picker rows) — a bare id never
  // enters the tray.
  const toggleKeeper = (id: string) => setSelection(previous => {
    const next = new Map(previous);
    if (next.delete(id)) return next;
    const row = (userNarrowing.narrowed ? userNarrowing.rows : viewProps.userPicker.rows)
      .find(candidate => candidate.id === id);
    next.set(id, { name: row?.title ?? id, email: row?.subtitle ?? '' });
    return next;
  });
  // S13c: Select all spans EVERY selectable keeper matching the active view
  // across ALL pages — one lean ids fetch on click (deleting accounts are
  // excluded server-side), merged into the same batch map as manual picks.
  const selectAllKeepers = () => {
    const query = userNarrowing.narrowed ? userNarrowing.query : viewProps.userPicker.search;
    return fetchSelectableRows('users', query).then(rows =>
      setSelection(previous => {
        const next = new Map(previous);
        for (const row of rows)
          next.set(row.id, { name: row.title, email: row.subtitle });
        return next;
      }));
  };
  const selectNoneKeepers = () => setSelection(new Map());
  const assignDispatch = (form: FormData) => {
    setAssignPending(true);
    void assignSubscriptionAction(form).then(result => {
      setAssignPending(false);
      if (result?.success) {
        // Post-assign reset (mockup): back to step 1 with the tray cleared;
        // the action's revalidatePath refreshes the list behind the wizard.
        setSelection(new Map());
        setAssignResult(undefined);
        router.push(wizardHref({ search: viewProps.listSearch, page: viewProps.listPage },
          { step: 1 }));
      } else {
        setAssignResult(result ?? { error:
          'The subscriptions were not assigned. Reload and check your administrator access.' });
      }
    }).catch(() => {
      setAssignPending(false);
      setAssignResult({ error:
        'The subscriptions were not assigned. Reload and check your administrator access.' });
    });
  };
  const selectedKeepers = [...selection].map(([id, entry]) =>
    ({ id, name: entry.name, email: entry.email }));
  return <AssignPlanWizardView {...viewProps} selectedKeepers={selectedKeepers}
    userNarrowing={userNarrowing} planNarrowing={planNarrowing}
    trayCollapsed={trayCollapsed}
    onTrayCollapsedToggle={() => setTrayCollapsed(collapsed => !collapsed)}
    onToggleKeeper={toggleKeeper} onSelectAllKeepers={selectAllKeepers}
    onSelectNoneKeepers={selectNoneKeepers}
    effectiveAt={effectiveAt} onEffectiveAtChange={setEffectiveAt}
    navigate={navigate} navigateSearch={navigateSearch}
    assignDispatch={assignDispatch} assignResult={assignResult}
    assignPending={assignPending} />;
}