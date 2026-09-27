import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { saveBillingOptionAction, updatePlanAction } from '../../actions';
export const dynamic = 'force-dynamic';

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminActor('super_admin');
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id }, include: { billingOptions: true } });
  if (!plan) notFound();
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">Edit {plan.name}</h2>
      <p>Identity is the plan id; the name is a display label. An active billing option is limited to one per interval — deactivate it before adding a new active row for the same interval.</p>
      <p><Link href={`/admin/plans/${plan.id}`} className="underline">View plan</Link> · <Link href="/admin/plans" className="underline">Back to plans</Link></p>
    </header>
    <MutationForm action={updatePlanAction} className="grid max-w-xl gap-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4"><MutationContextInput />
      <input type="hidden" name="planId" value={plan.id} />
      <label className="grid gap-1">Name (1–80 characters, no @)<input name="name" defaultValue={plan.name} required maxLength={80} className="rounded-xl border p-2" /></label>
      <label className="grid gap-1">Description<textarea name="description" defaultValue={plan.description} required maxLength={500} rows={2} className="rounded-xl border p-2" /></label>
      <label className="grid gap-1">Plan type
        <select name="planType" defaultValue={plan.planType} className="rounded-xl border p-2">
          <option value="STANDARD">Standard</option>
          <option value="CUSTOM">Custom</option>
          <option value="INTERNAL">Internal</option>
        </select>
      </label>
      <label className="grid gap-1">Maximum spoods (empty = unlimited)<input name="maxSpiders" type="number" min={1} step={1} defaultValue={plan.maxSpiders ?? ''} className="rounded-xl border p-2" /></label>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={plan.active} /> Active</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="public" defaultChecked={plan.public} /> Public (shown on pricing)</label>
      <label className="grid gap-1">Reason (no personal information)<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
      <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">Save plan</button>
    </MutationForm>
    <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
      <h3 className="font-semibold">Billing options</h3>
      {plan.billingOptions.map(option => <div key={option.id} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{option.interval}</span>
        <span>{(option.basePriceCents / 100).toFixed(2)} USD</span>
        <span>{option.active ? 'Active' : 'Inactive'}</span>
      </div>)}
      <MutationForm action={saveBillingOptionAction} className="grid gap-3 border-t border-[var(--plum)]/15 pt-3 sm:grid-cols-2"><MutationContextInput />
        <input type="hidden" name="planId" value={plan.id} />
        <label className="grid gap-1">Interval
          <select name="interval" className="rounded-xl border p-2">
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUAL">Annual</option>
          </select>
        </label>
        <label className="grid gap-1">Base price (cents)<input name="basePriceCents" type="number" min={0} step={1} required className="rounded-xl border p-2" /></label>
        <label className="grid gap-1">State
          <select name="active" className="rounded-xl border p-2">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <label className="grid gap-1">Reason (no personal information)<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
        <button className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)] sm:col-span-2">Save billing option</button>
      </MutationForm>
    </section>
  </>;
}
