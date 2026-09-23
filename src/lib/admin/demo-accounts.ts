import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { canManage, type Actor, type Target } from './policy';
import { requireRecentAdminAuth } from './reauth';
import { verifyCustomerOwner } from '../billing-policy';
import type { DemoPlan } from '../effective-entitlement';
export type DemoDesignation = { label: string; plan: DemoPlan; confirmedDedicatedTestAccount: boolean };
export type DemoDependencies = {
  withLocked<T>(targetId: string, work: (tx: Prisma.TransactionClient, actor: Actor, target: Target) => Promise<T>): Promise<T>;
  getStripe(): Stripe;
  audit(tx: Prisma.TransactionClient, input: { actorId: string; targetId: string; action: string; reason: string; changes: Record<string, string | boolean | null> }): Promise<void>;
};
export function createDemoService(deps: DemoDependencies) {
  async function setDemoAccount(actor: Actor, targetId: string, designation: DemoDesignation | null, reason: string): Promise<void> {
    if (!reason.trim() || reason.length > 500) throw Error('Enter a short reason.');
    if (designation && (!designation.confirmedDedicatedTestAccount || !['free', 'pro'].includes(designation.plan) ||
        !/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/.test(designation.label.trim()))) {
      throw Error('Confirm a dedicated test account, choose Free or Pro, and enter a label up to 80 characters without personal information.');
    }
    await deps.withLocked(targetId, async (tx, live, target) => {
      if (actor.id !== live.id || target.id !== targetId || !canManage(live, target, 'demo')) throw Error('Demo designation is not authorized.');
      requireRecentAdminAuth(live, Date.now());
      const user = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
      if (!user.emailVerified || user.suspendedAt || user.deletingAt) throw Error('A verified, available dedicated test account is required.');
      if (await tx.billingCheckoutIntent.findUnique({ where: { userId: targetId } })) throw Error('An unresolved checkout requires recovery before changing demo designation.');
      if (designation) {
        if (user.stripeSubscriptionId) throw Error('Accounts with subscription history cannot be demos.');
        if (user.stripeCustomerId) {
          const stripe = deps.getStripe();
          verifyCustomerOwner(targetId, user.stripeCustomerId, await stripe.customers.retrieve(user.stripeCustomerId));
          let history = false;
          for await (const subscription of stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 100 })) {
            if (subscription.id) history = true;
          }
          if (history) throw Error('Accounts with subscription history cannot be demos.');
          for await (const session of stripe.checkout.sessions.list({ customer: user.stripeCustomerId, limit: 100 })) {
            if (session.status === 'open' || (session.status === 'complete' && session.mode === 'subscription')) {
              throw Error('Pending or completed subscription checkout prevents demo designation.');
            }
          }
        }
      }
      const data = { isDemo: designation !== null, demoPlan: designation?.plan ?? null, demoLabel: designation?.label.trim() ?? null };
      await deps.audit(tx, { actorId: live.id, targetId, action: 'account.demo.changed', reason,
        changes: { previousIsDemo: user.isDemo, previousDemoPlan: user.demoPlan, previousDemoLabel: user.demoLabel,
          isDemo: data.isDemo, demoPlan: data.demoPlan, demoLabel: data.demoLabel } });
      await tx.user.update({ where: { id: targetId }, data: { ...data, accountVersion: { increment: 1 } } });
    });
  }
  return { setDemoAccount };
}

export async function setDemoAccount(actor: Actor, targetId: string, designation: DemoDesignation | null, reason: string) {
  const [{ withAdminMutation }, { appendAudit }, { getStripe }] = await Promise.all([import('./actor'), import('./audit'), import('../stripe')]);
  return createDemoService({ withLocked: (id, work) => withAdminMutation(id, 'demo', work), audit: appendAudit, getStripe })
    .setDemoAccount(actor, targetId, designation, reason);
}
