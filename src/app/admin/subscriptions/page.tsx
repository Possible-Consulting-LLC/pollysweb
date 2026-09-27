import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { listPlans } from '@/lib/admin/plans';
import { listEffectiveSubscriptions } from '@/lib/admin/plan-assignment';
import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import { Card } from '@/components/ui/card';
import { assignSubscriptionAction } from './actions';
export const dynamic = 'force-dynamic';

const intervalLabel: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Annual' };
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const statusLabel: Record<string, string> = { TRIALING: 'Trialing', ACTIVE: 'Active',
  PAST_DUE: 'Past due' };

export default async function SubscriptionsPage() {
  await requireAdminActor('super_admin');
  const [plans, subscriptions] = await Promise.all([
    listPlans(prisma), listEffectiveSubscriptions(prisma)]);
  const activePlans = plans.filter(plan => plan.active);
  const planById = new Map(plans.map(plan => [plan.id, plan]));
  const userIds = [...new Set(subscriptions.map(row => row.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } },
    select: { id: true, email: true } });
  const emailByUser = new Map(users.map(user => [user.id, user.email]));
  return <>
    <header className="space-y-2">
      <h2 className="text-2xl font-semibold">Subscriptions</h2>
      <p>Assign a plan to one user at a time: assigning ends the prior effective subscription (marked canceled as of the effective date). Only active plans and their active billing options can be assigned. Recent <a href="/admin/reauth" className="underline">identity confirmation</a> is required for every change.</p>
      <p>{subscriptions.length} effective subscription{subscriptions.length === 1 ? '' : 's'}</p>
    </header>
    <Card className="space-y-3">
      <h3 className="font-semibold">Assign a plan</h3>
      <MutationForm action={assignSubscriptionAction} className="grid max-w-2xl gap-3"><MutationContextInput />
        <label className="grid gap-1 text-sm">User email or id
          <input name="userQuery" required maxLength={256} className="rounded-xl border p-2" /></label>
        <label className="grid gap-1 text-sm">Plan
          <select name="planId" required className="rounded-xl border p-2">
            {activePlans.map(plan => <option key={plan.id} value={plan.id}>
              {plan.name} ({plan.billingOptionCount} option{plan.billingOptionCount === 1 ? '' : 's'})</option>)}
          </select></label>
        <label className="grid gap-1 text-sm">Billing option (must belong to the chosen plan)
          <select name="planBillingOptionId" required className="rounded-xl border p-2">
            {activePlans.map(plan => <optgroup key={plan.id} label={plan.name}>
              {plan.billingOptions.filter(option => option.active).map(option =>
                <option key={option.id} value={option.id}>
                  {intervalLabel[option.interval] ?? option.interval} — {price(option.basePriceCents)}</option>)}
            </optgroup>)}
          </select></label>
        <label className="grid gap-1 text-sm">Effective date (defaults to now)
          <input name="effectiveAt" type="datetime-local" className="rounded-xl border p-2" /></label>
        <label className="grid gap-1 text-sm">Reason
          <input name="reason" required maxLength={500} className="rounded-xl border p-2" /></label>
        <button className="w-fit rounded-xl bg-[var(--plum)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">Assign subscription</button>
      </MutationForm>
    </Card>
    <section className="space-y-3">
      <h3 className="font-semibold">Effective subscriptions</h3>
      {subscriptions.length === 0
        ? <p>No effective subscriptions yet. Assign a plan above.</p>
        : subscriptions.map(row => {
          const plan = planById.get(row.planId);
          return <Card key={row.id} className="space-y-2">
            <p className="font-semibold">{emailByUser.get(row.userId) ?? row.userId}</p>
            <p className="text-sm">
              Plan: {plan?.name ?? row.planId} ·
              {' '}Status: {statusLabel[row.status] ?? row.status} ·
              {' '}Started {row.startedAt.toISOString().slice(0, 10)} ·
              {' '}Renews {row.renewsAt ? row.renewsAt.toISOString().slice(0, 10) : '—'} ·
              {' '}Expires {row.expiresAt ? row.expiresAt.toISOString().slice(0, 10) : '—'}
            </p>
          </Card>;
        })}
    </section>
  </>;
}
