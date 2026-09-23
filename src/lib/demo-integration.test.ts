import * as maintenancePolicy from './admin/maintenance-policy';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import * as entitlement from './effective-entitlement';
import * as entitlementQuery from './effective-entitlement-query';
import * as billing from './billing';
import * as policy from './admin/policy';
import { reviewItemsFor } from './constellation-data';
import type { SpiderCareView } from './spiders';

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  dependencies['@/lib/admin/maintenance-policy'] ??= maintenancePolicy;
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, Date, process: { env: {} }, console, require: (id: string) => {
    if (!(id in dependencies)) throw Error(`Unexpected test dependency: ${id}`);
    return dependencies[id];
  } });
  return exports as T;
}
function project(row: Record<string, unknown>, select: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(select).map(key => [key, row[key]]));
}
test('billing profile and care collection read demo overrides through their actual explicit selects', async () => {
  for (const [demoPlan, realPlan, expected] of [['pro', 'free', true], ['free', 'pro', false]] as const) {
    const row = { id: 'demo', isDemo: true, demoPlan, plan: realPlan, stripeCustomerId: null, subscriptionStatus: null, billingLastCheckedAt: null };
    const userRead = async ({ select }: { select: Record<string, unknown> }) => project(row, select);
    const db = { user: { findUnique: userRead, findUniqueOrThrow: userRead }, spider: { count: async () => 2, findFirst: async () => ({ id: 'first' }) } };
    const write = load<typeof import('./spider-write-policy')>('./spider-write-policy.ts', { './db': { prisma: db }, './effective-entitlement': entitlement });
    const stripe = load<typeof import('./stripe')>('./stripe.ts', { 'server-only': {}, stripe: {}, './staging-guard': {}, '@/lib/db': { prisma: db }, '@/lib/billing': billing, './effective-entitlement': entitlement });
    const state = await write.getSpiderWriteState('demo');
    assert.equal(state.proAccess, expected);
    const views = ['first', 'later'].map(id => ({ spider: { id, name: id, memorializedAt: null, status: 'Normal' }, daysSinceSuccessfulFeed: 1, daysSinceMolt: null, mistDue: false })) as SpiderCareView[];
    assert.deepEqual(reviewItemsFor(views, 3, state).map(item => item.id), expected ? ['first', 'later'] : ['first']);
    const profile = await stripe.getBillingProfile('demo');
    assert.equal(profile.plan, demoPlan); assert.equal(profile.canAddSpider, expected);
  }
});

test('direct billing actions reject demo before configuration or billing service calls', async () => {
  let billingCalls = 0;
  const actions = load<typeof import('../app/actions/billing')>('../app/actions/billing.ts', {
    '@/lib/mutation-boundary': { withMutation: async (_context:unknown,_kind:unknown,_action:unknown,work:()=>Promise<unknown>)=>work() },
    stripe: {}, '@/lib/session': { getActionUser: async () => ({ id: 'demo' }) },
    '@/lib/billing': { isStripeConfigured: () => { throw Error('must reject demo first'); } },
    '@/lib/billing-service': { checkoutForUser: async () => { billingCalls++; }, portalForUser: async () => { billingCalls++; } },
    '@/lib/db': { prisma: { user: { findUnique: async () => ({ isDemo: true }) } } },
  });
  assert.match((await actions.startCheckoutAction('monthly','context')).error!, /demo/i);
  assert.match((await actions.openBillingPortalAction('context')).error!, /demo/i);
  assert.equal(billingCalls, 0);
});

// Small Prisma predicate interpreter validates the emitted query against hand-
// checked rows. This exercises the filter contract, not a live database.
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Record<string, unknown>[]).some(item => matches(row, item));
    if (key === 'AND') return (value as Record<string, unknown>[]).every(item => matches(row, item));
    if (key === 'NOT') return !matches(row, value as Record<string, unknown>);
    if (value && typeof value === 'object') {
      return Object.entries(value).every(([operation, expected]) => {
        if (operation === 'in') return (expected as unknown[]).includes(row[key]);
        if (operation === 'gte') return row[key] instanceof Date && row[key] >= (expected as Date);
        if (operation === 'lte') return row[key] instanceof Date && row[key] <= (expected as Date);
        throw Error(`Unhandled predicate: ${operation}`);
      });
    }
    return row[key] === value;
  });
}
test('admin current-entitlement filter includes Pro demos, excludes Free demos, and projects the same displayed plan', async () => {
  const now = new Date();
  const base = { isDemo: false, demoPlan: null, plan: 'free', stripeCustomerId: null, subscriptionStatus: null, billingLastCheckedAt: null, createdAt: now };
  const rows = [
    { ...base, id: 'demo-pro', isDemo: true, demoPlan: 'pro' },
    { ...base, id: 'demo-free', isDemo: true, demoPlan: 'free', plan: 'pro' },
    { ...base, id: 'real-pro', plan: 'pro', stripeCustomerId: 'cus_real', subscriptionStatus: 'active', billingLastCheckedAt: now },
    { ...base, id: 'real-free' },
  ];
  const accounts = load<typeof import('./admin/accounts')>('./admin/accounts.ts', {
    'node:crypto': {}, './policy': policy, '../social-disconnect-policy': {}, '../effective-entitlement': entitlement, '../effective-entitlement-query': entitlementQuery,
    './actor': { requireAdminActor: async () => ({}) },
    '../db': { prisma: { user: { findMany: async ({ where, select }: { where: Record<string, unknown>; select: Record<string, unknown> }) => rows.filter(row => matches(row, where)).map(row => project(row, select)) } } },
  });
  const pro = await accounts.searchAccounts({ plan: 'pro' });
  assert.equal(JSON.stringify(pro.items.map(item => [item.id, item.entitlement])), JSON.stringify([['demo-pro', 'pro'], ['real-pro', 'pro']]));
  const free = await accounts.searchAccounts({ plan: 'free' });
  assert.equal(JSON.stringify(free.items.map(item => [item.id, item.entitlement])), JSON.stringify([['demo-free', 'free'], ['real-free', 'free']]));
});
