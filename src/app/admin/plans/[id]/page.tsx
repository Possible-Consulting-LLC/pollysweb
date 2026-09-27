import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { Card } from '@/components/ui/card';
import { setBillingOptionActiveAction } from '../actions';
export const dynamic = 'force-dynamic';
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminActor('super_admin');
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id }, include: { billingOptions: true } });
  if (!plan) notFound();
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">{plan.name}</h2>
      <p>{plan.description}</p>
      <p className="text-sm">Type: {plan.planType} · Spood allowance: {plan.maxSpiders === null ? 'Unlimited' : plan.maxSpiders} · Active: {plan.active ? 'yes' : 'no'} · Public: {plan.public ? 'yes' : 'no'}</p>
      <p><Link href={`/admin/plans/${plan.id}/edit`} className="underline">Edit this plan</Link> · <Link href="/admin/plans" className="underline">Back to plans</Link></p>
    </header>
    <section className="space-y-3 rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4">
      <h3 className="font-semibold">Billing options</h3>
      {plan.billingOptions.length === 0 ? <p>No billing options yet. Add them in the editor.</p> : null}
      {plan.billingOptions.map(option => <div key={option.id} className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{option.interval}</span>
        <span>{price(option.basePriceCents)}</span>
        {option.active
          ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Active</span>
          : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Inactive</span>}
        <MutationForm action={setBillingOptionActiveAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <input type="hidden" name="optionId" value={option.id} />
          <input type="hidden" name="active" value={option.active ? 'false' : 'true'} />
          <label className="grid gap-1 text-sm">Reason<input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
          <button className="rounded-xl bg-[var(--lavender)] px-3 py-2 text-sm font-semibold">{option.active ? 'Deactivate' : 'Activate'}</button>
        </MutationForm>
      </div>)}
    </section>
  </>;
}
