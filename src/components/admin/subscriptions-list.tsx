'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LiveSearchInput, NarrowPager, useNarrowing, narrowViaEndpoint } from '@/components/admin/live-search';
import { badgeOnClass, badgeOffClass, badgeGoldDashedClass, counterChipClass,
  searchHiddenFor } from '@/components/admin/list-shared';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { endSubscriptionAction, editSubscriptionAction } from '@/app/admin/subscriptions/actions';

const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const statusBadge: Record<string, { label: string; on: boolean }> = {
  ACTIVE: { label: 'Active', on: true },
  TRIALING: { label: 'Trialing', on: true },
  PAST_DUE: { label: 'Past due', on: false },
};
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (date: string | Date) =>
  (typeof date === 'string' ? date : date.toISOString()).slice(0, 10);
const tierLabel = (tier: string) => tier.charAt(0).toUpperCase() + tier.slice(1);
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean)
  .map(word => word.charAt(0)).join('').slice(0, 2).toUpperCase();

export type SubscriptionListRow = {
  id: string; userId: string; planId: string; planBillingOptionId: string;
  status: string; startedAt: string; renewsAt: string | null; expiresAt: string | null;
  userName: string | null; userEmail: string | null; planName: string | null;
  optionInterval: string | null; optionPriceCents: number | null;
  /** 'subscription' = a stored row; 'tier' = a resolver-derived virtual row
   * (expandable with a view-only detail card — no End/Reassign/Edit, no
   * dates, gold-dashed badge; one action: Convert to real subscription). */
  source: 'subscription' | 'tier';
  tierKey: string | null;
  /** The row's plan's ACTIVE billing options — the in-place edit form's
   * choices; empty for tier-derived rows (Task 13: a virtual row converts via
   * the wizard instead — its plan is picked in the wizard, not here). */
  planOptions: Array<{ id: string; interval: string; basePriceCents: number; active: boolean }>;
};

type WizardParams = Record<string, string>;

/** URL for the subscriptions list; wizard params (when open) ride along so the
 * in-progress assignment survives list navigation. */
const subscriptionsHref = (search: string, page: number, wizard: WizardParams = {}) => {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page > 1) params.set('page', String(page));
  for (const [key, value] of Object.entries(wizard)) if (value) params.set(key, value);
  const query = params.toString();
  return `/admin/subscriptions${query ? `?${query}` : ''}`;
};

const editorFieldClass = 'rounded-xl border p-2';

/** S13b-style in-place editor (Task 11 ruling 1): Edit turns the expanded
 * row's detail into these fields — billing option + effective date; saving
 * supersedes the subscription via the audited assignment service. */
function SubscriptionEditor({ row, onCancelEdit }: {
  row: SubscriptionListRow;
  onCancelEdit(): void;
}) {
  const currentOptionActive = row.planOptions
    .some(option => option.id === row.planBillingOptionId);
  return <MutationForm action={editSubscriptionAction} className="grid max-w-md gap-3 pt-1">
    <MutationContextInput />
    <input type="hidden" name="subscriptionId" value={row.id} />
    <label className="grid gap-1">Billing option
      <select name="planBillingOptionId"
        defaultValue={currentOptionActive ? row.planBillingOptionId : row.planOptions[0]?.id}
        className={editorFieldClass}>
        {row.planOptions.map(option => <option key={option.id} value={option.id}>
          {(intervalLabel[option.interval] ?? option.interval)} — {price(option.basePriceCents)}
        </option>)}
      </select></label>
    <label className="grid gap-1">Effective date
      <input name="effectiveAt" type="date" suppressHydrationWarning
        className={editorFieldClass} /></label>
    <p className="text-[12.5px] opacity-70">Saving supersedes this subscription: the prior row
      is end-dated as of the effective date and a new ACTIVE row starts. Empty date = today.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="soft" size="sm" onClick={onCancelEdit}>Cancel</Button>
      <Button type="submit" variant="primary" size="sm">Save changes</Button>
    </div>
  </MutationForm>;
}

/** The expanded row's detail card (Task 11 ruling 1): the stored row's facts,
 * then the action row — Edit (in-place), Reassign (wizard preselect), End. */
function SubscriptionDetail({ row, reassignHref, editing, onStartEdit, onCancelEdit }: {
  row: SubscriptionListRow;
  reassignHref: string;
  editing: boolean;
  onStartEdit(): void;
  onCancelEdit(): void;
}) {
  return <div className="space-y-2.5 px-3.5 pb-3.5 pt-1">
    <div data-detail-card className="rounded-2xl border border-[var(--hover)] bg-[var(--background)] p-3.5">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--plum)]">Subscription</h3>
      <dl data-kv-grid className="grid grid-cols-[minmax(110px,130px)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="font-semibold opacity-60">Keeper</dt>
        <dd className="min-w-0">{row.userName ?? row.userId}{row.userEmail
          ? <span className="block text-[12.5px] opacity-70">{row.userEmail}</span> : null}</dd>
        <dt className="font-semibold opacity-60">Plan</dt>
        <dd>{row.planName ?? row.planId}</dd>
        <dt className="font-semibold opacity-60">Billing</dt>
        <dd>{row.optionInterval ? (intervalLabel[row.optionInterval] ?? row.optionInterval) : '—'}
          {row.optionPriceCents === null ? '' : ` — ${price(row.optionPriceCents)}`}</dd>
        <dt className="font-semibold opacity-60">Status</dt>
        <dd>{statusBadge[row.status]?.label ?? row.status}</dd>
        <dt className="font-semibold opacity-60">Started</dt>
        <dd>{day(row.startedAt)}</dd>
        <dt className="font-semibold opacity-60">Renewal</dt>
        <dd>{row.renewsAt ? `Renews ${day(row.renewsAt)}`
          : row.expiresAt ? `Ends ${day(row.expiresAt)}` : 'No renewal'}</dd>
      </dl>
    </div>
    <div className="flex flex-wrap gap-2 pt-1">
      {row.planOptions.length > 0
        ? <Button type="button" variant="primary" size="sm" onClick={onStartEdit}>Edit</Button>
        : <span className="text-sm opacity-70">This plan has no active billing options to
            {' '}switch to.</span>}
      <Link href={reassignHref}
        className={buttonVariants({ variant: 'soft', size: 'sm' })}>Reassign</Link>
      <MutationForm action={endSubscriptionAction} className="contents"><MutationContextInput />
        <input type="hidden" name="subscriptionId" value={row.id} />
        <Button type="submit" variant="soft" size="sm">End</Button>
      </MutationForm>
    </div>
    {editing && row.planOptions.length > 0
      ? <SubscriptionEditor row={row} onCancelEdit={onCancelEdit} />
      : null}
  </div>;
}

/** A tier-derived row's expanded detail card (Task 13): VIEW-ONLY — keeper,
 * tier, mapped legacy plan name; no dates, no stored-row actions. The single
 * action is Convert to real subscription: the audited assign wizard seeded
 * with the keeper preselected via the Reassign deep-link pattern (the `user`
 * param rides the URL; the wizard's batch seeds from it on mount). */
function VirtualSubscriptionDetail({ row, convertHref }: {
  row: SubscriptionListRow;
  convertHref: string;
}) {
  return <div className="space-y-2.5 px-3.5 pb-3.5 pt-1">
    <div data-detail-card className="rounded-2xl border border-[var(--hover)] bg-[var(--background)] p-3.5">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--plum)]">Legacy tier</h3>
      <dl data-kv-grid className="grid grid-cols-[minmax(110px,130px)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="font-semibold opacity-60">Keeper</dt>
        <dd className="min-w-0">{row.userName ?? row.userId}{row.userEmail
          ? <span className="block text-[12.5px] opacity-70">{row.userEmail}</span> : null}</dd>
        <dt className="font-semibold opacity-60">Tier</dt>
        <dd>{row.tierKey ? tierLabel(row.tierKey) : '—'}</dd>
        <dt className="font-semibold opacity-60">Legacy plan</dt>
        <dd>{row.planName ?? row.planId}</dd>
      </dl>
    </div>
    <div className="flex flex-wrap gap-2 pt-1">
      <Link href={convertHref}
        className={buttonVariants({ variant: 'primary', size: 'sm' })}>Convert to real subscription</Link>
    </div>
  </div>;
}

/** One committed row (Task 11 ruling 1; Task 13 amendment): collapsed it
 * reads like the mockup's list line; expanding it reveals the detail card.
 * A stored row's card carries Edit (in-place), Reassign (wizard preselect),
 * and End; a tier-derived row's card is view-only with the gold-dashed
 * marker retained and exactly ONE action — Convert to real subscription
 * (it is derived, not stored — it has no dates and nothing to edit/end). */
function SubscriptionRow({ row, reassignHref, expanded, onToggleExpand, editing,
  onStartEdit, onCancelEdit }: {
    row: SubscriptionListRow;
    /** The wizard URL seeding the keeper preselect (`?user=<id>`, with the
     * list's search/page riding along) — Reassign for a stored row, Convert
     * for a tier-derived one. */
    reassignHref: string;
    expanded: boolean;
    onToggleExpand(): void;
    editing: boolean;
    onStartEdit(): void;
    onCancelEdit(): void;
  }) {
  const derived = row.source === 'tier';
  const badge = statusBadge[row.status];
  const keeper = row.userName || row.userEmail || row.userId;
  const body = <>
    <span aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-sm font-bold text-[var(--midnight)]">
      {initialsOf(keeper)}
    </span>
    <span className="min-w-0">
      <span className="block truncate font-semibold">{keeper}</span>
      {row.userEmail ? <span className="block truncate text-sm opacity-70">{row.userEmail}</span> : null}
    </span>
    <span className="text-sm">
      {row.planName ?? row.planId}{derived ? '' : row.optionInterval
        ? ` · ${(intervalLabel[row.optionInterval] ?? row.optionInterval)}` : ' · —'}
      {!derived && row.optionPriceCents !== null ? ` — ${price(row.optionPriceCents)}` : ''}
    </span>
    {derived
      ? <span className={badgeGoldDashedClass}>Legacy — derived</span>
      : badge
        ? <span className={badge.on ? badgeOnClass : badgeOffClass}>{badge.label}</span>
        : <span className={badgeOffClass}>{row.status}</span>}
    {!derived
      ? <span className="text-sm opacity-70">
          since {day(row.startedAt)} · {row.renewsAt ? `renews ${day(row.renewsAt)}`
            : row.expiresAt ? `ends ${day(row.expiresAt)}` : 'no renewal'}
        </span>
      : null}
  </>;
  if (derived)
    return <div data-subscription-row={row.id} data-legacy-derived="true"
      className={cn('rounded-2xl border', expanded
        ? 'border-[var(--plum)]/20 bg-[var(--card)]'
        : 'border-transparent')}>
      <button type="button" onClick={onToggleExpand} aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-[var(--hover)]">
        <ChevronDown aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 text-[var(--plum)] transition-transform',
            expanded && 'rotate-180')} />
        {body}
      </button>
      {expanded
        ? <VirtualSubscriptionDetail row={row} convertHref={reassignHref} />
        : null}
    </div>;
  return <div data-subscription-row={row.id}
    className={cn('rounded-2xl border', expanded
      ? 'border-[var(--plum)]/20 bg-[var(--card)]'
      : 'border-transparent')}>
    <button type="button" onClick={onToggleExpand} aria-expanded={expanded}
      className="flex w-full flex-wrap items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-[var(--hover)]">
      <ChevronDown aria-hidden="true"
        className={cn('h-4 w-4 shrink-0 text-[var(--plum)] transition-transform',
          expanded && 'rotate-180')} />
      {body}
    </button>
    {expanded
      ? <SubscriptionDetail row={row} reassignHref={reassignHref} editing={editing}
          onStartEdit={onStartEdit} onCancelEdit={onCancelEdit} />
      : null}
  </div>;
}

export type SubscriptionsListViewProps = {
  rows: SubscriptionListRow[];
  /** Effective subscription count for the committed query. */
  total: number;
  search: string;
  page: number;
  pageSize: number;
  lastPage: number;
  wizardParams: WizardParams;
  /** Task 11: client-owned single-open expansion and in-place edit state
   * (editing never navigates). */
  expandedId: string;
  onToggleExpand(id: string): void;
  editingId: string;
  onStartEdit(id: string): void;
  onCancelEdit(): void;
};

/** Presentational body of the current-subscriptions section (UX Task 8 ruling
 * 1 + Task 11 ruling 1): typing in the list search narrows the RENDERED LIST
 * in real time over ALL effective rows (headless narrowing, no dropdown) with
 * a truthful live count and paging over the matches; clearing the query
 * restores the committed view. The URL-param search stays available as the
 * explicit Enter fallback (a soft push — plain typing NEVER navigates); the
 * committed view keeps every row action behind its expand toggle. */
export function SubscriptionsListView({ rows, total, search, page, pageSize, lastPage,
  wizardParams, expandedId, onToggleExpand, editingId, onStartEdit,
  onCancelEdit }: SubscriptionsListViewProps) {
  const router = useRouter();
  const narrowing = useNarrowing({ value: search,
    source: narrowViaEndpoint('subscriptions', pageSize) });
  const live = narrowing.narrowed;
  return <section className="space-y-3" aria-label="Current subscriptions">
    <h3 className="font-semibold">Current subscriptions</h3>
    <div className="flex flex-wrap items-center gap-2" data-testid="subscriptions-toolbar">
      {/* S13d: the committed list holds less than a page → no search input;
          the count chip and a committed search's Clear stay (hiding only stops
          rendering — it never clears a committed search). */}
      {!searchHiddenFor(total, pageSize) ? <LiveSearchInput id="subscriptions-search" label="Search by keeper, plan, or status"
        placeholder="Search by keeper, plan, or status…" value={narrowing.text}
        onType={narrowing.onType} onEscape={narrowing.onEscape}
        onEnter={text => router.push(subscriptionsHref(text, 1, wizardParams))}
        className="min-w-0 flex-1" /> : null}
      <span className={counterChipClass} data-testid="effective-count">
        {`${live ? narrowing.total : total} effective`}
      </span>
      {search && !live
        ? <Link href={subscriptionsHref('', 1, wizardParams)}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Clear</Link>
        : null}
    </div>
    {live ? <div data-testid="narrowed-subscriptions" className="space-y-1">
      {narrowing.rows.length === 0
        ? <p className="py-3 text-sm text-[var(--midnight)]/70">
            {narrowing.loading ? 'Searching…' : <>Nothing matches “{narrowing.query}”.</>}
          </p>
        : narrowing.rows.map(row => {
          const keeper = row.title;
          return <div key={row.id} data-subscription-row={row.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-transparent px-3.5 py-3 transition-colors hover:bg-[var(--hover)]">
            <span aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-sm font-bold text-[var(--midnight)]">
              {initialsOf(keeper)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{keeper}</span>
              {row.subtitle ? <span className="block truncate text-sm opacity-70">{row.subtitle}</span> : null}
            </span>
          </div>;
        })}
      <NarrowPager page={narrowing.page} total={narrowing.total} pageSize={pageSize}
        onPageChange={narrowing.onPageChange} label="narrowed subscriptions" />
    </div> : <>
      {rows.length === 0
        ? <p>{total === 0 && search
            ? 'No subscriptions match this search.'
            : 'No effective subscriptions yet. Use ＋ Add subscription above.'}</p>
        : rows.map(row => <SubscriptionRow key={row.id} row={row}
            reassignHref={subscriptionsHref(search, page,
              { wizard: 'open', step: '2', user: row.userId })}
            expanded={expandedId === row.id}
            onToggleExpand={() => onToggleExpand(row.id)}
            editing={editingId === row.id}
            onStartEdit={() => onStartEdit(row.id)}
            onCancelEdit={onCancelEdit} />)}
      <nav className="flex items-center gap-3" aria-label="Subscriptions pagination">
        {page <= 1
          ? <Button type="button" disabled variant="secondary" size="sm">Previous</Button>
          : <Link href={subscriptionsHref(search, page - 1, wizardParams)}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Previous</Link>}
        <span>Page {page} of {lastPage}</span>
        {page >= lastPage
          ? <Button type="button" disabled variant="secondary" size="sm">Next</Button>
          : <Link href={subscriptionsHref(search, page + 1, wizardParams)}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Next</Link>}
      </nav>
    </>}
  </section>;
}

/** Client owner of the expansion and in-place edit state; the view above owns
 * everything else. (Same view/state split as the plans accordion.) */
export function SubscriptionsList(props: Omit<SubscriptionsListViewProps,
  'expandedId' | 'onToggleExpand' | 'editingId' | 'onStartEdit' | 'onCancelEdit'>) {
  const [expandedId, setExpandedId] = useState('');
  const [editingId, setEditingId] = useState('');
  return <SubscriptionsListView {...props}
    expandedId={expandedId}
    onToggleExpand={id => setExpandedId(current => (current === id ? '' : id))}
    editingId={editingId}
    onStartEdit={id => setEditingId(id)}
    onCancelEdit={() => setEditingId('')} />;
}