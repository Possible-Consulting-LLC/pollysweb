import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { createDemoService, type DemoDesignation } from './demo-accounts';
import type { Actor, Target } from './policy';
const actor: Actor = { id: 'admin', role: 'super_admin', owner: false, suspended: false, credentialVersion: 'live', reauthenticatedAt: Date.now() };
const designation: DemoDesignation = { label: 'Feature testing', plan: 'pro', confirmedDedicatedTestAccount: true };
function fixture() {
  const user = { emailVerified: new Date(), suspendedAt: null as Date | null, deletingAt: null as Date | null, plan: 'free', isDemo: false, demoPlan: null as string | null, demoLabel: null as string | null, stripeCustomerId: null as string | null, stripeSubscriptionId: null as string | null };
  const target: Target = { id: 'test', role: 'user', owner: false, demo: false };
  let intent = false;
  const audits: unknown[] = [];
  const subscriptions: unknown[] = [], sessions: unknown[] = [];
  let unavailable = false;
  const pages = (rows: unknown[]) => ({ async *[Symbol.asyncIterator]() { yield* rows.slice(0, 1); yield* rows.slice(1); } });
  const stripe = { customers: { retrieve: async () => ({ id: 'cus_test', metadata: { userId: 'test' } }) }, subscriptions: { list: () => pages(subscriptions) }, checkout: { sessions: { list: (args: {status?: string}) => pages(args.status ? sessions.filter(s => (s as {status:string}).status === args.status) : sessions) } } };
  const tx = { user: { findUniqueOrThrow: async () => user, update: async ({ data }: { data: object }) => Object.assign(user, data) }, billingCheckoutIntent: { findUnique: async () => intent ? { id: 'pending' } : null } } as unknown as Prisma.TransactionClient;
  const service = createDemoService({ withLocked: async (_id, work) => work(tx, actor, target), getStripe: () => { if (unavailable) throw Error('unavailable'); return stripe as unknown as Stripe; }, audit: async (_tx, input) => { audits.push(input); } });
  return { user, target, audits, subscriptions, sessions, setIntent: () => { intent = true; }, unavailable: () => { unavailable = true; }, ...service };
}
test('tagging and untagging only change demo fields and audit both transitions', async () => {
  const f = fixture();
  await f.setDemoAccount(actor, 'test', designation, 'Test coverage');
  assert.equal(f.user.isDemo, true); assert.equal(f.user.demoPlan, 'pro'); assert.equal(f.user.plan, 'free');
  await f.setDemoAccount(actor, 'test', null, 'Finished testing');
  assert.equal(f.user.isDemo, false); assert.equal(f.user.demoPlan, null); assert.equal(f.user.plan, 'free'); assert.equal(f.audits.length, 2);
});
for (const kind of ['privileged', 'owner', 'unverified', 'deleting', 'suspended', 'subscription', 'intent', 'confirmation', 'label', 'tier', 'reason', 'actor', 'reauth'] as const) {
  test(`demo designation rejects ${kind}`, async () => {
    const f = fixture(); let input = { ...designation }; let reason = 'Test coverage'; let caller = actor;
    if (kind === 'privileged') f.target.role = 'admin';
    if (kind === 'owner') f.target.owner = true;
    if (kind === 'unverified') f.user.emailVerified = null!;
    if (kind === 'deleting') f.user.deletingAt = new Date();
    if (kind === 'suspended') f.user.suspendedAt = new Date();
    if (kind === 'subscription') f.user.stripeSubscriptionId = 'sub_canceled';
    if (kind === 'intent') f.setIntent();
    if (kind === 'confirmation') input.confirmedDedicatedTestAccount = false;
    if (kind === 'label') input.label = 'private@example.test';
    if (kind === 'tier') input = { ...input, plan: 'breeder' as 'pro' };
    if (kind === 'reason') reason = '';
    if (kind === 'actor') caller = { ...actor, id: 'forged' };
    if (kind === 'reauth') { const old = actor.reauthenticatedAt; actor.reauthenticatedAt = null; try { await assert.rejects(f.setDemoAccount(actor, 'test', input, reason)); } finally { actor.reauthenticatedAt = old; } return; }
    await assert.rejects(f.setDemoAccount(caller, 'test', input, reason)); assert.equal(f.user.isDemo, false);
  });
}
test('customer alone allowed after verification; historical subscription or pending checkout on later pages rejected', async () => {
  const f = fixture(); f.user.stripeCustomerId = 'cus_test';
  await f.setDemoAccount(actor, 'test', designation, 'Test coverage'); assert.equal(f.user.isDemo, true);
  for (const remote of [f.subscriptions, f.sessions]) {
    remote.push({ id: 'first', status: 'canceled' }, { id: 'later', status: 'open' });
    await assert.rejects(f.setDemoAccount(actor, 'test', designation, 'Test coverage'));
    remote.length = 0;
  }
  f.unavailable(); await assert.rejects(f.setDemoAccount(actor, 'test', designation, 'Test coverage'));
});

test('completed checkout with delayed subscription visibility blocks designation', async () => {
  const f = fixture(); f.user.stripeCustomerId = 'cus_test';
  f.sessions.push({ id: 'completed', mode: 'subscription', status: 'complete', subscription: null });
  // Require all-session enumeration: an open-only query would hide this result.
  await assert.rejects(f.setDemoAccount(actor, 'test', designation, 'Test coverage'));
});
