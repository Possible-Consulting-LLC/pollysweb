import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type * as assignment from './plan-assignment';
import type * as plans from './plans';
import type * as legacy from './legacy-entitlements';
import * as maintenancePolicy from './maintenance-policy';

type UserRow = { id: string; name: string | null; email: string; role: string;
  plan?: string | null; deletingAt: Date | null };
type PlanRow = { id: string; name: string; active: boolean; public: boolean; planType: string;
  sortOrder: number };
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
const jsonOf = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ACTOR: UserRow = { id: 'owner-1', name: 'Owner One', email: 'owner@example.com',
  role: 'super_admin', deletingAt: null };
const TARGET: UserRow = { id: 'user-1', name: 'Target Keeper', email: 'user@example.com',
  role: 'user', deletingAt: null };
const PLAN: PlanRow = { id: 'plan-1', name: 'Standard', active: true, public: true,
  planType: 'STANDARD', sortOrder: 0 };
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
  const featureStore = new Map<string, { name: string }>();
  const translationStore = new Map<string, { id: string; planId: string; featureId: string;
    enabled: boolean }>();
  const translationCalls: Array<Record<string, unknown>> = [];
  const audits: Array<{ action: string; targetId: string | null; reason: string;
    changes: Record<string, unknown> }> = [];
  let nextId = 10;
  const snapshotPlan = (row: PlanRow) => ({ ...row, featureTranslations: [] as unknown[],
    billingOptions: [...optionStore.values()]
    .filter(option => option.planId === row.id).map(option => ({ ...option })) });
  const effective = (row: SubscriptionRow) =>
    ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(row.status) &&
    (row.expiresAt === null || row.expiresAt.getTime() > NOW);
  const contains = (value: string | null | undefined, needle: string | undefined) =>
    needle !== undefined && (value ?? '').toLowerCase().includes(needle.toLowerCase());
  const userWhereMatches = (where: Record<string, unknown>, row: UserRow) => {
    if (where.deletingAt === null && row.deletingAt !== null) return false;
    if (where.id && typeof where.id === 'object' &&
      Array.isArray((where.id as { in?: string[] }).in) &&
      !(where.id as { in: string[] }).in.includes(row.id)) return false;
    if (where.plan !== undefined) {
      if (typeof where.plan === 'string') {
        if ((row.plan ?? null) !== where.plan) return false;
      } else {
        const tiers = (where.plan as { in?: string[] }).in;
        if (tiers && !tiers.includes(row.plan ?? '')) return false;
      }
    }
    if (where.subscriptions && typeof where.subscriptions === 'object' &&
      (where.subscriptions as { none?: Record<string, unknown> }).none) {
      // Prisma `none` — no subscription of this user's matches the nested where.
      const subWhere = (where.subscriptions as { none: Record<string, unknown> }).none;
      const has = [...subscriptionStore.values()].some(sub =>
        sub.userId === row.id && whereMatches(subWhere, sub));
      if (has) return false;
    }
    if (Array.isArray(where.OR) && !where.OR.some((clause: Record<string, unknown>) =>
      (clause.name !== undefined || clause.email !== undefined) &&
        (contains(row.name, (clause as { name?: { contains?: string } }).name?.contains) ||
          contains(row.email, (clause as { email?: { contains?: string } }).email?.contains)) ||
      (clause.plan !== undefined && userWhereMatches(clause, row))))
      return false;
    return true;
  };
  const planWhereMatches = (where: Record<string, unknown>, row: PlanRow) => {
    if (where.active !== undefined && row.active !== where.active) return false;
    const name = (where.name ?? {}) as { contains?: string; notIn?: string[] };
    if (name.notIn && name.notIn.includes(row.name)) return false;
    if (name.contains !== undefined && !row.name.toLowerCase().includes(String(name.contains).toLowerCase()))
      return false;
    return true;
  };
  const planRowsMatching = (where: Record<string, unknown> = {}) => {
    const rows = [...planStore.values()].filter(row => planWhereMatches(where, row));
    rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    return rows;
  };
  const searchClause = (clause: Record<string, unknown>, row: SubscriptionRow) => {
    if (clause.expiresAt !== undefined) {
      if (clause.expiresAt === null) return row.expiresAt === null;
      const gt = (clause.expiresAt as { gt?: Date } | undefined)?.gt;
      return row.expiresAt !== null && gt !== undefined && row.expiresAt.getTime() > gt.getTime();
    }
    if (clause.user) {
      const keeper = userStore.get(row.userId);
      const or = (clause.user as { OR?: Array<{ name?: { contains?: string };
        email?: { contains?: string } }> }).OR ?? [];
      return or.some(part => contains(keeper?.name, part.name?.contains) ||
        contains(keeper?.email, part.email?.contains));
    }
    if (clause.plan)
      return contains(planStore.get(row.planId)?.name,
        (clause.plan as { name?: { contains?: string } }).name?.contains);
    if (clause.status && typeof clause.status === 'object')
      return contains(row.status, (clause.status as { contains?: string }).contains);
    return false;
  };
  const whereMatches = (where: Record<string, unknown>, row: SubscriptionRow): boolean => {
    if (Array.isArray(where.AND) && !where.AND.every(clause =>
      whereMatches(clause as Record<string, unknown>, row))) return false;
    if (Array.isArray(where.OR) && !where.OR.some(clause =>
      searchClause(clause as Record<string, unknown>, row))) return false;
    if (where.userId !== undefined && where.userId !== row.userId) return false;
    if (where.planId !== undefined && where.planId !== row.planId) return false;
    if (where.id !== undefined && where.id !== row.id) return false;
    if (where.status !== undefined) {
      if (typeof where.status === 'string') {
        if (row.status !== where.status) return false;
      } else {
        const statuses = (where.status as { in?: string[] }).in;
        if (statuses && !statuses.includes(row.status)) return false;
      }
    }
    return true;
  };
  const withSubscriptionRelations = (row: SubscriptionRow,
    shape?: Record<string, unknown>): Record<string, unknown> => ({
    ...row,
    ...(shape?.user ? { user: userStore.has(row.userId) ? { ...userStore.get(row.userId) } : null } : {}),
    ...(shape?.plan ? { plan: planStore.has(row.planId) ? snapshotPlan(planStore.get(row.planId)!) : null } : {}),
    ...(shape?.billingOption ? { billingOption: optionStore.has(row.planBillingOptionId)
      ? { ...optionStore.get(row.planBillingOptionId)! } : null } : {}),
  });
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
      findMany: async ({ where = {}, skip = 0, take }: { where?: Record<string, unknown>;
        skip?: number; take?: number } = {}) => {
        const matched = [...userStore.values()].filter(row => userWhereMatches(where, row));
        matched.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email) ||
          (a.id < b.id ? -1 : 1));
        return matched.slice(skip, take === undefined ? undefined : skip + take)
          .map(row => ({ ...row }));
      },
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        [...userStore.values()].filter(row => userWhereMatches(where, row)).length,
    },
    plan: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        planStore.has(id) ? snapshotPlan(planStore.get(id)!) : null,
      findMany: async ({ where = {}, skip = 0, take }: { where?: Record<string, unknown>;
        skip?: number; take?: number } = {}) =>
        planRowsMatching(where).slice(skip, take === undefined ? undefined : skip + take)
          .map(snapshotPlan),
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        planRowsMatching(where).length,
    },
    planBillingOption: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        optionStore.has(id) ? { ...optionStore.get(id)! } : null,
    },
    featurePlanTranslation: {
      findMany: async (args: { where?: { planId?: { in?: string[] }; enabled?: boolean };
        select?: Record<string, unknown> } = {}) => {
        translationCalls.push(args);
        const ids = args.where?.planId?.in;
        return [...translationStore.values()]
          .filter(translation => (ids ? ids.includes(translation.planId) : true) &&
            (args.where?.enabled === undefined || translation.enabled === args.where.enabled))
          .map(translation => ({ ...translation, feature: featureStore.has(translation.featureId)
            ? { ...featureStore.get(translation.featureId)! } : null }));
      },
    },
    userSubscription: {
      findUnique: async ({ where: { id }, select }: { where: { id: string };
        select?: Record<string, unknown> }) => {
        const row = subscriptionStore.get(id);
        return row ? withSubscriptionRelations(row, select) : null;
      },
      findMany: async ({ where = {}, include, skip = 0, take }: { where?: Record<string, unknown>;
        include?: Record<string, unknown>; skip?: number; take?: number } = {}) => {
        const matched = [...subscriptionStore.values()].filter(row => whereMatches(where, row));
        matched.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() ||
          (a.id < b.id ? -1 : 1));
        return matched.slice(skip, take === undefined ? undefined : skip + take)
          .map(row => withSubscriptionRelations(row, include));
      },
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        [...subscriptionStore.values()].filter(row => whereMatches(where, row)).length,
      update: async ({ where: { id }, data }: { where: { id: string };
        data: Partial<SubscriptionRow> }) => {
        const row = subscriptionStore.get(id);
        if (!row) throw new Error(`no subscription ${id}`);
        Object.assign(row, data);
        return { ...row };
      },
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
  const legacyModule = load('./legacy-entitlements.ts', {}) as typeof legacy;
  const plansModule = load('./plans.ts', { 'server-only': {}, './audit': audit,
    './legacy-entitlements': legacyModule }) as typeof plans;
  const assignmentModule = load('./plan-assignment.ts',
    { 'server-only': {}, './audit': audit, './plans': plansModule,
      './legacy-entitlements': legacyModule }) as typeof assignment;
  return { assignment: assignmentModule, plans: plansModule, legacy: legacyModule, tx: tx as never,
    userStore, planStore, optionStore, subscriptionStore, featureStore, translationStore,
    translationCalls, audits, effective };
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
  f.userStore.set('user-2', { id: 'user-2', name: 'Deleting Keeper', email: 'x@example.com',
    role: 'user', deletingAt: new Date(NOW) });
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

test('assignSubscriptionAction assigns the whole keeper batch with per-user derived audit reasons', async () => {
  const f = fixture('super_admin', { users: [userRow('u-2', 'Marta Keeper', 'marta@example.com')] });
  const api = load('../../app/admin/subscriptions/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, kind: unknown, action: string,
      work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) =>
      work(f.tx, { id: 'owner-1' }) },
    '@/lib/admin/plan-assignment': f.assignment,
    '@/lib/admin/legacy-entitlements': f.legacy,
  }) as { assignSubscriptionAction: (form: FormData) => Promise<unknown> };
  const form = new FormData();
  // One form field carries the batch; duplicates collapse, ids arrive directly.
  form.set('userIds', 'user-1, u-2, user-1');
  form.set('planId', 'plan-1');
  form.set('planBillingOptionId', 'opt-1');
  form.set('effectiveAt', '2026-09-26T12:00:00.000Z');
  assert.deepEqual(jsonOf(await api.assignSubscriptionAction(form)), { success: true });
  assert.deepEqual(f.audits.map(audit => audit.targetId), ['user-1', 'u-2'],
    'one audited assignment per distinct keeper, in selection order');
  assert.deepEqual(f.audits.map(audit => audit.reason), [
    'Assigned plan Standard to user user-1 effective 2026-09-26T12:00:00.000Z',
    'Assigned plan Standard to user u-2 effective 2026-09-26T12:00:00.000Z',
  ]);
});

test('assignSubscriptionAction fails the whole batch with the named keeper error and no writes', async () => {
  const f = fixture('super_admin', { users: [
    userRow('u-gone', 'Gone Keeper', 'gone@example.com', new Date(NOW)),
  ] });
  const api = load('../../app/admin/subscriptions/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, _kind: unknown,
      _action: string, work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) =>
      work(f.tx, { id: 'owner-1' }) },
    '@/lib/admin/plan-assignment': f.assignment,
    '@/lib/admin/legacy-entitlements': f.legacy,
  }) as { assignSubscriptionAction: (form: FormData) => Promise<unknown> };
  const form = new FormData();
  form.set('userIds', 'user-1,u-gone');
  form.set('planId', 'plan-1');
  form.set('planBillingOptionId', 'opt-1');
  const result = jsonOf(await api.assignSubscriptionAction(form)) as { error: string };
  assert.match(result.error, /Gone Keeper/);
  assert.equal(f.subscriptionStore.size, 0, 'never a partial assignment');
  assert.equal(f.audits.length, 0);
  const empty = new FormData();
  empty.set('userIds', '');
  assert.deepEqual(jsonOf(await api.assignSubscriptionAction(empty)),
    { error: 'Select at least one keeper.' });
  assert.equal(f.audits.length, 0);
});

test('listEffectiveSubscriptions returns only currently effective rows with joined details', async () => {
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
  const { rows, total } = await f.assignment.listEffectiveSubscriptions(f.tx);
  // The union's outer array is built in the module realm — normalize first.
  const ids = jsonOf(rows).map(row => row.id);
  assert.deepEqual(ids.sort(), ['sub-1', 'sub-4']);
  assert.equal(total, 2);
  assert.ok(rows.every(row => typeof row.planId === 'string'));
  // Joined display details ride along for the page's rows.
  const first = JSON.parse(JSON.stringify(rows.find(row => row.id === 'sub-1')));
  assert.equal(first.userName, 'Target Keeper');
  assert.equal(first.userEmail, 'user@example.com');
  assert.equal(first.planName, 'Standard');
  assert.equal(first.optionInterval, 'MONTHLY');
  assert.equal(first.optionPriceCents, 900);
});

test('listEffectiveSubscriptions searches keeper name, email, plan name, and status', async () => {
  const f = fixture('super_admin', { users: [
    { id: 'u-2', name: 'Marta K.', email: 'marta@example.com', role: 'user', deletingAt: null },
  ], subscriptions: [
    { id: 'sub-1', userId: 'user-1', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'ACTIVE',
      startedAt: new Date(NOW - 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-2', userId: 'u-2', planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'PAST_DUE',
      startedAt: new Date(NOW - 2 * 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-3', userId: 'u-2', planId: 'plan-2', planBillingOptionId: 'opt-9', status: 'ACTIVE',
      startedAt: new Date(NOW - 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
  ] });
  f.planStore.set('plan-2', { ...PLAN, id: 'plan-2', name: 'Founding', planType: 'CUSTOM', sortOrder: 1 });
  f.optionStore.set('opt-9', { ...MONTHLY, id: 'opt-9', planId: 'plan-2' });
  const byName = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'marta', page: 1, pageSize: 20 });
  const idsOf = (result: { rows: Array<{ id: string }> }) => jsonOf(result.rows).map(row => row.id);
  assert.deepEqual(idsOf(byName), ['sub-3', 'sub-2']);
  const byEmail = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'user@example.com', page: 1, pageSize: 20 });
  assert.deepEqual(idsOf(byEmail), ['sub-1']);
  const byPlan = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'founding', page: 1, pageSize: 20 });
  assert.deepEqual(idsOf(byPlan), ['sub-3']);
  const byStatus = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'past', page: 1, pageSize: 20 });
  assert.deepEqual(idsOf(byStatus), ['sub-2']);
  const nothing = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'zzz', page: 1, pageSize: 20 });
  assert.deepEqual(jsonOf(nothing.rows), []);
  assert.equal(nothing.total, 0);
  // Pagination over the effective rows with an exact total.
  const page2 = await f.assignment.listEffectiveSubscriptions(f.tx, { page: 2, pageSize: 2 });
  assert.deepEqual(idsOf(page2), ['sub-2']);
  assert.equal(page2.total, 3);
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
  const { plans: summaries } = JSON.parse(JSON.stringify(
    await f.plans.listPlans(f.tx, { page: 1, pageSize: 20 })));
  assert.deepEqual(summaries.map((row: { id: string; subscriptionCount: number }) =>
    ({ id: row.id, subscriptionCount: row.subscriptionCount })),
    [{ id: 'plan-2', subscriptionCount: 1 }, { id: 'plan-1', subscriptionCount: 1 }]);
});

// --- Task 5: wizard sources ---

const userRow = (id: string, name: string | null, email: string,
  deletingAt: Date | null = null): UserRow =>
  ({ id, name, email, role: 'user', deletingAt });
const activeSub = (id: string, userId = 'user-1'): SubscriptionRow =>
  ({ id, userId, planId: 'plan-1', planBillingOptionId: 'opt-1', status: 'ACTIVE',
    startedAt: new Date(NOW - 86_400_000), renewsAt: null, expiresAt: null,
    createdAt: new Date(0), updatedAt: new Date(0) });

test('searchUsers matches name or email case-insensitively; deleting users are included and flagged', async () => {
  const f = fixture('super_admin', { users: [
    userRow('u-name', 'Marta Keeper', 'marta@example.com'),
    userRow('u-email', 'Dan O.', 'keeper.marta@example.com'),
    userRow('u-gone', 'Marta Gone', 'gone@example.com', new Date(NOW)),
    userRow('u-none', null, 'noname@example.com'),
  ] });
  const { users, total } = await f.assignment.searchUsers(f.tx,
    { search: 'MARTA', page: 1, pageSize: 20 });
  // Ordered by name; deleting accounts appear flagged (greyed in the picker)
  // and count in the total — the assignment action fails closed on them.
  assert.deepEqual(users.map(row => row.id), ['u-email', 'u-gone', 'u-name']);
  assert.equal(total, 3);
  assert.deepEqual(users.map(row => ({ id: row.id, deleting: row.deleting })),
    [{ id: 'u-email', deleting: false },
      { id: 'u-gone', deleting: true },
      { id: 'u-name', deleting: false }]);
});

test('searchUsers paginates with an exact total and matches either field for one term', async () => {
  // The fixture seeds the default actor/target users; they participate in
  // name-ordered results like any other row.
  const f = fixture('super_admin', { users: [
    userRow('u1', 'Keeper Marta', 'a@example.com'),
    userRow('u2', 'Dan O.', 'keeper.marta@example.com'),
    userRow('u3', 'Zebra', 'z@example.com'),
  ] });
  // 'keeper' matches u1 by name, u2 by email, and the default 'Target Keeper'.
  const both = await f.assignment.searchUsers(f.tx, { search: 'keeper', page: 1, pageSize: 20 });
  assert.deepEqual(both.users.map(row => row.id), ['u2', 'u1', 'user-1']);
  assert.equal(both.total, 3);
  const page2 = await f.assignment.searchUsers(f.tx, { search: '', page: 2, pageSize: 3 });
  // Name order: Dan O.(u2), Keeper Marta(u1), Owner One(owner-1), Target Keeper(user-1), Zebra(u3).
  assert.deepEqual(page2.users.map(row => row.id), ['user-1', 'u3']);
  assert.equal(page2.total, 5);
  const nothing = await f.assignment.searchUsers(f.tx, { search: 'nobody', page: 1, pageSize: 20 });
  assert.deepEqual(nothing.users, []);
  assert.equal(nothing.total, 0);
});

test('endSubscription cancels the row with a now expiry and audits subscription.end', async () => {
  const f = fixture('super_admin', { subscriptions: [activeSub('sub-1')] });
  const before = Date.now();
  const result = await f.assignment.endSubscription(f.tx, 'owner-1', 'sub-1',
    'Ended subscription for user user-1 (Standard MONTHLY)');
  assert.equal(result, 'ended');
  const row = f.subscriptionStore.get('sub-1')!;
  assert.equal(row.status, 'CANCELED');
  assert.ok(row.expiresAt !== null && row.expiresAt.getTime() >= before &&
    row.expiresAt.getTime() <= Date.now(), 'expiresAt should be the wall-clock now');
  assert.deepEqual(f.audits, [{ action: 'subscription.end', targetId: 'sub-1',
    reason: 'Ended subscription for user user-1 (Standard MONTHLY)',
    changes: { planId: 'plan-1', status: 'CANCELED',
      effectiveAt: row.expiresAt!.toISOString() } }]);
});

test('endSubscription fails closed on already-ended or missing subscriptions', async () => {
  const f = fixture('super_admin', { subscriptions: [
    { ...activeSub('sub-already'), status: 'CANCELED', expiresAt: new Date(NOW) },
    { ...activeSub('sub-expired'), status: 'EXPIRED' },
    { ...activeSub('sub-stale'), status: 'ACTIVE', expiresAt: new Date(NOW - 1000) },
  ] });
  for (const id of ['sub-already', 'sub-expired', 'sub-stale', 'sub-missing']) {
    const result = await f.assignment.endSubscription(f.tx, 'owner-1', id,
      'Ended subscription for user user-1 (Standard MONTHLY)');
    assert.ok(isFailure(result), id);
  }
  assert.equal(f.audits.length, 0);
  assert.equal(f.subscriptionStore.get('sub-already')!.status, 'CANCELED');
  assert.equal(f.subscriptionStore.get('sub-expired')!.status, 'EXPIRED');
  assert.equal(f.subscriptionStore.get('sub-stale')!.status, 'ACTIVE');
});

test('endSubscription rejects an empty or unsafe reason without writes', async () => {
  const f = fixture('super_admin', { subscriptions: [activeSub('sub-1')] });
  for (const reason of ['', '   ', 'x'.repeat(501), 'Ended @user']) {
    assert.ok(isFailure(await f.assignment.endSubscription(f.tx, 'owner-1', 'sub-1', reason)),
      JSON.stringify(reason));
  }
  assert.equal(f.audits.length, 0);
  assert.equal(f.subscriptionStore.get('sub-1')!.status, 'ACTIVE');
});

test('a non-super-admin actor cannot end a subscription', async () => {
  const f = fixture('admin', { subscriptions: [activeSub('sub-1')] });
  const result = await f.assignment.endSubscription(f.tx, 'owner-1', 'sub-1',
    'Ended subscription for user user-1 (Standard MONTHLY)');
  assert.ok(isFailure(result));
  assert.equal(f.subscriptionStore.get('sub-1')!.status, 'ACTIVE');
  assert.equal(f.audits.length, 0);
});

test('ending a subscription acquires the subscription row lock inside the transaction', async () => {
  const f = fixture('super_admin', { subscriptions: [activeSub('sub-1')] });
  const locks: Array<{ strings: string[]; values: unknown[] }> = [];
  (f.tx as { $queryRaw: unknown }).$queryRaw = (strings: string[], ...values: unknown[]) => {
    locks.push({ strings, values }); return Promise.resolve([]);
  };
  await f.assignment.endSubscription(f.tx, 'owner-1', 'sub-1',
    'Ended subscription for user user-1 (Standard MONTHLY)');
  assert.equal(locks.length, 1);
  assert.ok(locks[0].strings.join('').includes('FOR UPDATE'));
  assert.ok(locks[0].strings.join('').includes('UserSubscription'));
  assert.ok(locks[0].values.includes('sub-1'));
});

test('endSubscriptionAction derives the audit reason from context without a form reason', async () => {
  const f = fixture('super_admin', { subscriptions: [activeSub('sub-1')] });
  const api = load('../../app/admin/subscriptions/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, _kind: unknown,
      _action: string, work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) =>
      work(f.tx, { id: 'owner-1' }) },
    '@/lib/admin/plan-assignment': f.assignment,
    '@/lib/admin/legacy-entitlements': f.legacy,
  }) as { endSubscriptionAction: (form: FormData) => Promise<unknown> };
  const form = new FormData();
  form.set('subscriptionId', 'sub-1');
  assert.deepEqual(jsonOf(await api.endSubscriptionAction(form)), { success: true });
  assert.equal(f.subscriptionStore.get('sub-1')!.status, 'CANCELED');
  assert.deepEqual(f.audits, [{ action: 'subscription.end', targetId: 'sub-1',
    reason: 'Ended subscription for user user-1 (Standard MONTHLY)',
    changes: { planId: 'plan-1', status: 'CANCELED',
      effectiveAt: f.subscriptionStore.get('sub-1')!.expiresAt!.toISOString() } }]);
});

test('listAssignablePlans returns only active plans with an active-only total', async () => {
  const f = fixture('super_admin');
  f.planStore.set('plan-2', { ...PLAN, id: 'plan-2', name: 'Archived', active: false, sortOrder: 1 });
  f.planStore.set('plan-3', { ...PLAN, id: 'plan-3', name: 'Zebra', sortOrder: 2 });
  const all = await f.assignment.listAssignablePlans(f.tx, { page: 1, pageSize: 20 });
  assert.deepEqual(all.plans.map(plan => plan.id), ['plan-1', 'plan-3']);
  assert.equal(all.total, 2);
  const searched = await f.assignment.listAssignablePlans(f.tx, { search: 'zeb', page: 1, pageSize: 20 });
  assert.deepEqual(searched.plans.map(plan => plan.id), ['plan-3']);
  assert.equal(searched.total, 1);
  const paginated = await f.assignment.listAssignablePlans(f.tx, { page: 2, pageSize: 1 });
  assert.deepEqual(paginated.plans.map(plan => plan.id), ['plan-3']);
  assert.equal(paginated.total, 2);
});

// --- Task 10: bulk keeper assignment (wizard rework) ---

test('listAssignablePlans carries each plan\'s enabled feature names via one grouped query', async () => {
  const f = fixture('super_admin');
  f.planStore.set('plan-3', { ...PLAN, id: 'plan-3', name: 'Zebra', sortOrder: 2 });
  f.featureStore.set('f-1', { name: 'Log feeding' });
  f.featureStore.set('f-2', { name: 'Log hydration' });
  f.featureStore.set('f-3', { name: 'Manage enclosure' });
  f.translationStore.set('t-1', { id: 't-1', planId: 'plan-1', featureId: 'f-2', enabled: true });
  f.translationStore.set('t-2', { id: 't-2', planId: 'plan-1', featureId: 'f-1', enabled: true });
  f.translationStore.set('t-3', { id: 't-3', planId: 'plan-1', featureId: 'f-3', enabled: false });
  f.translationStore.set('t-4', { id: 't-4', planId: 'plan-3', featureId: 'f-2', enabled: true });
  const { plans } = await f.assignment.listAssignablePlans(f.tx, { page: 1, pageSize: 20 });
  const basic = plans.find(plan => plan.id === 'plan-1')!;
  assert.deepEqual(jsonOf(basic.features), ['Log feeding', 'Log hydration'],
    'enabled feature names only, name-ordered — the read-only picker line');
  assert.deepEqual(jsonOf(plans.find(plan => plan.id === 'plan-3')!.features), ['Log hydration']);
  assert.equal(f.translationCalls.length, 1,
    'one grouped translations query for the page, never per-plan');
  const query = f.translationCalls[0] as { where: Record<string, unknown>;
    select: Record<string, unknown> };
  assert.deepEqual(JSON.parse(JSON.stringify(query.where)),
    { planId: { in: ['plan-1', 'plan-3'] }, enabled: true });
  assert.deepEqual(Object.keys(query.select), ['planId', 'feature']);
});

test('assignPlanToUsers assigns every keeper in one transaction: per-user locks, end-dated priors, derived per-user audit reasons', async () => {
  const f = fixture('super_admin', { users: [
    userRow('u-2', 'Marta Keeper', 'marta@example.com'),
    userRow('u-3', 'Dan O.', 'dan@example.com'),
  ], subscriptions: [activeSub('sub-prior', 'u-2')] });
  const locks: Array<{ strings: string[]; values: unknown[] }> = [];
  (f.tx as { $queryRaw: unknown }).$queryRaw = (strings: string[], ...values: unknown[]) => {
    locks.push({ strings, values }); return Promise.resolve([]);
  };
  const result = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { userIds: ['u-2', 'u-3'], planId: 'plan-1', planBillingOptionId: 'opt-1',
      effectiveAt: new Date(NOW) });
  assert.ok(!isFailure(result));
  const { assignments } = result as { assignments: Array<{ userId: string;
    subscriptionId: string }> };
  assert.deepEqual(jsonOf(assignments.map(row => row.userId)), ['u-2', 'u-3']);
  assert.ok(assignments.every(row => f.subscriptionStore.has(row.subscriptionId) &&
    f.subscriptionStore.get(row.subscriptionId)!.status === 'ACTIVE'));
  // The caller's ONE transaction did all the work: a per-user row lock each.
  assert.deepEqual(jsonOf(locks.map(lock => lock.values)), [['u-2'], ['u-3']]);
  assert.ok(locks.every(lock => lock.strings.join('').includes('FOR UPDATE')));
  // Each keeper's prior effective subscription is end-dated first.
  assert.equal(f.subscriptionStore.get('sub-prior')!.status, 'CANCELED');
  assert.deepEqual(f.subscriptionStore.get('sub-prior')!.expiresAt, new Date(NOW));
  // Per-user derived audit reasons (the Task 2 format), one plan.assign each.
  assert.deepEqual(f.audits, [
    { action: 'plan.assign', targetId: 'u-2',
      reason: 'Assigned plan Standard to user u-2 effective 2026-09-26T12:00:00.000Z',
      changes: { planId: 'plan-1', status: 'ACTIVE', effectiveAt: '2026-09-26T12:00:00.000Z' } },
    { action: 'plan.assign', targetId: 'u-3',
      reason: 'Assigned plan Standard to user u-3 effective 2026-09-26T12:00:00.000Z',
      changes: { planId: 'plan-1', status: 'ACTIVE', effectiveAt: '2026-09-26T12:00:00.000Z' } },
  ]);
});

test('assignPlanToUsers aborts the whole batch with a named error before any writes when a keeper is ineligible', async () => {
  const f = fixture('super_admin', { users: [
    userRow('u-2', 'Marta Keeper', 'marta@example.com'),
    userRow('u-3', 'Gone Keeper', 'gone@example.com', new Date(NOW)),
  ] });
  const locks: Array<unknown> = [];
  (f.tx as { $queryRaw: unknown }).$queryRaw = (...args: unknown[]) => {
    locks.push(args); return Promise.resolve([]);
  };
  const deleting = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { userIds: ['u-2', 'u-3'], planId: 'plan-1', planBillingOptionId: 'opt-1',
      effectiveAt: new Date(NOW) });
  assert.ok(isFailure(deleting));
  assert.match((deleting as Error).message, /Gone Keeper/,
    'the error names the ineligible keeper');
  assert.equal(f.subscriptionStore.size, 0, 'never a partial assignment');
  assert.equal(f.audits.length, 0);
  assert.equal(locks.length, 0, 'pre-validation precedes every write, locks included');
  const missing = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { userIds: ['u-2', 'u-missing'], planId: 'plan-1', planBillingOptionId: 'opt-1',
      effectiveAt: new Date(NOW) });
  assert.ok(isFailure(missing));
  assert.match((missing as Error).message, /u-missing/);
  assert.equal(f.subscriptionStore.size, 0);
  assert.equal(f.audits.length, 0);
});

test('assignPlanToUsers rejects a bad plan or option before any writes', async () => {
  const f = fixture('super_admin');
  const base = { userIds: ['user-1'], planId: 'plan-1', planBillingOptionId: 'opt-1',
    effectiveAt: new Date(NOW) };
  f.planStore.set('plan-dead', { ...PLAN, id: 'plan-dead', active: false });
  const inactive = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { ...base, planId: 'plan-dead' });
  assert.ok(isFailure(inactive));
  const foreign = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { ...base, planBillingOptionId: 'opt-9' });
  assert.ok(isFailure(foreign));
  f.optionStore.set('opt-9', { ...MONTHLY, id: 'opt-9', planId: 'plan-9' });
  const mismatch = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { ...base, planBillingOptionId: 'opt-9' });
  assert.ok(isFailure(mismatch));
  assert.equal(f.subscriptionStore.size, 0);
  assert.equal(f.audits.length, 0);
});

test('assignPlanToUsers validates the batch shape: non-empty, deduped, capped, valid date', async () => {
  const f = fixture('super_admin');
  const base = { planId: 'plan-1', planBillingOptionId: 'opt-1', effectiveAt: new Date(NOW) };
  for (const bad of [
    { ...base, userIds: [] },
    { ...base, userIds: ['   '] },
    { ...base, userIds: ['x'.repeat(129)] },
    { ...base, userIds: Array.from({ length: 501 }, (_, index) => `u-${index}`) },
    { ...base, userIds: ['user-1'], effectiveAt: new Date(Number.NaN) },
  ] as Array<{ userIds: string[]; effectiveAt?: Date }>) {
    const result = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
      { ...base, ...bad } as never);
    assert.ok(isFailure(result), JSON.stringify(bad));
  }
  assert.equal(f.audits.length, 0);
  // Duplicate picks collapse (a stale form can repeat an id).
  const duped = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { ...base, userIds: ['user-1', 'user-1'] });
  assert.ok(!isFailure(duped));
  assert.equal((duped as { assignments: unknown[] }).assignments.length, 1);
});

test('a keeper turning ineligible mid-batch aborts the rest — the service reports the failure for the caller\'s rollback', async () => {
  const f = fixture('super_admin', { users: [
    userRow('u-2', 'Marta Keeper', 'marta@example.com'),
    userRow('u-3', 'Dan O.', 'dan@example.com'),
  ] });
  const locks: Array<{ values: unknown[] }> = [];
  (f.tx as { $queryRaw: unknown }).$queryRaw = (strings: string[], ...values: unknown[]) => {
    locks.push({ values });
    // Simulate a concurrent deletion landing between the pre-checks and u-3's
    // row lock (the pre-checks and the lock cannot both be transactionally
    // fresh without serializing the whole table).
    if (locks.length === 2) {
      const vanishing = f.userStore.get('u-3')!;
      vanishing.deletingAt = new Date(NOW);
    }
    return Promise.resolve([]);
  };
  const result = await f.assignment.assignPlanToUsers(f.tx, 'owner-1',
    { userIds: ['u-2', 'u-3'], planId: 'plan-1', planBillingOptionId: 'opt-1',
      effectiveAt: new Date(NOW) });
  assert.ok(isFailure(result), 'the batch fails closed instead of skipping a keeper');
  assert.match((result as Error).message, /u-3|Dan O\./);
  // Writes for u-2 already happened in the fake store — production semantics
  // roll them back: the caller (withAdminControl's prisma.$transaction) throws
  // on this returned error, so nothing commits. Pinned at the action level.
});

// --- Task 11: virtual subscriptions pivot ------------------------------------

const legacyUser = (id: string, name: string, email: string, plan: string,
  deletingAt: Date | null = null): UserRow =>
  ({ id, name, email, role: 'user', plan, deletingAt });
/** The resolver's two designation-holder plans (created by the retired backfill). */
const seedLegacyPlans = (f: ReturnType<typeof fixture>) => {
  f.planStore.set('plan-free-legacy',
    { ...PLAN, id: 'plan-free-legacy', name: 'Free – Legacy', sortOrder: 1 });
  f.planStore.set('plan-pro-legacy',
    { ...PLAN, id: 'plan-pro-legacy', name: 'Pro – Legacy', sortOrder: 2 });
};

test('listAssignablePlans excludes the legacy plans by name (the wizard never offers them)', async () => {
  const f = fixture('super_admin');
  seedLegacyPlans(f);
  const all = await f.assignment.listAssignablePlans(f.tx, { page: 1, pageSize: 20 });
  assert.deepEqual(all.plans.map(plan => plan.id), ['plan-1'],
    'the two legacy plans never join the assignable set');
  assert.equal(all.total, 1);
  // The exclusion holds under search — searching "Legacy" matches nothing.
  const searched = await f.assignment.listAssignablePlans(f.tx,
    { search: 'legacy', page: 1, pageSize: 20 });
  assert.deepEqual(searched.plans.map(plan => plan.id), []);
  assert.equal(searched.total, 0);
  // LEGACY_PLAN_NAMES is the single-source mapping exported for the exclusion.
  assert.deepEqual([...f.legacy.LEGACY_PLAN_NAMES], ['Free – Legacy', 'Pro – Legacy']);
});

test('listEffectiveSubscriptions renders tier-derived virtual rows for legacy-tier users without an effective subscription', async () => {
  const f = fixture('super_admin', { users: [
    legacyUser('u-free', 'Free Fiona', 'fiona@example.com', 'free'),
    legacyUser('u-pro', 'Pro Percy', 'percy@example.com', 'pro'),
    legacyUser('u-covered', 'Covered Carla', 'carla@example.com', 'free'),
    legacyUser('u-null', 'Null Nate', 'nate@example.com', ''),
    legacyUser('u-other', 'Other Ola', 'ola@example.com', 'premium'),
  ], subscriptions: [
    { id: 'sub-c', userId: 'u-covered', planId: 'plan-1', planBillingOptionId: 'opt-1',
      status: 'ACTIVE', startedAt: new Date(NOW - 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
  ] });
  seedLegacyPlans(f);
  const { rows, total } = await f.assignment.listEffectiveSubscriptions(f.tx);
  // Real rows first (startedAt desc), then tier-derived rows (name order);
  // a covered user shows their REAL row instead — active sub wins.
  assert.deepEqual(jsonOf(rows).map(row => row.id), ['sub-c', 'tier:u-free', 'tier:u-pro']);
  assert.equal(total, 3);
  const virtual = jsonOf(rows.filter(row => row.source === 'tier'));
  assert.deepEqual(virtual.map(row =>
    [row.id, row.userId, row.tierKey, row.planName, row.planId]), [
    ['tier:u-free', 'u-free', 'free', 'Free – Legacy', 'plan-free-legacy'],
    ['tier:u-pro', 'u-pro', 'pro', 'Pro – Legacy', 'plan-pro-legacy'],
  ], 'the mapped legacy plan names carry the display name and the designation-holder id');
  assert.ok(virtual.every(row => row.status === 'LEGACY' && row.planBillingOptionId === '' &&
    row.optionInterval === null && row.optionPriceCents === null &&
    row.renewsAt === null && row.expiresAt === null),
    'derived rows carry no stored-subscription fields');
  // Real rows carry the subscription marker and never a tierKey.
  const real = JSON.parse(JSON.stringify(rows.find(row => row.id === 'sub-c')));
  assert.equal(real.source, 'subscription');
  assert.equal(real.tierKey, null);
  assert.deepEqual(real.planOptions, [{ id: 'opt-1', interval: 'MONTHLY',
    basePriceCents: 900, active: true }], 'real rows carry their plan\'s active options (the edit form)');
});

test('listEffectiveSubscriptions search spans the union: keeper, legacy plan name, and the derived marker', async () => {
  const f = fixture('super_admin', { users: [
    legacyUser('u-free', 'Free Fiona', 'fiona@example.com', 'free'),
    legacyUser('u-pro', 'Pro Percy', 'percy@example.com', 'pro'),
  ], subscriptions: [
    { id: 'sub-c', userId: 'user-1', planId: 'plan-1', planBillingOptionId: 'opt-1',
      status: 'ACTIVE', startedAt: new Date(NOW - 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
  ] });
  seedLegacyPlans(f);
  const byKeeper = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'percy', page: 1, pageSize: 20 });
  assert.deepEqual(jsonOf(byKeeper.rows).map(row => row.id), ['tier:u-pro']);
  assert.equal(byKeeper.total, 1);
  const byPlan = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'legacy', page: 1, pageSize: 20 });
  assert.deepEqual(jsonOf(byPlan.rows).map(row => row.id), ['tier:u-free', 'tier:u-pro'],
    'the mapped legacy plan names (and the derived marker) match');
  const real = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'target', page: 1, pageSize: 20 });
  assert.deepEqual(jsonOf(real.rows).map(row => row.id), ['sub-c'],
    'a covered user matches through their real row only');
  const nothing = await f.assignment.listEffectiveSubscriptions(f.tx,
    { search: 'zzz', page: 1, pageSize: 20 });
  assert.deepEqual(jsonOf(nothing.rows), []);
  assert.equal(nothing.total, 0);
});

test('listEffectiveSubscriptions paginates across the union with an exact total', async () => {
  const f = fixture('super_admin', { users: [
    legacyUser('u-free', 'Free Fiona', 'fiona@example.com', 'free'),
    legacyUser('u-pro', 'Pro Percy', 'percy@example.com', 'pro'),
  ], subscriptions: [
    { id: 'sub-old', userId: 'user-1', planId: 'plan-1', planBillingOptionId: 'opt-1',
      status: 'ACTIVE', startedAt: new Date(NOW - 2 * 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
    { id: 'sub-new', userId: 'user-1', planId: 'plan-1', planBillingOptionId: 'opt-1',
      status: 'TRIALING', startedAt: new Date(NOW - 86_400_000), renewsAt: null, expiresAt: null,
      createdAt: new Date(0), updatedAt: new Date(0) },
  ] });
  seedLegacyPlans(f);
  // Hmm: one user holding two effective rows is impossible in production
  // (assignments end-date priors) but the union counts rows, not users.
  const pages = [];
  for (let page = 1; page <= 5; page++)
    pages.push(await f.assignment.listEffectiveSubscriptions(f.tx, { page, pageSize: 1 }));
  assert.deepEqual(pages.map(result => jsonOf(result.rows).map(row => row.id)), [
    ['sub-new'], ['sub-old'], ['tier:u-free'], ['tier:u-pro'], [],
  ], 'real rows first (newest first), then tier-derived rows (name order)');
  assert.ok(pages.every(result => result.total === 4), 'the total stays the union size');
  // An empty page beyond the union returns no rows but keeps the total honest.
});

test('editSubscriptionAction supersedes the row via the audited assignment service with a derived reason', async () => {
  const f = fixture('super_admin', { subscriptions: [activeSub('sub-1')] });
  f.optionStore.set('opt-2', { ...MONTHLY, id: 'opt-2', interval: 'ANNUAL', basePriceCents: 9000 });
  const api = load('../../app/admin/subscriptions/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, _kind: unknown,
      _action: string, work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) =>
      work(f.tx, { id: 'owner-1' }) },
    '@/lib/admin/plan-assignment': f.assignment,
    '@/lib/admin/legacy-entitlements': f.legacy,
  }) as { editSubscriptionAction: (form: FormData) => Promise<unknown> };
  const form = new FormData();
  form.set('subscriptionId', 'sub-1');
  form.set('planBillingOptionId', 'opt-2');
  form.set('effectiveAt', '2026-09-28T00:00:00.000Z');
  assert.deepEqual(jsonOf(await api.editSubscriptionAction(form)), { success: true });
  // Supersede semantics: the prior row end-dated as of the effective date, one
  // new ACTIVE row on the chosen option.
  assert.equal(f.subscriptionStore.get('sub-1')!.status, 'CANCELED');
  assert.equal(f.subscriptionStore.get('sub-1')!.expiresAt!.getTime(),
    new Date('2026-09-28T00:00:00.000Z').getTime(), 'the prior row is end-dated as of the effective date');
  const created = [...f.subscriptionStore.values()].find(row => row.id !== 'sub-1')!;
  assert.equal(created.status, 'ACTIVE');
  assert.equal(created.planId, 'plan-1', 'the row\'s own plan is kept');
  assert.equal(created.planBillingOptionId, 'opt-2');
  assert.equal(created.startedAt.getTime(), new Date('2026-09-28T00:00:00.000Z').getTime());
  assert.deepEqual(f.audits, [{ action: 'plan.assign', targetId: 'user-1',
    reason: 'Edited subscription for user user-1 (Standard ANNUAL) effective 2026-09-28T00:00:00.000Z',
    changes: { planId: 'plan-1', status: 'ACTIVE', effectiveAt: '2026-09-28T00:00:00.000Z' } }]);
});

test('editSubscriptionAction fails closed on an ended row, a foreign option, and a missing row — no writes', async () => {
  const f = fixture('super_admin', { subscriptions: [
    { ...activeSub('sub-ended'), status: 'CANCELED', expiresAt: new Date(NOW) },
    activeSub('sub-live'),
  ] });
  f.optionStore.set('opt-9', { ...MONTHLY, id: 'opt-9', planId: 'plan-9' });
  const api = load('../../app/admin/subscriptions/actions.ts', {
    'next/cache': { revalidatePath: () => {} },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/mutation-boundary': { withMutation: async (_form: unknown, _kind: unknown,
      _action: string, work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { withAdminControl: async (work: (tx: unknown, actor: unknown) => Promise<unknown>) =>
      work(f.tx, { id: 'owner-1' }) },
    '@/lib/admin/plan-assignment': f.assignment,
    '@/lib/admin/legacy-entitlements': f.legacy,
  }) as { editSubscriptionAction: (form: FormData) => Promise<unknown> };
  const attempt = async (subscriptionId: string, planBillingOptionId: string) => {
    const form = new FormData();
    form.set('subscriptionId', subscriptionId);
    form.set('planBillingOptionId', planBillingOptionId);
    form.set('effectiveAt', '2026-09-28T00:00:00.000Z');
    return jsonOf(await api.editSubscriptionAction(form)) as { error: string };
  };
  assert.match((await attempt('sub-ended', 'opt-1')).error, /already ended/);
  assert.match((await attempt('sub-live', 'opt-9')).error, /does not belong/);
  assert.match((await attempt('sub-missing', 'opt-1')).error, /no longer exists/);
  assert.match((await attempt('', 'opt-1')).error, /subscription is required/);
  assert.equal(f.subscriptionStore.get('sub-ended')!.status, 'CANCELED');
  assert.equal(f.subscriptionStore.get('sub-live')!.status, 'ACTIVE');
  assert.equal(f.subscriptionStore.size, 2, 'no supersede writes on any failure');
  assert.equal(f.audits.length, 0);
});
