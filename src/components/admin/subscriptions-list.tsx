'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LiveSearchInput, NarrowPager, useNarrowing, narrowViaEndpoint } from '@/components/admin/live-search';
import { badgeOnClass, badgeOffClass, counterChipClass } from '@/components/admin/list-shared';
import { buttonVariants, Button } from '@/components/ui/button';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { endSubscriptionAction } from '@/app/admin/subscriptions/actions';

const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const statusBadge: Record<string, { label: string; on: boolean }> = {
  ACTIVE: { label: 'Active', on: true },
  TRIALING: { label: 'Trialing', on: true },
  PAST_DUE: { label: 'Past due', on: false },
};
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (date: string | Date) =>
  (typeof date === 'string' ? date : date.toISOString()).slice(0, 10);
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean)
  .map(word => word.charAt(0)).join('').slice(0, 2).toUpperCase();

export type SubscriptionListRow = {
  id: string; userId: string; planId: string; planBillingOptionId: string;
  status: string; startedAt: string; renewsAt: string | null; expiresAt: string | null;
  userName: string | null; userEmail: string | null; planName: string | null;
  optionInterval: string | null; optionPriceCents: number | null;
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

export type SubscriptionsListProps = {
  rows: SubscriptionListRow[];
  /** Effective subscription count for the committed query. */
  total: number;
  search: string;
  page: number;
  pageSize: number;
  lastPage: number;
  wizardParams: WizardParams;
};

/** The current-subscriptions section (UX Task 8 ruling 1): typing in the list
 * search narrows the RENDERED LIST in real time over ALL effective rows
 * (headless narrowing, no dropdown) with a truthful live count and paging over
 * the matches; clearing the query restores the committed view. The URL-param
 * search stays available as the explicit Enter fallback (a soft push — plain
 * typing NEVER navigates); the committed view keeps every row action. */
export function SubscriptionsList({ rows, total, search, page, pageSize, lastPage,
  wizardParams }: SubscriptionsListProps) {
  const router = useRouter();
  const narrowing = useNarrowing({ value: search,
    source: narrowViaEndpoint('subscriptions', pageSize) });
  const live = narrowing.narrowed;
  return <section className="space-y-3" aria-label="Current subscriptions">
    <h3 className="font-semibold">Current subscriptions</h3>
    <div className="flex flex-wrap items-center gap-2" data-testid="subscriptions-toolbar">
      <LiveSearchInput id="subscriptions-search" label="Search by keeper, plan, or status"
        placeholder="Search by keeper, plan, or status…" value={narrowing.text}
        onType={narrowing.onType} onEscape={narrowing.onEscape}
        onEnter={text => router.push(subscriptionsHref(text, 1, wizardParams))}
        className="min-w-0 flex-1" />
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
        : rows.map(row => {
          const badge = statusBadge[row.status];
          const keeper = row.userName || row.userEmail || row.userId;
          return <div key={row.id} data-subscription-row={row.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-transparent px-3.5 py-3 transition-colors hover:bg-[var(--hover)]">
            <span aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--lavender)] text-sm font-bold text-[var(--midnight)]">
              {initialsOf(keeper)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{keeper}</span>
              {row.userEmail ? <span className="block truncate text-sm opacity-70">{row.userEmail}</span> : null}
            </span>
            <span className="text-sm">
              {row.planName ?? row.planId} · {row.optionInterval
                ? (intervalLabel[row.optionInterval] ?? row.optionInterval) : '—'}
              {row.optionPriceCents === null ? '' : ` — ${price(row.optionPriceCents)}`}
            </span>
            {badge
              ? <span className={badge.on ? badgeOnClass : badgeOffClass}>{badge.label}</span>
              : <span className={badgeOffClass}>{row.status}</span>}
            <span className="text-sm opacity-70">
              since {day(row.startedAt)} · {row.renewsAt ? `renews ${day(row.renewsAt)}`
                : row.expiresAt ? `ends ${day(row.expiresAt)}` : 'no renewal'}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              <Link href={subscriptionsHref(search, page,
                  { wizard: 'open', step: '2', user: row.userId })}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}>Reassign</Link>
              <MutationForm action={endSubscriptionAction} className="contents"><MutationContextInput />
                <input type="hidden" name="subscriptionId" value={row.id} />
                <Button type="submit" variant="ghost" size="sm">End</Button>
              </MutationForm>
            </span>
          </div>;
        })}
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
