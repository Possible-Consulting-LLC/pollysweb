import Link from 'next/link';
import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { listPlans, type BillingInterval, type PlanType } from '@/lib/admin/plans';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { Card } from '@/components/ui/card';
import { deletePlanAction, duplicatePlanAction, reorderPlanAction } from './actions';
export const dynamic = 'force-dynamic';

const typeLabel: Record<string, string> = { STANDARD: 'Standard', CUSTOM: 'Custom', INTERNAL: 'Internal' };
const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function PlansPage() {
  await requireAdminActor('super_admin');
  const plans = await listPlans(prisma);
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">Plans</h2>
      <p>Plan identity is the id; display names may repeat. Active billing options are limited to one per interval, and plans with subscription history are deactivated instead of deleted. Recent <Link href="/admin/reauth" className="underline">identity confirmation</Link> is required for every change.</p>
      <p>{plans.length} plan{plans.length === 1 ? '' : 's'}</p>
    </header>
    <p><Link href="/admin/plans/new" className="rounded-xl bg-[var(--plum)] px-4 py-2 text-[var(--on-accent)]">Create a plan</Link></p>
    {plans.length === 0 ? <p>No plans yet. Create the first plan to start the catalog.</p> : null}
    {plans.map((plan, index) => <Card key={plan.id} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{plan.name}</h3>
        <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">{typeLabel[plan.planType] ?? plan.planType}</span>
        {plan.active
          ? <span className="rounded-full bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-950">Active</span>
          : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Inactive</span>}
        {plan.public
          ? <span className="rounded-full bg-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-950">Public</span>
          : <span className="rounded-full bg-[var(--lavender)] px-2.5 py-1 text-xs font-semibold text-[var(--plum-deep)]">Not public</span>}
      </div>
      <p>{plan.description}</p>
      <p className="text-sm">
        Spood allowance: {plan.maxSpiders === null ? 'Unlimited' : plan.maxSpiders} ·
        {' '}Billing options: {plan.billingOptionCount} ({plan.billingOptions.map(option =>
          `${intervalLabel[option.interval] ?? option.interval} ${price(option.basePriceCents)}${option.active ? '' : ' (inactive)'}`).join(', ') || 'none'}) ·
        {' '}Enabled features: {plan.enabledFeatureCount} ·
        {' '}Subscriptions: {plan.subscriptionCount} ·
        {' '}Updated {plan.updatedAt.toISOString().slice(0, 10)}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={`/admin/plans/${plan.id}/edit`} className="rounded-xl bg-[var(--lavender)] px-3 py-2 text-sm font-semibold">Edit</Link>
        <MutationForm action={duplicatePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <button className="rounded-xl bg-[var(--lavender)] px-3 py-2 text-sm font-semibold">Duplicate</button>
        </MutationForm>
        <MutationForm action={deletePlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <button className="rounded-xl bg-[var(--plum)] px-3 py-2 text-sm font-semibold text-[var(--on-accent)]">Delete or deactivate</button>
        </MutationForm>
        <MutationForm action={reorderPlanAction} className="flex flex-wrap items-end gap-2"><MutationContextInput />
          <input type="hidden" name="planId" value={plan.id} />
          <input type="hidden" name="direction" value={index === 0 ? 'down' : 'up'} />
          <button className="rounded-xl bg-[var(--lavender)] px-3 py-2 text-sm font-semibold">Move {index === 0 ? 'down' : 'up'}</button>
        </MutationForm>
      </div>
    </Card>)}
  </>;
}
