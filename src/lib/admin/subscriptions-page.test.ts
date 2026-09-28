import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

type Element = { type: string; props: Record<string, unknown> & { children?: unknown } };

function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as Element;
  if (typeof item.type === 'function') return elements((item.type as (props: unknown) => unknown)(item.props));
  const children = Array.isArray(item.props.children) ? item.props.children : [item.props.children];
  return [item, ...children.flatMap((child) => elements(child))];
}

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).filter(Boolean).join(' ');
  if (!node || typeof node !== 'object' || !('props' in node)) return '';
  const item = node as Element & { type?: unknown };
  if (typeof item.type === 'function') return text((item.type as (props: unknown) => unknown)(item.props));
  return text(item.props.children);
}

function textOf(tree: unknown): string {
  return text(tree).replace(/\s+/g, ' ').trim();
}

/** Renders the server component through the repo's transpile-and-run pattern.
 * Wizard/list interaction behavior is pinned in assign-plan-wizard.test.ts and
 * selection-list.test.ts; here we pin the server-owned concerns. */
function loadSubscriptionsPage() {
  const helperCode = ts.transpileModule(
    readFileSync(new URL('./paginated-list.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helperExports: Record<string, unknown> = {};
  runInNewContext(helperCode, { exports: helperExports });
  const code = ts.transpileModule(
    readFileSync(new URL('../../app/admin/subscriptions/page.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const pageExports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports: pageExports,
    URLSearchParams,
    require: (name: string) => {
      if (name === '@/lib/admin/paginated-list') return helperExports;
      if (name === 'react/jsx-runtime') return jsx;
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return pageExports.default as (input: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
}

type Row = { id: string; userId: string; planId: string; planBillingOptionId: string;
  status: string; startedAt: Date; renewsAt: Date | null; expiresAt: Date | null;
  userName: string | null; userEmail: string | null; planName: string | null;
  optionInterval: string | null; optionPriceCents: number | null;
  source: 'subscription' | 'tier'; tierKey: string | null;
  planOptions: Array<{ id: string; interval: string; basePriceCents: number; active: boolean }> };

let capturedSubQueries: Array<{ search: string; page: number; pageSize: number }> = [];
let capturedUserQueries: Array<{ search: string; page: number; pageSize: number }> = [];
let capturedPlanQueries: Array<{ search: string; page: number; pageSize: number }> = [];
let capturedWizardProps: Array<Record<string, unknown>> = [];
let capturedListProps: Array<Record<string, unknown>> = [];
let servedRows: Row[] = [];
let servedSubTotal = 0;
let servedUsers: Array<{ id: string; name: string; email: string; deleting: boolean }> = [];
let servedUserTotal = 0;
let servedPlans: Array<{ id: string; name: string; planType: string; billingOptionCount: number;
  billingOptions: Array<{ id: string; interval: string; basePriceCents: number; active: boolean }>;
  features: string[] }> = [];
let servedPlanTotal = 0;
const dbUsers: Record<string, { id: string; name: string; email: string }> = {};
const dbPlans: Record<string, { id: string; name: string; planType: string;
  billingOptions: Array<{ id: string; interval: string; basePriceCents: number; active: boolean }> }> = {};

const deps: Record<string, unknown> = {
  // ts.transpileModule applies no esModuleInterop, so the default import reads .default directly.
  'next/link': { default: ({ href, children, className }: { href: string; children?: unknown; className?: string }) =>
    jsx.jsx('a', { href, className, children }) },
  '@/components/admin/list-shared': { badgeOnClass: 'badge-on', badgeOffClass: 'badge-off' },
  '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'actor-1' }) },
  '@/lib/db': { prisma: {
    user: { findUnique: async ({ where: { id } }: { where: { id: string } }) => dbUsers[id] ?? null },
    plan: { findUnique: async ({ where: { id } }: { where: { id: string } }) => dbPlans[id] ?? null },
  } },
  '@/lib/admin/plan-assignment': {
    listEffectiveSubscriptions: async (_tx: unknown, query: { search: string; page: number; pageSize: number }) => {
      capturedSubQueries.push({ ...query });
      const start = (query.page - 1) * query.pageSize;
      return { rows: servedRows.slice(start, start + query.pageSize), total: servedSubTotal };
    },
    searchUsers: async (_tx: unknown, query: { search: string; page: number; pageSize: number }) => {
      capturedUserQueries.push({ ...query });
      const start = (query.page - 1) * query.pageSize;
      return { users: servedUsers.slice(start, start + query.pageSize), total: servedUserTotal };
    },
    listAssignablePlans: async (_tx: unknown, query: { search: string; page: number; pageSize: number }) => {
      capturedPlanQueries.push({ ...query });
      const start = (query.page - 1) * query.pageSize;
      return { plans: servedPlans.slice(start, start + query.pageSize), total: servedPlanTotal };
    },
  },
  // The client wizard owns the fold/step interactions (see assign-plan-wizard.test.ts);
  // the page passes it the server-fed picker pages plus the URL wizard state.
  '@/components/admin/assign-plan-wizard': { AssignPlanWizard: (props: Record<string, unknown>) => {
    capturedWizardProps.push({ ...props });
    return jsx.jsx('div', { 'data-wizard': true, 'data-step': props.step,
      'data-user': ((props.prefilledKeepers ?? []) as Array<{ id?: string }>)
        .map(keeper => keeper.id ?? '').join(',') });
  } },
  // The list section is a client island (headless narrowing owns the search);
  // the page pins the server-owned props, the component test pins the rows.
  '@/components/admin/subscriptions-list': { SubscriptionsList: (props: Record<string, unknown>) => {
    capturedListProps.push({ ...props });
    return jsx.jsx('div', { 'data-subscriptions-list': true });
  } },
  '@/components/ui/button': {
    Button: ({ variant, size, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props }),
    buttonVariants: ({ variant, size }: { variant?: string; size?: string } = {}) =>
      `variant-${variant ?? 'primary'} size-${size ?? 'md'}`,
  },
  '@/components/ui/card': { cardClassName: 'card' },
  '@/lib/utils': { cn: (...parts: unknown[]) => parts.filter(Boolean).join(' ') },
  '@/components/mutation-form': { MutationForm: ({ action, children, ...props }: Record<string, unknown>) =>
    jsx.jsx('form', { ...props, 'data-action': String(action), children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  './actions': { endSubscriptionAction: 'end-action' },
};

const SubscriptionsPage = loadSubscriptionsPage();

/** Wizard props built inside the vm sandbox carry sandbox-realm object
 * prototypes; JSON copies make strict deep-equality local. */
const jsonOf = (value: unknown) => JSON.parse(JSON.stringify(value));

const render = async (params: Record<string, string> = {}) =>
  SubscriptionsPage({ searchParams: Promise.resolve(params) });

const row = (overrides: Partial<Row> = {}): Row => ({
  id: 'sub-1', userId: 'u-1', planId: 'p-1', planBillingOptionId: 'o-1', status: 'ACTIVE',
  startedAt: new Date('2026-08-01T00:00:00Z'), renewsAt: new Date('2026-09-01T00:00:00Z'),
  expiresAt: null, userName: 'Marta Keeper', userEmail: 'marta@example.com',
  planName: 'Pro', optionInterval: 'MONTHLY', optionPriceCents: 499,
  source: 'subscription', tierKey: null,
  planOptions: [{ id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
    { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true }],
  ...overrides });

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    inputs: all.filter(item => item.type === 'input'),
    forms: all.filter(item => item.type === 'form'),
  };
}

test('renders the current subscriptions section with the keeper rows fed to the client island', async () => {
  capturedSubQueries = []; capturedWizardProps = []; capturedListProps = [];
  servedRows = [
    row(),
    row({ id: 'sub-2', userId: 'u-2', status: 'PAST_DUE', startedAt: new Date('2026-07-30T00:00:00Z'),
      renewsAt: null, expiresAt: new Date('2026-09-28T00:00:00Z'), userName: 'Dan O.',
      userEmail: 'dan@example.com', planName: 'Basic', optionInterval: 'ANNUAL', optionPriceCents: 1999 }),
  ];
  servedSubTotal = 2;
  const tree = await render();
  assert.match(textOf(tree), /2 effective/);
  assert.match(textOf(tree), /tier-derived legacy rows/,
    'the header copy describes the union honestly');
  // The client island receives the serializable row data for the committed view.
  const list = jsonOf(capturedListProps)[0] as Record<string, unknown>;
  assert.deepEqual(list.rows, [
    { id: 'sub-1', userId: 'u-1', planId: 'p-1', planBillingOptionId: 'o-1', status: 'ACTIVE',
      startedAt: '2026-08-01T00:00:00.000Z', renewsAt: '2026-09-01T00:00:00.000Z', expiresAt: null,
      userName: 'Marta Keeper', userEmail: 'marta@example.com', planName: 'Pro',
      optionInterval: 'MONTHLY', optionPriceCents: 499,
      source: 'subscription', tierKey: null,
      planOptions: [{ id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
        { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true }] },
    { id: 'sub-2', userId: 'u-2', planId: 'p-1', planBillingOptionId: 'o-1', status: 'PAST_DUE',
      startedAt: '2026-07-30T00:00:00.000Z', renewsAt: null, expiresAt: '2026-09-28T00:00:00.000Z',
      userName: 'Dan O.', userEmail: 'dan@example.com', planName: 'Basic',
      optionInterval: 'ANNUAL', optionPriceCents: 1999,
      source: 'subscription', tierKey: null,
      planOptions: [{ id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
        { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true }] },
  ]);
  assert.equal(list.total, 2);
  assert.equal(list.page, 1);
  assert.equal(list.lastPage, 1);
  assert.equal(list.search, '');
  // The wizard is closed without the URL flag.
  assert.equal(elements(tree).some(item => item.props['data-wizard'] === true), false);
  // The add button targets a fresh wizard.
  const add = elementsOf(tree).links.find(link => textOf(link).includes('Add subscription'));
  assert.equal(add?.props.href, '/admin/subscriptions?wizard=open&step=1');
  assert.deepEqual(capturedSubQueries, [{ search: '', page: 1, pageSize: 20 }]);
});

test('tier-derived rows pass through to the client island with their source markers', async () => {
  capturedListProps = [];
  servedRows = [{ ...row(), id: 'tier:u-9', userId: 'u-9', status: 'LEGACY',
    source: 'tier', tierKey: 'free', planName: 'Free – Legacy',
    planBillingOptionId: '', optionInterval: null, optionPriceCents: null,
    planOptions: [], startedAt: new Date(0), renewsAt: null, expiresAt: null }];
  servedSubTotal = 1;
  const tree = await render();
  elementsOf(tree);
  const list = jsonOf(capturedListProps)[0] as { rows: Array<Record<string, unknown>> };
  assert.deepEqual(list.rows[0], { id: 'tier:u-9', userId: 'u-9', planId: 'p-1',
    planBillingOptionId: '', status: 'LEGACY', startedAt: '1970-01-01T00:00:00.000Z',
    renewsAt: null, expiresAt: null, userName: 'Marta Keeper', userEmail: 'marta@example.com',
    planName: 'Free – Legacy', optionInterval: null, optionPriceCents: null,
    source: 'tier', tierKey: 'free', planOptions: [] });
});

test('the list is paginated at 20 with URL-driven pages and honest page counts', async () => {
  capturedSubQueries = []; capturedListProps = [];
  servedRows = Array.from({ length: 25 }, (_, index) =>
    row({ id: `sub-${index + 1}`, userId: `u-${index + 1}`, userName: `Keeper ${index + 1}` }));
  servedSubTotal = 25;
  const page1 = await render({ search: 'keeper' });
  assert.deepEqual(capturedSubQueries, [{ search: 'keeper', page: 1, pageSize: 20 }]);
  elementsOf(page1);
  assert.equal(jsonOf(capturedListProps)[0].lastPage, 2, 'the pager denominators stay server-clamped');
  const page2 = await render({ page: '2' });
  elementsOf(page2);
  assert.equal(jsonOf(capturedListProps.at(-1)).page, 2);
  // An out-of-range page re-queries the last valid page.
  capturedSubQueries = [];
  await render({ page: '99' });
  assert.deepEqual(capturedSubQueries,
    [{ search: '', page: 99, pageSize: 20 }, { search: '', page: 2, pageSize: 20 }]);
});

test('wizard params ride along on list navigation so an assignment survives', async () => {
  capturedListProps = [];
  servedRows = [row()]; servedSubTotal = 1;
  dbUsers['u-1'] = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };
  await render({ wizard: 'open', step: '2', user: 'u-1', search: 'keeper' }).then(elementsOf);
  const list = jsonOf(capturedListProps)[0] as Record<string, unknown>;
  assert.deepEqual(jsonOf(list.wizardParams), { wizard: 'open', step: '2', user: 'u-1' });
});

test('＋ Add subscription unfolds the wizard above the list with the keeper step', async () => {
  capturedWizardProps = []; capturedUserQueries = [];
  servedRows = [row()]; servedSubTotal = 1;
  servedUsers = [{ id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com', deleting: false }];
  servedUserTotal = 1;
  const tree = await render({ wizard: 'open' });
  // Resolving the tree invokes the stubs (wizard + list captures).
  const flat = elements(tree);
  assert.deepEqual(jsonOf(capturedWizardProps), [{
    step: 1, listSearch: '', listPage: 1, prefilledKeepers: [],
    selectedPlan: null, selectedOptionId: '',
    userPicker: { rows: [{ id: 'u-1', title: 'Marta Keeper', subtitle: 'marta@example.com',
          leading: 'MK', disabled: false }],
      total: 1, page: 1, pageSize: 20, search: '' },
    planPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
  }]);
  assert.deepEqual(capturedUserQueries, [{ search: '', page: 1, pageSize: 20 }]);
  // List-first: the wizard sits above the always-rendered list section.
  const wizardIndex = flat.findIndex(item => item.props['data-wizard'] === true);
  const listIndex = flat.findIndex(item => item.props['data-subscriptions-list'] === true);
  assert.ok(listIndex > wizardIndex, 'wizard above the list island');
});

test('Reassign opens the wizard at step 2 with that keeper preselected for the batch', async () => {
  capturedWizardProps = [];
  servedRows = Array.from({ length: 45 }, (_, index) =>
    row({ id: `sub-${index + 1}`, userId: `u-${index + 1}`, userName: `Keeper ${index + 1}` }));
  servedSubTotal = 45;
  dbUsers['u-1'] = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };
  const tree = await render({ wizard: 'open', step: '2', user: 'u-1', search: 'keeper', page: '2' });
  elementsOf(tree);
  assert.deepEqual(jsonOf(capturedWizardProps), [{
    step: 2, listSearch: 'keeper', listPage: 2, selectedOptionId: '',
    prefilledKeepers: [{ id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' }],
    selectedPlan: null,
    // The keeper picker page is always served while the wizard is open.
    userPicker: { rows: [{ id: 'u-1', title: 'Marta Keeper', subtitle: 'marta@example.com',
          leading: 'MK', disabled: false }],
      total: 1, page: 1, pageSize: 20, search: '' },
    planPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
  }]);
  // Row actions (Reassign/End) live in the client island and are pinned there.
});

test('step 3 receives the chosen plan with its billing options', async () => {
  capturedWizardProps = [];
  servedRows = []; servedSubTotal = 0;
  dbUsers['u-1'] = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };
  dbPlans['p-1'] = { id: 'p-1', name: 'Pro', planType: 'STANDARD', billingOptions: [
    { id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
    { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true },
  ] };
  const tree = await render({ wizard: 'open', step: '3', user: 'u-1', plan: 'p-1', option: 'o-1' });
  elementsOf(tree);
  assert.deepEqual(jsonOf(capturedWizardProps), [{
    step: 3, listSearch: '', listPage: 1,
    prefilledKeepers: [{ id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' }],
    selectedPlan: { id: 'p-1', name: 'Pro', planType: 'STANDARD', billingOptions: [
      { id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
      { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true },
    ] },
    selectedOptionId: 'o-1',
    userPicker: { rows: [{ id: 'u-1', title: 'Marta Keeper', subtitle: 'marta@example.com',
          leading: 'MK', disabled: false }],
      total: 1, page: 1, pageSize: 20, search: '' },
    planPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
  }]);
});

test('wizard steps clamp to what the URL state supports', async () => {
  capturedWizardProps = []; servedRows = []; servedSubTotal = 0;
  elementsOf(await render({ wizard: 'open', step: '9' }));
  assert.equal(capturedWizardProps[0]?.step, 1, 'nonsense step → step 1');
  elementsOf(await render({ wizard: 'open', step: '3', user: 'u-1' }));
  assert.equal(capturedWizardProps[1]?.step, 2, 'no plan yet → step 2');
  elementsOf(await render({ wizard: 'open', step: '3', plan: 'p-9' }));
  assert.equal(capturedWizardProps[2]?.step, 2, 'an unknown plan folds to step 2');
  // Steps beyond 1 no longer require a `user` URL param: the keeper selection
  // is client-owned (the tray); the view clamps when the batch is empty.
  elementsOf(await render({ wizard: 'open', step: '3', plan: 'p-1' }));
  assert.equal(capturedWizardProps[3]?.step, 3, 'plan present → the step stands');
});

test('the plan step is served active plans with search and pagination (and read-only feature names)', async () => {
  capturedWizardProps = []; capturedPlanQueries = [];
  servedRows = []; servedSubTotal = 0;
  dbUsers['u-1'] = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };
  servedPlans = [
    { id: 'p-1', name: 'Pro', planType: 'STANDARD', billingOptionCount: 2,
      features: ['Log feeding', 'Log hydration'],
      billingOptions: [{ id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
        { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true }] },
    { id: 'p-2', name: 'Basic', planType: 'STANDARD', billingOptionCount: 2, features: [],
      billingOptions: [{ id: 'o-3', interval: 'MONTHLY', basePriceCents: 199, active: true },
        { id: 'o-4', interval: 'ANNUAL', basePriceCents: 1999, active: true }] },
  ];
  servedPlanTotal = 45;
  // Row mapping on page 1.
  elementsOf(await render({ wizard: 'open', step: '2', user: 'u-1' }));
  const first = jsonOf(capturedWizardProps)[0] as { planPicker: Record<string, unknown>; step: number };
  assert.equal(first.step, 2);
  assert.deepEqual(first.planPicker, {
    rows: [
      { id: 'p-1', title: 'Pro', subtitle: 'Standard · 2 options',
        features: ['Log feeding', 'Log hydration'] },
      { id: 'p-2', title: 'Basic', subtitle: 'Standard · 2 options', features: [] },
    ],
    total: 45, page: 1, pageSize: 20, search: '',
  });
  // Search and page come from the wizard's URL params.
  elementsOf(await render({ wizard: 'open', step: '2', user: 'u-1', psearch: 'pro', ppage: '2' }));
  assert.deepEqual(capturedPlanQueries, [
    { search: '', page: 1, pageSize: 20 }, { search: 'pro', page: 2, pageSize: 20 }]);
  const second = jsonOf(capturedWizardProps)[1] as { planPicker: Record<string, unknown> };
  assert.equal(second.planPicker.page, 2);
  assert.equal(second.planPicker.search, 'pro');
  assert.equal(second.planPicker.total, 45);
});
