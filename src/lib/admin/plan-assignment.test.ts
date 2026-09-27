import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type * as assignment from './plan-assignment';
import type * as plans from './plans';
import * as maintenancePolicy from './maintenance-policy';

type UserRow = { id: string; email: string; role: string; deletingAt: Date | null };
type PlanRow = { id: string; name: string; active: boolean; public: boolean; planType: string };
type OptionRow = { id: string; planId: string; interval: string; basePriceCents: number;
  active: boolean };
type SubscriptionRow = { id: string; userId: string; planId: string; planBillingOptionId: string;
  status: string; startedAt: Date; renewsAt: Date | null; expiresAt: Date | null;
  createdAt: Date; updatedAt: Date };

function load(relativePath: string, deps: Record<string, unknown>): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(name in deps, name); return deps[name];
  } });
  return exports;
}

/** Error instances from the vm sandbox live in another realm; tag check works cross-realm. */
const isFailure = (value: unknown) => Object.prototype.toString.call(value) === '[object Error]';
/** Results returned from the sandbox live in another realm; JSON copies keep strict comparisons local. */
const jsonOf = (value: unknown) => JSON.parse(JSON.stringify(value));

const ACTOR: UserRow = { id: 'owner-1', email: 'owner@example.com', role: 'super_admin', deletingAt: null };
const TARGET: UserRow = { id: 'user-1', email: 'user@example.com', role: 'user', deletingAt: null };
const PLAN: PlanRow = { id: 'plan-1', name: 'Standard', active: true, public: true, planType: 'STANDARD' };
const MONTHLY: OptionRow = { id: 'opt-1', planId: 'plan-1', interval: 'MONTHLY', basePriceCents: 900, active: true };
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

function fixture(role: 'admin' | 'super_admin' = 'super_admin', setup: {
  users?: UserRow[]; subscriptions?: SubscriptionRow[] } = {}) {
  const userStore = new Map<string, UserRow>([
    [ACTOR.id, { ...ACTOR, role }], [TARGET.id, { ...TARGET }],
    ...setup.users?.map(user => [user.id, { ...user }] as const) ?? [],
  ]);
  if (!userStore.has(ACTOR.id)) userStore.set(ACTOR.id, { ...ACTOR, role });
  const planStore = new Map<string, PlanRow>([[PLAN.id, { ...PLAN }]]);
  const optionStore = new Map<string, OptionRow>([[MONTHLY.id, { ...MONTHLY }]]);
  const subscriptionStore = new Map<string, SubscriptionRow>(
    setup.subscriptions?.map(row => [row.id, { ...row }] as const) ?? []);
  const audits: Array<{ action: string; targetId: string | null; reason: string;
    changes: Record<string, unknown> }> = [];
  let nextId = 10;
  const snapshotPlan = (row: PlanRow) => ({ ...row, featureTranslations: [] as unknown[],
    billingOptions: [...optionStore.values()]
    .filter(option => option.planId === row.id).map(option => ({ ...option })) });
  const effective = (row: SubscriptionRow) =>
    ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(row.status) &&
    (row.expiresAt === null || row.expiresAt.getTime() > NOW);
  const whereMatches = (where: Record<string, unknown>, row: SubscriptionRow) => {
    if (where.userId !== undefined && where.userId !== row.userId) return false;
    if (where.planId !== undefined && where.planId !== row.planId) return false;
    if (where.id !== undefined && where.id !== row.id) return false;
    if (where.status !== undefined) {
      const statuses = (where.status as { in?: string[] }).in;
      if (statuses && !statuses.includes(row.status)) return false;
      if (!statuses && row.status !== where.status) return false;
    }
    if (Array.isArray(where.OR)) {
      const ok = where.OR.some((clause: { expiresAt?: unknown }) => {
        if (clause.expiresAt === null) return row.expiresAt === null;
        const gt = (clause.expiresAt as { gt?: Date } | undefined)?.gt;
        return row.expiresAt !== null && gt !== undefined && row.expiresAt.getTime() > gt.getTime();
      });
      if (!ok) return false;
    }
    return true;
  };
  const tx = {
    user: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        userStore.has(id) ? { ...userStore.get(id)! } : null,
      findFirst: async ({ where }: { where: { OR: Array<{ email?: string; id?: string }> } }) => {
        const email = where.OR.find(clause => clause.email)?.email;
        const id = where.OR.find(clause => clause.id)?.id;
        const row = email
          ? [...userStore.values()].find(candidate => candidate.email === email)
          : userStore.get(id ?? '');
        return row ? { id: row.id } : null;
      },
    },
    plan: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        planStore.has(id) ? snapshotPlan(planStore.get(id)!) : null,
      findMany: async () => [...planStore.values()].map(snapshotPlan),
    },
    planBillingOption: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        optionStore.has(id) ? { ...optionStore.get(id)! } : null,
    },
    userSubscription: {
      findMany: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        [...subscriptionStore.values()].filter(row => whereMatches(where, row)).map(row => ({ ...row })),
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        [...subscriptionStore.values()].filter(row => whereMatches(where, row)).length,
      updateMany: async ({ where = {}, data }: { where?: Record<string, unknown>;
        data: Partial<SubscriptionRow> }) => {
        const matched = [...subscriptionStore.values()].filter(row => whereMatches(where, row));
        for (const row of matched) Object.assign(row, data);
        return { count: matched.length };
      },
      create: async ({ data }: { data: Omit<SubscriptionRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const row: SubscriptionRow = { ...data, id: `sub-${nextId++}`,
          createdAt: new Date(NOW), updatedAt: new Date(NOW) };
        subscriptionStore.set(row.id, row); return { ...row };
      },
    },
    $queryRaw: async () => [],
    adminAudit: {
      create: async ({ data }: { data: { action: string; targetId: string | null; reason: string;
        changes: Record<string, unknown> } }) => {
        audits.push({ action: data.action, targetId: data.targetId, reason: data.reason,
          changes: JSON.parse(JSON.stringify(data.changes)) });
        return data;
      },
    },
  };
  const audit = load('./audit.ts', { 'server-only': {} });
  const plansModule = load('./plans.ts', { 'server-only': {}, './audit': audit }) as typeof plans;
  const assignmentModule = load('./plan-assignment.ts', { 'server-only': {}, './audit': audit }) as typeof assignment;
  return { assignment: assignmentModule, plans: plansModule, tx: tx as never, userStore, planStore,
    optionStore, subscriptionStore, audits, effective };
}

const validInput = { targetUserId: 'user-1', planId: 'plan-1', planBillingOptionId: 'opt-1',
  effectiveAt: new Date(NOW), reason: 'Customer support upgrade' };

test('validateAssignment accepts a well-formed assignment and trims the reason', () => {
  const f = fixture();
  const accepted = f.assignment.validateAssignment(validInput);
  assert.ok(!isFailure(accepted));
  assert.equal((accepted as typeof validInput).reason, 'Customer support upgrade');
});

test('validateAssignment rejects missing ids, bad reasons, and invalid dates', () => {
  const f = fixture();
  for (const input of [
    { ...validInput, targetUserId: '' },
    { ...validInput, targetUserId: 'x'.repeat(129) },
    { ...validInput, planId: '' },
    { ...validInput, planBillingOptionId: '' },
    { ...validInput, reason: '' },
    { ...validInput, reason: 'y'.repeat(501) },
    { ...validInput, reason: 'Email support@example.com' },
    { ...validInput, effectiveAt: new Date(Number.NaN) },
    { ...validInput, effectiveAt: 'now' as unknown as Date },
  ]) {
    assert.ok(isFailure(f.assignment.validateAssignment(input as never)), JSON.stringify(input));
  }
});

test('assignPlanSubscription inserts an ACTIVE row and audits plan.assign with planId, status, effectiveAt', async () => {
  const f = fixture();
  const id = await f.assignment.assignPlanSubscription(f.tx, 'owner-1', validInput);
  assert.ok(typeof id === 'string' && !isFailure(id));
  const row = f.subscriptionStore.get(id as string)!;
  assert.equal(row.userId, 'user-1');
  assert.equal(row.planId, 'plan-1');
  assert.equal(row.planBillingOptionId, 'opt-1');
  assert.equal(row.status, 'ACTIVE');
  assert.deepEqual(row.startedAt, new Date(NOW));
  assert.deepEqual(f.audits, [{ action: 'plan.assign', targetId: 'user-1',
    reason: 'Customer support upgrade',
    changes: { planId: 'plan-1', status: 'ACTIVE', effectiveAt: new Date(NOW).toISOString() } }]);
});

test('a second assignment end-dates the prior effective row and leaves exactly one effective subscription', async () => {
  const prior: SubscriptionRow = { id: 'sub-1', userId: 'user-1', planId: 'plan-1',
    planBillingOptionId: 'opt-1', status: 'ACTIVE', startedAt: new Date(NOW - 86_400_000),
    renewsAt: null, expiresAt: null, createdAt: new Date(NOW - 86_400_000), updatedAt: new Date(NOW - 86_400_000) };
  const f = fixture('super_admin', { subscriptions: [prior] });
  const later = new Date(NOW + 3_600_000);
  const id = await f.assignment.assignPlanSubscription(f.tx, 'owner-1',
    { ...validInput, planBillingOptionId: 'opt-1', effectiveAt: later, reason: 'Switch plans' });
  assert.ok(typeof id === 'string' && id !== 'sub-1');
  // Assert both the prior row's update and the new row's insert.
  assert.equal(f.subscriptionStore.get('sub-1')!.status, 'CANCELED');
  assert.deepEqual(f.subscriptionStore.get('sub-1')!.expiresAt, later);
  const effectiveRows = [...f.subscriptionStore.values()].filter(row => f.effective(row));
  assert.equal(effectiveRows.length, 1);
  assert.equal(effectiveRows[0].id, id);
  assert.equal(effectiveRows[0].status, 'ACTIVE');
});

test('assignPlanSubscription rejects an inactive plan', async () => {
  const f = fixture();
  f.planStore.set('plan-2', { ...PLAN, id: 'plan-2', active: false });
  const result = await f.assignment.assignPlanSubscription(f.tx, 'owner-1',
    { ...validInput, planId: 'plan-2' });
  assert.ok(isFailure(result));
  assert.equal(f.subscriptionStore.size, 0);
  assert.equal(f.audits.length, 0);
});

test('assignPlanSubscription rejects an inactive billing option', async () => {
  const f = fixture();
  f.optionStore.set('opt-2', { ...MONTHLY, id: 'opt-2', active: false });
  const result = await f.assignment.assignPlanSubscription(f.tx, 'owner-1',
    { ...validInput, planBillingOptionId: 'opt-2' });
  assert.ok(isFailure(result));
  assert.equal(f.subscriptionStore.size, 0);
});

test('assignPlanSubscription rejects an option that does not belong to the chosen plan', async () => {
  const f = fixture();
  f.optionStore.set('opt-9', { id: 'opt-9', planId: 'plan-9', interval: 'MONTHLY',
    basePriceCents: 900, active: true });
  const result = await f.assignment.assignPlanSubscription(f.tx, 'owner-1',
    { ...validInput, planBillingOptionId: 'opt-9' });
  assert.ok(isFailure(result));
  assert.equal(f.subscriptionStore.size, 0);
  assert.equal(f.audits.length, 0);
});

test('assignPlanSubscription rejects a missing or deleting target user', async () => {
  const f = fixture();
  const missing = await f.assignment.assignPlanSubscription(f.tx, 'owner-1',
    { ...validInput, targetUserId: 'user-missing' });
  assert.ok(isFailure(missing));
  f.userStore.set('user-2', { id: 'user-2', email: 'x@example.com', role: 'user',
    deletingAt: new Date(NOW) });
  const deleting = await f.assignment.assignPlanSubscription(f.tx, 'owner-1',
    { ...validInput, targetUserId: 'user-2' });
  assert.ok(isFailure(deleting));
  assert.equal(f.subscriptionStore.size, 0);
});

test('a non-super-admin actor is denied without writes or audits', async () => {
  const f = fixture('admin');
  const result = await f.assignment.assignPlanSubscription(f.tx, 'owner-1', validInput);
  assert.ok(isFailure(result));
  assert.equal(f.subscriptionStore.size, 0);
  assert.equal(f.audits.length, 0);
});

test('the assignment acquires the target user row lock inside the transaction', async () => {
  const f = fixture();
  const locks: Array<{ strings: string[]; values: unknown[] }> = [];
  (f.tx as { $queryRaw: unknown }).$queryRaw =
    (strings: string[], ...values: unknown[]) => {
      locks.push({ strings, values }); return Promise.resolve([]);
    };
  await f.assignment.assignPlanSubscription(f.tx, 'owner-1', validInput);
  assert.equal(locks.length, 1);
  // The lock targets the assigned user: statement text plus bound id value.
  assert.ok(locks[0].strings.join('').includes('FOR UPDATE'));
  assert.ok(locks[0].values.includes('user-1'));
});

test('assignSubscriptionAction derives the audit reason from context without a form reason', async () => {
  const f = fixture();
  const api = load('../../app/admin/subscriptions/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, kind: unknown, action: string,
      work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) =>
      work(f.tx, { id: 'owner-1' }) },
    '@/lib/admin/plan-assignment': f.assignment,
  }) as { assignSubscriptionAction: (form: FormData) => Promise<unknown> };
  const form = new FormData();
  form.set('userQuery', 'user@example.com');
  form.set('planId', 'plan-1');
  form.set('planBillingOptionId', 'opt-1');
  form.set('effectiveAt', '2026-09-26T12:00:00.000Z');
  assert.deepEqual(jsonOf(await api.assignSubscriptionAction(form)), { success: true });
  assert.deepEqual(f.audits, [{ action: 'plan.assign', targetId: 'user-1',
    reason: 'Assigned plan Standard to user user-1 effective 2026-09-26T12:00:00.000Z',
    changes: { planId: 'plan-1', status: 'ACTIVE', effectiveAt: '2026-09-26T12:00:00.000Z' } }]);
});

test('listEffectiveSubscriptions returns only currently effective rows', async () => {
  const f = fixture('super_admin', { subscriptions: [
    { id: 'sub-1', userId: 'user-1', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'ACTIVE',
      startedAt: new Date(NOW - 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-2', userId: 'user-2', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'CANCELED',
      startedAt: new Date(0), renewsAt: null, expiresAt: new Date(NOW - 86_400_000),
      createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-3', userId: 'user-3', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'ACTIVE',
      startedAt: new Date(0), renewsAt: null, expiresAt: new Date(NOW - 86_400_000),
      createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-4', userId: 'user-4', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'TRIALING',
      // Anchored to the wall clock: the production predicate compares against
      // new Date(), so fixed fixture dates become stale and time-bomb the suite.
      startedAt: new Date(Date.now() - 86_400_000), renewsAt: null,
      expiresAt: new Date(Date.now() + 86_400_000), createdAt: new Date(0), updatedAt: new Date(0) },
  ] });
  const summaries = await f.assignment.listEffectiveSubscriptions(f.tx);
  assert.deepEqual(summaries.map(row => row.id).sort(), ['sub-1', 'sub-4']);
  assert.ok(summaries.every(row => typeof row.planId === 'string'));
});

test('planHistoryCount and listPlans subscriptionCount read real effective subscriptions', async () => {
  const f = fixture('super_admin', { subscriptions: [
    { id: 'sub-1', userId: 'user-1', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'ACTIVE',
      startedAt: new Date(0), renewsAt: null, expiresAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-2', userId: 'user-2', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'EXPIRED',
      startedAt: new Date(0), renewsAt: null, expiresAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-3', userId: 'user-3', planId: 'plan-2', planBillingOptionId: 'opt-1', status: 'ACTIVE',
      startedAt: new Date(0), renewsAt: null, expiresAt: null, createdAt: new Date(0), updatedAt: new Date(0) },
  ] });
  f.planStore.set('plan-2', { ...PLAN, id: 'plan-2', name: 'Annual', planType: 'STANDARD' });
  assert.equal(await f.plans.planHistoryCount(f.tx, 'plan-1'), 1);
  const summaries = JSON.parse(JSON.stringify(await f.plans.listPlans(f.tx)));
  assert.deepEqual(summaries.map((row: { id: string; subscriptionCount: number }) =>
    ({ id: row.id, subscriptionCount: row.subscriptionCount })),
    [{ id: 'plan-1', subscriptionCount: 1 }, { id: 'plan-2', subscriptionCount: 1 }]);
});
