'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PlanSummary } from '@/lib/admin/plans';
import { FEATURE_REGISTRY } from '@/lib/features/registry';
import { buttonVariants, Button } from '@/components/ui/button';
import { cardClassName } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
  openId: string;
  /** The FULL selection as id→title pairs — includes plans on other pages or
   * hidden by the current search. Never derived from the rendered rows. */
  selectedItems: SelectionTrayItem[];
  onToggleSelected(id: string): void;
  trayCollapsed: boolean;
  onToggleTrayCollapsed(): void;
};

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className={cn(cardClassName, 'space-y-2 p-4')}>
    <h3 className="text-sm font-semibold text-[var(--plum)]">{title}</h3>
    {children}
  </div>;
}

function PlanDetail({ plan, index }: { plan: PlanSummary; index: number }) {
  return <div className="space-y-3 border-t border-[var(--plum)]/10 p-4 pt-4">
    <div className="grid gap-3 md:grid-cols-3">
      <DetailCard title="Identity">
        <p>Type: {typeLabel[plan.planType] ?? plan.planType}</p>
        <p>Active: {plan.active ? 'Yes' : 'No'}</p>
        <p>Public: {plan.public
          ? 'Yes — appears on public pricing (future phase)'
          : 'No — assignable only'}</p>
        <p>Spood allowance: {plan.maxSpiders === null ? 'Unlimited' : plan.maxSpiders}</p>
        {plan.description ? <p>{plan.description}</p> : null}
      </DetailCard>
      <DetailCard title="Billing options">
        {plan.billingOptions.length === 0
          ? <p>None</p>
          : plan.billingOptions.map(option => <p key={option.id}>
              {option.interval} ${(option.basePriceCents / 100).toFixed(2)}{option.active ? '' : ' (inactive)'}
            </p>)}
      </DetailCard>
      <DetailCard title="Usage">
        <p>Enabled features: {plan.enabledFeatureCount} of {FEATURE_COUNT}</p>
        <p>Effective subscriptions: {plan.subscriptionCount}</p>
        <p>Last updated: {plan.updatedAt.toISOString().slice(0, 10)}</p>
      </DetailCard>
    </div>
    <div className="flex flex-wrap gap-3">
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

/** Presentational body of the plans accordion (hook-free; the default export
 * below owns the selection/collapse state). */
export function PlansAccordionView({ plans, total, search, page, openId, selectedItems,
  onToggleSelected, trayCollapsed, onToggleTrayCollapsed }: PlansAccordionViewProps) {
  const selected = new Set(selectedItems.map(item => item.id));
  return <>
    <p className="text-sm">
      {selectedItems.length > 0
        ? <span className="rounded-full bg-[var(--gold)] px-3 py-1 text-xs font-semibold text-[var(--panel)]">
            {`${selectedItems.length} of ${total} selected`}
          </span>
        : <span>{`${total} plan${total === 1 ? '' : 's'}${search ? ' matching the search' : ''}`}</span>}
    </p>
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
    {plans.map((plan, index) => {
      const isOpen = plan.id === openId;
      return <div key={plan.id} className={cn(cardClassName, 'space-y-3')}>
        <div className="flex items-start gap-3 p-4">
          <input type="checkbox" checked={selected.has(plan.id)} onChange={() => onToggleSelected(plan.id)}
            aria-label={`Select ${plan.name}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--plum)]" />
          {/* Row toggle: a real link keeps Tab/Enter keyboard operability, and the
              single-open state lives in the URL so back/forward and deep links work. */}
          <Link href={isOpen ? listHref(search, page) : listHref(search, page, plan.id)}
            className="flex flex-1 flex-wrap items-center gap-3" aria-expanded={isOpen}>
            <ChevronDown aria-hidden="true"
              className={cn('h-5 w-5 shrink-0 text-[var(--plum)] transition-transform', isOpen && 'rotate-180')} />
            <span className="min-w-0">
              <span className="block font-semibold">{plan.name}</span>
              {plan.description ? <span className="block text-sm text-[var(--midnight)]/60">{plan.description}</span> : null}
            </span>
            <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">{typeLabel[plan.planType] ?? plan.planType}</span>
              {plan.active
                ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Active</span>
                : <span className="rounded-full px-2.5 py-1 text-xs font-semibold opacity-60">Inactive</span>}
              {plan.public
                ? <span className="rounded-full bg-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-950">Public</span>
                : <span className="rounded-full border border-dashed border-[var(--lavender-deep)] px-2.5 py-1 text-xs font-semibold opacity-60">Private</span>}
            </span>
            <span className="w-full text-sm opacity-70 md:w-auto md:text-right">
              {plan.maxSpiders === null ? 'Unlimited' : `${plan.maxSpiders} spoods`} ·
              {' '}{plan.enabledFeatureCount} features · {plan.subscriptionCount} subscriber{plan.subscriptionCount === 1 ? '' : 's'} ·
              {' '}updated {plan.updatedAt.toISOString().slice(0, 10)}
            </span>
          </Link>
        </div>
        {isOpen ? <PlanDetail plan={plan} index={index} /> : null}
      </div>;
    })}
  </>;
}

/** Client owner of the selection state: an id→title map that grows as boxes
 * are checked and is never pruned by pagination or search, so selections and
 * the tray survive page changes, new searches, and re-renders. */
export function PlansAccordion(props: Omit<PlansAccordionViewProps,
  'selectedItems' | 'onToggleSelected' | 'trayCollapsed' | 'onToggleTrayCollapsed'>) {
  const [selection, setSelection] = useState<Map<string, string>>(new Map());
  const [trayCollapsed, setTrayCollapsed] = useState(false);
  return <PlansAccordionView {...props}
    selectedItems={[...selection].map(([id, title]) => ({ id, title }))}
    onToggleSelected={id => setSelection(previous => {
      const next = new Map(previous);
      if (next.has(id)) next.delete(id);
      else next.set(id, props.plans.find(plan => plan.id === id)?.name ?? id);
      return next;
    })}
    trayCollapsed={trayCollapsed}
    onToggleTrayCollapsed={() => setTrayCollapsed(collapsed => !collapsed)} />;
}
