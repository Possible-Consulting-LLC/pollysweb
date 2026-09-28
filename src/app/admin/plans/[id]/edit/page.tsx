import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { isRegisteredFeatureKey } from '@/lib/features/registry';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { FeatureMatrix } from '@/components/admin/feature-matrix';
import { badgeOnClass, badgeOffClass } from '@/components/admin/list-shared';
import { Button } from '@/components/ui/button';
import { saveBillingOptionAction, setBillingOptionActiveAction, updatePlanAction } from '../../actions';
export const dynamic = 'force-dynamic';

// Mockup #7 anatomy: soft-bordered cards (radius ~16), lavender-deep rounded
// inputs, plum accent checkboxes — every color a theme token, so both themes
// render correctly by construction.
const fieldClass = 'rounded-xl border border-[var(--lavender-deep)] bg-[var(--input)] px-3 py-2 text-sm';
const cardClass = 'space-y-3 rounded-2xl border border-[var(--plum)]/15 bg-[var(--card)] p-3.5';
const labelClass = 'grid gap-1 text-sm font-semibold opacity-85';
const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminActor('super_admin');
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id },
    include: { billingOptions: true, featureTranslations: { include: { feature: { select: { key: true } } } } } });
  if (!plan) notFound();
  // Orphaned keys (in the DB but no longer in the registry) never seed the matrix.
  const initialEnabledKeys = plan.featureTranslations
    .filter(translation => translation.enabled && isRegisteredFeatureKey(translation.feature.key))
    .map(translation => translation.feature.key);
  return <>
    {/* Mockup #7 header: clean title + quiet View/Back crumbs. "View plan"
        deep-links the plans accordion (?open= is URL-owned) — the standalone
        detail page is retired (owner amendment). */}
    <header className="space-y-1">
      <h2 className="text-2xl font-semibold">Edit {plan.name}</h2>
      <p className="text-sm opacity-70">
        <Link href={`/admin/plans?open=${plan.id}`} className="underline">View plan</Link> ·{' '}
        <Link href="/admin/plans" className="underline">Back to plans</Link>
      </p>
    </header>
    {/* Plan details: one soft card submitting the existing updatePlanAction. */}
    <MutationForm action={updatePlanAction} className={cardClass}><MutationContextInput />
      <h3 className="text-[13.5px] font-semibold">Plan details</h3>
      <input type="hidden" name="planId" value={plan.id} />
      <label className={labelClass}>Name
        <input name="name" defaultValue={plan.name} required maxLength={80} className={fieldClass} /></label>
      <label className={labelClass}>Description
        <textarea name="description" defaultValue={plan.description} maxLength={500} rows={2}
          className={fieldClass} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Plan type
          <select name="planType" defaultValue={plan.planType} className={fieldClass}>
            <option value="STANDARD">Standard</option>
            <option value="CUSTOM">Custom</option>
            <option value="INTERNAL">Internal</option>
          </select></label>
        <label className={labelClass}>Maximum spoods (empty = unlimited)
          <input name="maxSpiders" type="number" min={1} step={1} defaultValue={plan.maxSpiders ?? ''}
            className={fieldClass} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={plan.active}
          className="h-4 w-4 accent-[var(--plum)]" /> Active</label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" defaultChecked={plan.public}
          className="h-4 w-4 accent-[var(--plum)]" /> Public (shown on pricing)</label>
      <div className="flex justify-end pt-1">
        <Button type="submit" variant="primary" size="md">Save plan</Button>
      </div>
    </MutationForm>
    {/* Billing options: freestanding hover rows (mockup .billrow) with pill
        badges. The retired detail page's Activate/Deactivate capability moved
        here (owner amendment) — setBillingOptionActiveAction per row. */}
    <section className={cardClass}>
      <h3 className="text-[13.5px] font-semibold">Billing options</h3>
      {plan.billingOptions.map(option => <div key={option.id}
        className="flex flex-wrap items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm hover:bg-[var(--hover)]">
        <span className="font-bold">{intervalLabel[option.interval] ?? option.interval}</span>
        <span className="opacity-75">${(option.basePriceCents / 100).toFixed(2)} USD</span>
        {option.active
          ? <span className={badgeOnClass}>Active</span>
          : <span className={badgeOffClass}>Inactive</span>}
        <MutationForm action={setBillingOptionActiveAction} className="ml-auto flex items-center">
          <MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <input type="hidden" name="optionId" value={option.id} />
          <input type="hidden" name="active" value={option.active ? 'false' : 'true'} />
          <Button type="submit" variant="soft" size="sm">{option.active ? 'Deactivate' : 'Activate'}</Button>
        </MutationForm>
      </div>)}
      <MutationForm action={saveBillingOptionAction}
        className="grid gap-3 border-t border-[var(--plum)]/15 pt-3 sm:grid-cols-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <label className={labelClass}>Interval
          <select name="interval" className={fieldClass}>
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUAL">Annual</option>
          </select></label>
        <label className={labelClass}>Base price (cents)
          <input name="basePriceCents" type="number" min={0} step={1} required className={fieldClass} /></label>
        <label className={labelClass}>State
          <select name="active" className={fieldClass}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select></label>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="soft" size="md">Add option</Button>
        </div>
      </MutationForm>
      <p className="text-[11.5px] opacity-55">One active option per interval — deactivate an
        interval&apos;s active row before adding a new one.</p>
    </section>
    {/* Features section: the matrix owns its pricing kv card, toolbar pair +
        counter, tray, grouped rows, and the shared footer Save-matrix slot. */}
    <FeatureMatrix planId={plan.id} planName={plan.name}
      options={plan.billingOptions.map(option => ({ planId: option.planId, interval: option.interval,
        basePriceCents: option.basePriceCents, active: option.active }))}
      initialEnabledKeys={initialEnabledKeys} />
  </>;
}
