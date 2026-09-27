'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlanSummary } from '@/lib/admin/plans';
import { FEATURE_REGISTRY } from '@/lib/features/registry';
import { buttonVariants, Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { counterChipClass, badgeTintClass, badgeOnClass, badgeOffClass } from '@/components/admin/list-shared';
import { LiveSearchInput, NarrowPager, useNarrowing, narrowViaEndpoint,
  type Narrowing } from '@/components/admin/live-search';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { SelectionTray, type SelectionTrayItem } from '@/components/admin/selection-tray';
import { bulkSetPlanFlagsAction, deletePlanAction, duplicatePlanAction,
  reorderPlanAction } from '@/app/admin/plans/actions';

const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom', INTERNAL: 'Internal' };

/** Row toggles preserve search/page; pager links drop `open` (paging folds the accordion). */
const listHref = (search: string, page: number, open?: string) =>
  `/admin/plans?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page),
    ...(open ? { open } : {}) })}`;

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

function PlanDetail({ plan, index }: { plan: PlanSummary; index: number }) {
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
      { label: 'Last updated', value: plan.updatedAt.toISOString().slice(0, 10) },
    ]} />
    <div className="flex flex-wrap gap-2 pt-1">
      <Link href={`/admin/plans/${plan.id}/edit`} className={buttonVariants({ variant: 'primary', size: 'md' })}>Edit plan</Link>
      <MutationForm action={duplicatePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <Button variant="secondary" size="sm">Duplicate</Button>
      </MutationForm>
      <MutationForm action={deletePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <Button variant="danger" size="sm">Delete or deactivate</Button>
      </MutationForm>
      <MutationForm action={reorderPlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="direction" value={index === 0 ? 'down' : 'up'} />
        <Button variant="ghost" size="sm">Move {index === 0 ? 'down' : 'up'}</Button>
      </MutationForm>
    </div>
  </div>;
}

const FEATURE_COUNT = FEATURE_REGISTRY.length;

/** Presentational body of the plans accordion. Typing narrows the RENDERED
 * LIST in real time (headless narrowing — matches span all rows, server-fed);
 * the counter stays in the mockup's "N of M selected" format, truthful during
 * narrowing. The toolbar pairs the live search with the gold counter chip,
 * mockup-exact. */
export function PlansAccordionView({ plans, total, search, page, pageSize, openId,
  selectedItems, onToggleSelected, onPick, trayCollapsed, onToggleTrayCollapsed,
  onSearchSubmit, narrowing }: PlansAccordionViewProps) {
  const selected = new Set(selectedItems.map(item => item.id));
  const narrowed = narrowing.narrowed;
  const counterTotal = narrowed ? narrowing.total : total;
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return <>
    <div data-testid="plans-toolbar" className="flex flex-wrap items-center gap-2">
      <LiveSearchInput id="plans-search" label="Search plans by name"
        placeholder="Search plans by name…" value={narrowing.text}
        onType={narrowing.onType} onEscape={narrowing.onEscape}
        onEnter={onSearchSubmit} className="min-w-0 flex-1" />
      <span className={counterChipClass} data-testid="selected-count">
        {`${selectedItems.length} of ${counterTotal} selected`}
      </span>
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
        : narrowing.rows.map(row =>
          <div key={row.id} data-row-id={row.id}
            className="flex items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:bg-[var(--hover)]">
            <input type="checkbox" checked={selected.has(row.id)}
              onChange={() => onPick(row)}
              aria-label={`Select ${row.title}`}
              className="h-4 w-4 shrink-0 accent-[var(--plum)]" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{row.title}</span>
              {row.subtitle
                ? <span className="block truncate text-[11.5px] opacity-55">{row.subtitle}</span>
                : null}
            </span>
          </div>)}
      <NarrowPager page={narrowing.page} total={narrowing.total} pageSize={pageSize}
        onPageChange={narrowing.onPageChange} label="narrowed plans" />
    </div> : <>
      {plans.map((plan, index) => {
        const isOpen = plan.id === openId;
        return <div key={plan.id} data-row-id={plan.id}
          className={cn('rounded-2xl border', isOpen
            ? 'border-[var(--plum)]/20 bg-[var(--card)]'
            : 'border-transparent')}>
          <div className={cn('flex items-start gap-3 rounded-2xl px-3.5 py-3',
            !isOpen && 'hover:bg-[var(--hover)]')}>
            <input type="checkbox" checked={selected.has(plan.id)} onChange={() => onToggleSelected(plan.id)}
              aria-label={`Select ${plan.name}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--plum)]" />
            {/* Row toggle: a real link keeps Tab/Enter keyboard operability, and the
                single-open state lives in the URL so back/forward and deep links work. */}
            <Link href={isOpen ? listHref(search, page) : listHref(search, page, plan.id)}
              className="flex flex-1 flex-wrap items-center gap-3" aria-expanded={isOpen}>
              <ChevronDown aria-hidden="true"
                className={cn('h-5 w-5 shrink-0 text-[var(--plum)] transition-transform', isOpen && 'rotate-180')} />
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
                {' '}{plan.enabledFeatureCount} features · {plan.subscriptionCount} subscriber{plan.subscriptionCount === 1 ? '' : 's'} ·
                {' '}updated {plan.updatedAt.toISOString().slice(0, 10)}
              </span>
            </Link>
          </div>
          {isOpen ? <PlanDetail plan={plan} index={index} /> : null}
        </div>;
      })}
      {plans.length === 0
        ? <p className="text-sm text-[var(--midnight)]/70">
            {search ? <>Nothing matches “{search}”.</> : 'No plans yet.'}
          </p>
        : null}
      <nav className="mt-4 flex items-center gap-3 border-t border-[var(--hover)] pt-3.5"
        aria-label="Plans pagination">
        {page <= 1
          ? <Button type="button" disabled variant="secondary" size="sm">Previous</Button>
          : <Link href={listHref(search, page - 1)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Previous</Link>}
        <span>Page {page} of {lastPage}</span>
        {page >= lastPage
          ? <Button type="button" disabled variant="secondary" size="sm">Next</Button>
          : <Link href={listHref(search, page + 1)} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>Next</Link>}
      </nav>
    </>}
  </>;
}

/** Client owner of the selection state: an id→{title,subtitle} map that grows
 * as boxes are checked and is never pruned by pagination or search, so
 * selections and the tray survive page changes, new searches, and re-renders.
 * Plain typing in the live search never navigates; the explicit fallback
 * (Enter with the typed filter) is the sole navigation. */
export function PlansAccordion(props: Omit<PlansAccordionViewProps,
  'selectedItems' | 'onToggleSelected' | 'onPick' | 'trayCollapsed' |
  'onToggleTrayCollapsed' | 'onSearchSubmit' | 'narrowing'>) {
  const router = useRouter();
  const [selection, setSelection] = useState<Map<string, { title: string; subtitle: string }>>(new Map());
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  const narrowing = useNarrowing({ value: props.search,
    source: narrowViaEndpoint('plans', props.pageSize) });
  const rowOf = (id: string) => props.plans.find(plan => plan.id === id);
  return <PlansAccordionView {...props} narrowing={narrowing}
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
    onSearchSubmit={search => router.push(listHref(search, 1))} />;
}
