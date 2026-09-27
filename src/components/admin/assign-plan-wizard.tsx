'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SelectionList } from '@/components/admin/selection-list';
import { counterChipClass } from '@/components/admin/list-shared';
import { LiveSearch, suggestViaEndpoint } from '@/components/admin/live-search';
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
export type PickerData = { rows: Array<{ id: string; title: string; subtitle?: string }>;
  total: number; page: number; pageSize: number; search: string };
export type AssignResult = { error?: string; success?: boolean };

/** The wizard's full state is URL-owned (`?wizard=open&step=…&user=…&plan=…&option=…`
 * plus per-picker `usearch/upage/psearch/ppage`), so it survives re-renders,
 * back/forward, and deep links. These builders always carry the current list
 * location so the subscriptions table never resets behind the wizard. */
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

const STEPS = [{ n: 1, label: 'User' }, { n: 2, label: 'Plan' }, { n: 3, label: 'Options' }];

/** SelectionList's type keeps `onToggle`/`onPageChange`/`onSearchChange`
 * required (multi mode's callbacks); single mode's focused view fires none of
 * them, so focused views pass this stable inert set. */
const inertListCallbacks = { onToggle: () => {}, onPageChange: () => {},
  onSearchChange: () => {} };

export type AssignPlanWizardViewProps = {
  /** Effective step (the server clamps it to what the URL state supports). */
  step: number;
  /** Current list location, carried through every wizard URL. */
  listSearch: string;
  listPage: number;
  selectedUser: WizardUser | null;
  selectedPlan: WizardPlan | null;
  selectedOptionId: string;
  /** Server-fed page for the user picker; empty rows when a keeper is already
   * selected (the focused view renders instead of the list). */
  userPicker: PickerData;
  planPicker: PickerData;
  effectiveAt: string;
  onEffectiveAtChange(value: string): void;
  navigate(href: string): void;
  /** Debounced navigation for search inputs (one round trip per typing pause). */
  navigateSearch(href: string): void;
  assignDispatch(form: FormData): void;
  assignResult?: AssignResult;
  assignPending?: boolean;
};

function Avatar({ label }: { label: string }) {
  return <span aria-hidden="true"
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-sm font-bold text-[var(--midnight)]">
    {initialsOf(label)}
  </span>;
}

/** Presentational body of the assignment wizard (hook-free; the default export
 * below owns the action state, router, and search debounce). */
export function AssignPlanWizardView({ step, listSearch, listPage, selectedUser,
  selectedPlan, selectedOptionId, userPicker, planPicker, effectiveAt, onEffectiveAtChange,
  navigate, navigateSearch, assignDispatch, assignResult, assignPending = false }:
  AssignPlanWizardViewProps) {
  // A successful assign folds the wizard immediately; the client wrapper then
  // clears the wizard URL state so the refreshed list takes over.
  if (assignResult?.success) return null;
  const list = { search: listSearch, page: listPage };
  const userId = selectedUser?.id ?? '';
  const planId = selectedPlan?.id ?? '';
  const optionRows = (selectedPlan?.billingOptions ?? []).filter(option => option.active)
    .map(option => ({ id: option.id,
      title: `${intervalLabel[option.interval] ?? option.interval} — ${price(option.basePriceCents)}`,
      subtitle: renewalLabel(option.interval), selected: option.id === selectedOptionId }));
  const selectedOption = optionRows.find(option => option.selected);
  return <section data-testid="assign-wizard" aria-label="Assign a plan"
    className="space-y-4 rounded-3xl border border-[var(--plum)]/15 bg-[var(--panel)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Assign a plan</h3>
      <Button type="button" variant="ghost" size="sm"
        onClick={() => navigate(subscriptionsHref(list))}>Cancel</Button>
    </div>
    <nav aria-label="Assignment steps" className="flex flex-wrap items-center gap-2">
      {STEPS.map(({ n, label }, index) => <span key={n} className="flex items-center gap-2">
        {index > 0 ? <span aria-hidden="true" className="text-sm opacity-40">→</span> : null}
        <span aria-current={step === n ? 'step' : undefined}
          className={cn('rounded-full px-3 py-1 text-xs font-semibold',
            step === n ? 'bg-[var(--plum)] text-[var(--on-accent)]'
              : step > n ? 'bg-[var(--lavender)] text-[var(--midnight)]'
              : 'bg-[var(--hover)] text-[var(--midnight)] opacity-55')}>
          {n} · {label}
        </span>
      </span>)}
    </nav>
    {step >= 2 && selectedUser ? <div data-testid="wizard-context"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar label={selectedUser.name || selectedUser.email} />
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--plum)]">Assigning to</span>
          <span className="block truncate font-medium">{selectedUser.name}</span>
          <span className="block truncate text-sm text-[var(--midnight)]/70">{selectedUser.email}</span>
        </span>
      </div>
      <Button type="button" variant="ghost" size="sm" aria-label="Change keeper"
        className="ml-auto" onClick={() => navigate(wizardHref(list, { step: 1 }))}>Change</Button>
    </div> : null}
    {step === 1 ? <section data-wizard-step="1" className="space-y-3">
      {selectedUser
        ? <SelectionList selectionMode="single" rows={[]} total={1} page={1} pageSize={1}
            search="" selectedCount={1} {...inertListCallbacks}
            selectedRows={[{ id: selectedUser.id, title: selectedUser.name,
              subtitle: selectedUser.email, selected: true }]}
            onChange={() => navigate(wizardHref(list, { step: 1,
              usearch: userPicker.search, upage: userPicker.page }))} />
        : <LiveSearch mode="headless" id="wizard-user-search"
            label="Search keepers by name or email"
            placeholder="Search keepers by name or email…" value={userPicker.search}
            source={suggestViaEndpoint('users')}
            toolbarEnd={<span className={counterChipClass} data-testid="picker-count">
              {`${userPicker.total} keeper${userPicker.total === 1 ? '' : 's'}`}
            </span>}
            renderSuggestions={(suggestions, query, loading) => {
              // A query equal to the committed URL search is the base list's
              // own filter — only a genuinely typed query renders live matches.
              const live = !loading && query.trim() !== '' && query !== userPicker.search;
              return <SelectionList selectionMode="single" toolbar={false}
                rows={live ? suggestions : userPicker.rows}
                total={live ? suggestions.length : userPicker.total}
                page={live ? 1 : userPicker.page} pageSize={userPicker.pageSize}
                search="" selectedCount={0} {...inertListCallbacks}
                emptyLabel="No keepers match this search."
                onRowSelect={id => navigate(wizardHref(list, { step: 1, user: id,
                  usearch: userPicker.search, upage: userPicker.page }))}
                onPageChange={page => navigate(wizardHref(list, { step: 1,
                  usearch: userPicker.search, upage: page }))} />;
            }}
            onFallbackSubmit={text => navigateSearch(wizardHref(list, { step: 1,
              usearch: text, upage: 1 }))} />}
      <div className="flex items-center justify-end gap-2">
        {selectedUser
          ? <Link href={wizardHref(list, { step: 2, user: selectedUser.id })}
              className={buttonVariants({ variant: 'primary', size: 'md' })}>Continue to plan</Link>
          : <Button type="button" variant="primary" size="md" disabled>Continue to plan</Button>}
      </div>
    </section> : null}
    {step === 2 ? <section data-wizard-step="2" className="space-y-3">
      {selectedPlan
        ? <SelectionList selectionMode="single" rows={[]} total={1} page={1} pageSize={1}
            search="" selectedCount={1} {...inertListCallbacks}
            selectedRows={[{ id: selectedPlan.id, title: selectedPlan.name,
              subtitle: `${typeLabel[selectedPlan.planType] ?? selectedPlan.planType} · ${
                selectedPlan.billingOptions.filter(option => option.active).length} active billing option(s)`,
              selected: true }]}
            onChange={() => navigate(wizardHref(list, { step: 2, user: userId,
              psearch: planPicker.search, ppage: planPicker.page }))} />
        : <LiveSearch mode="headless" id="wizard-plan-search"
            label="Search plans by name"
            placeholder="Search plans by name…" value={planPicker.search}
            source={suggestViaEndpoint('assignable-plans')}
            toolbarEnd={<span className={counterChipClass} data-testid="picker-count">
              {`${planPicker.total} plan${planPicker.total === 1 ? '' : 's'}`}
            </span>}
            renderSuggestions={(suggestions, query, loading) => {
              const live = !loading && query.trim() !== '' && query !== planPicker.search;
              return <SelectionList selectionMode="single" toolbar={false}
                rows={live ? suggestions : planPicker.rows}
                total={live ? suggestions.length : planPicker.total}
                page={live ? 1 : planPicker.page} pageSize={planPicker.pageSize}
                search="" selectedCount={0} {...inertListCallbacks}
                emptyLabel="No active plans match this search."
                onRowSelect={id => navigate(wizardHref(list, { step: 2, user: userId, plan: id,
                  psearch: planPicker.search, ppage: planPicker.page }))}
                onPageChange={page => navigate(wizardHref(list, { step: 2, user: userId,
                  psearch: planPicker.search, ppage: page }))} />;
            }}
            onFallbackSubmit={text => navigateSearch(wizardHref(list, { step: 2, user: userId,
              psearch: text, ppage: 1 }))} />}
      <div className="flex items-center justify-between gap-2">
        <Link href={wizardHref(list, { step: 1, user: userId })}
          className={buttonVariants({ variant: 'soft', size: 'md' })}>Back to user</Link>
        {selectedPlan
          ? <Link href={wizardHref(list, { step: 3, user: userId, plan: planId })}
              className={buttonVariants({ variant: 'primary', size: 'md' })}>Continue to options</Link>
          : <Button type="button" variant="primary" size="md" disabled>Continue to options</Button>}
      </div>
    </section> : null}
    {step === 3 ? <section data-wizard-step="3" className="space-y-4">
      {optionRows.length === 0
        ? <p className="text-sm text-[var(--midnight)]/70">This plan has no active billing options yet.</p>
        : <SelectionList selectionMode="single" rows={optionRows} total={optionRows.length}
            page={1} pageSize={Math.max(1, optionRows.length)} search=""
            selectedCount={0} {...inertListCallbacks}
            emptyLabel="No active billing options."
            onRowSelect={id => navigate(wizardHref(list, { step: 3, user: userId, plan: planId,
              option: id }))}
            onChange={() => navigate(wizardHref(list, { step: 3, user: userId, plan: planId }))} />}
      <MutationForm action={assignDispatch} className="space-y-3"><MutationContextInput />
        <input type="hidden" name="userQuery" value={userId} />
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="planBillingOptionId" value={selectedOptionId} />
        <label className="grid max-w-xs gap-1 text-sm">Effective date (defaults to now when left empty)
          <input name="effectiveAt" type="datetime-local" value={effectiveAt}
            onChange={event => onEffectiveAtChange(event.target.value)}
            className="rounded-xl border border-[var(--plum)]/25 p-2" />
        </label>
        <div data-testid="wizard-summary"
          className="space-y-1 rounded-2xl border border-[var(--hover)] bg-[var(--card)] p-3.5 text-sm">
          <p><span className="font-semibold">Assigning:</span> {selectedPlan?.name ?? '—'}{selectedOption ? ` (${selectedOption.title})` : ''}</p>
          <p><span className="font-semibold">To:</span> {selectedUser ? `${selectedUser.name} (${selectedUser.email})` : '—'}</p>
          <p><span className="font-semibold">Effective:</span> {effectiveAt ? effectiveAt.replace('T', ' ') : 'now — leave the field empty to assign immediately'}</p>
          <p><span className="font-semibold">Execution:</span> one audited, row-locked transaction; the keeper&apos;s prior effective subscription is end-dated first.</p>
        </div>
        {assignResult?.error
          ? <p role="alert" className="text-sm text-rose-700">{assignResult.error}</p> : null}
        <div className="flex items-center justify-between gap-2">
          <Link href={wizardHref(list, { step: 2, user: userId, plan: planId })}
            className={buttonVariants({ variant: 'soft', size: 'md' })}>Back to plan</Link>
          <Button type="submit" variant="primary" size="md"
            disabled={!selectedOption || !userId || !planId || assignPending}>
            {assignPending ? 'Assigning…' : 'Assign plan'}</Button>
        </div>
      </MutationForm>
    </section> : null}
  </section>;
}

/** Client owner of the wizard's non-URL state: the assign action's result and
 * the effective-date field. Selections and steps stay URL-owned; search
 * navigation is debounced so typing never fires a round trip per keystroke. */
export function AssignPlanWizard(props: Omit<AssignPlanWizardViewProps, 'navigate' |
  'navigateSearch' | 'effectiveAt' | 'onEffectiveAtChange' | 'assignDispatch' |
  'assignResult' | 'assignPending'>) {
  const router = useRouter();
  const [effectiveAt, setEffectiveAt] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [assignResult, assignDispatch, assignPending] = useActionState(
    async (_previous: AssignResult | undefined, form: FormData): Promise<AssignResult> =>
      assignSubscriptionAction(form),
    undefined,
  );
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
  // Success folds the wizard and clears its URL state; the action's
  // revalidatePath refresh then shows the new row in the list below.
  useEffect(() => {
    if (assignResult?.success)
      router.push(subscriptionsHref({ search: props.listSearch, page: props.listPage }));
  }, [assignResult, router, props.listSearch, props.listPage]);
  return <AssignPlanWizardView {...props} effectiveAt={effectiveAt}
    onEffectiveAtChange={setEffectiveAt} navigate={navigate} navigateSearch={navigateSearch}
    assignDispatch={assignDispatch} assignResult={assignResult} assignPending={assignPending} />;
}