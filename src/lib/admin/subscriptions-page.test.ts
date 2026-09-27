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
  optionInterval: string | null; optionPriceCents: number | null };

let capturedSubQueries: Array<{ search: string; page: number; pageSize: number }> = [];
let capturedUserQueries: Array<{ search: string; page: number; pageSize: number }> = [];
let capturedPlanQueries: Array<{ search: string; page: number; pageSize: number }> = [];
let capturedWizardProps: Array<Record<string, unknown>> = [];
let servedRows: Row[] = [];
let servedSubTotal = 0;
let servedUsers: Array<{ id: string; name: string; email: string }> = [];
let servedUserTotal = 0;
let servedPlans: Array<{ id: string; name: string; planType: string; billingOptionCount: number;
  billingOptions: Array<{ id: string; interval: string; basePriceCents: number; active: boolean }> }> = [];
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
      'data-user': (props.selectedUser as { id?: string } | null)?.id ?? '' });
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
  planName: 'Pro', optionInterval: 'MONTHLY', optionPriceCents: 499, ...overrides });

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    inputs: all.filter(item => item.type === 'input'),
    forms: all.filter(item => item.type === 'form'),
  };
}

test('renders the current subscriptions list with keeper, plan, badge, and dates', async () => {
  capturedSubQueries = []; capturedWizardProps = [];
  servedRows = [
    row(),
    row({ id: 'sub-2', userId: 'u-2', status: 'PAST_DUE', startedAt: new Date('2026-07-30T00:00:00Z'),
      renewsAt: null, expiresAt: new Date('2026-09-28T00:00:00Z'), userName: 'Dan O.',
      userEmail: 'dan@example.com', planName: 'Basic', optionInterval: 'ANNUAL', optionPriceCents: 1999 }),
  ];
  servedSubTotal = 2;
  const tree = await render();
  const rendered = textOf(tree);
  assert.match(rendered, /Marta Keeper/);
  assert.match(rendered, /marta@example\.com/);
  assert.match(rendered, /Pro · Monthly — \$4\.99/);
  assert.match(rendered, /Basic · Annual — \$19\.99/);
  assert.match(rendered, /Active/);
  assert.match(rendered, /Past due/);
  assert.match(rendered, /since 2026-08-01 · renews 2026-09-01/);
  assert.match(rendered, /since 2026-07-30 · ends 2026-09-28/);
  assert.match(rendered, /2 effective subscriptions/);
  // List-first: the search form and rows are the primary content.
  assert.equal(elementsOf(tree).inputs.some(input => input.props.name === 'search'), true);
  assert.equal(elementsOf(tree).links.some(link => textOf(link) === 'Next'), false);
  // The wizard is closed without the URL flag.
  assert.equal(elements(tree).some(item => item.props['data-wizard'] === true), false);
  // The add button targets a fresh wizard.
  const add = elementsOf(tree).links.find(link => textOf(link).includes('Add subscription'));
  assert.equal(add?.props.href, '/admin/subscriptions?wizard=open&step=1');
  assert.deepEqual(capturedSubQueries, [{ search: '', page: 1, pageSize: 20 }]);
});

test('the list is searchable and paginated at 20 with URL-driven pages', async () => {
  capturedSubQueries = [];
  servedRows = Array.from({ length: 25 }, (_, index) =>
    row({ id: `sub-${index + 1}`, userId: `u-${index + 1}`, userName: `Keeper ${index + 1}` }));
  servedSubTotal = 25;
  const page1 = await render({ search: 'keeper' });
  assert.deepEqual(capturedSubQueries, [{ search: 'keeper', page: 1, pageSize: 20 }]);
  assert.equal(elements(page1).filter(item => item.props['data-subscription-row']).length, 20);
  assert.match(textOf(page1), /Page 1 of 2/);
  const next = elementsOf(page1).links.find(link => textOf(link) === 'Next');
  assert.equal(next?.props.href, '/admin/subscriptions?search=keeper&page=2');
  const page2 = await render({ page: '2' });
  const prev = elementsOf(page2).links.find(link => textOf(link) === 'Previous');
  // Default params are dropped from URLs.
  assert.equal(prev?.props.href, '/admin/subscriptions');
  assert.match(textOf(page2), /Page 2 of 2/);
  // An out-of-range page re-queries the last valid page.
  capturedSubQueries = [];
  await render({ page: '99' });
  assert.deepEqual(capturedSubQueries,
    [{ search: '', page: 99, pageSize: 20 }, { search: '', page: 2, pageSize: 20 }]);
});

test('rows are freestanding hover-tinted elements and badges are theme-token driven', async () => {
  servedRows = [
    row(),
    row({ id: 'sub-2', userId: 'u-2', status: 'PAST_DUE', userName: 'Dan O.',
      userEmail: 'dan@example.com' }),
  ];
  servedSubTotal = 2;
  const tree = await render();
  const rows = elements(tree).filter((item) => item.props['data-subscription-row']);
  assert.equal(rows.length, 2);
  for (const rowEl of rows) {
    const cls = String(rowEl.props.className);
    assert.equal(cls.split(' ').includes('card'), false, 'rows are freestanding, not card-enclosed');
    assert.equal(cls.includes('hover:bg-[var(--hover)]'), true, 'mockup hover tint');
  }
  const source = readFileSync(new URL('../../app/admin/subscriptions/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:emerald|sky|amber|teal|indigo)-\d00/,
    'status badges must come from theme tokens');
});

test('＋ Add subscription unfolds the wizard above the list with the user step', async () => {
  capturedWizardProps = []; capturedUserQueries = [];
  servedRows = [row()]; servedSubTotal = 1;
  servedUsers = [{ id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' }];
  servedUserTotal = 1;
  const tree = await render({ wizard: 'open' });
  const flat = elements(tree);
  const wizardIndex = flat.findIndex(item => item.props['data-wizard'] === true);
  const rowIndex = flat.findIndex(item => item.props['data-subscription-row']);
  assert.ok(wizardIndex >= 0, 'wizard not rendered');
  assert.ok(rowIndex > wizardIndex, 'wizard must sit above the list');
  assert.deepEqual(jsonOf(capturedWizardProps), [{
    step: 1, listSearch: '', listPage: 1, selectedUser: null, selectedPlan: null,
    selectedOptionId: '',
    userPicker: { rows: [{ id: 'u-1', title: 'Marta Keeper', subtitle: 'marta@example.com',
          leading: 'MK' }],
      total: 1, page: 1, pageSize: 20, search: '' },
    planPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
  }]);
  assert.deepEqual(capturedUserQueries, [{ search: '', page: 1, pageSize: 20 }]);
});

test('Reassign opens the wizard at step 2 with that keeper preselected', async () => {
  capturedWizardProps = [];
  servedRows = Array.from({ length: 45 }, (_, index) =>
    row({ id: `sub-${index + 1}`, userId: `u-${index + 1}`, userName: `Keeper ${index + 1}` }));
  servedSubTotal = 45;
  dbUsers['u-1'] = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };
  const tree = await render({ wizard: 'open', step: '2', user: 'u-1', search: 'keeper', page: '2' });
  elementsOf(tree);
  assert.deepEqual(jsonOf(capturedWizardProps), [{
    step: 2, listSearch: 'keeper', listPage: 2, selectedOptionId: '',
    selectedUser: { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' },
    selectedPlan: null,
    userPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
    planPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
  }]);
  // A row's Reassign link targets the same wizard state (page 2's first row).
  const reassign = elementsOf(tree).links.find(link => textOf(link) === 'Reassign');
  assert.equal(reassign?.props.href,
    '/admin/subscriptions?search=keeper&page=2&wizard=open&step=2&user=u-21');
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
    selectedUser: { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' },
    selectedPlan: { id: 'p-1', name: 'Pro', planType: 'STANDARD', billingOptions: [
      { id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
      { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true },
    ] },
    selectedOptionId: 'o-1',
    userPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
    planPicker: { rows: [], total: 0, page: 1, pageSize: 20, search: '' },
  }]);
});

test('wizard steps clamp to what the URL state supports', async () => {
  capturedWizardProps = []; servedRows = []; servedSubTotal = 0;
  elementsOf(await render({ wizard: 'open', step: '9' }));
  assert.equal(capturedWizardProps[0]?.step, 1, 'no keeper yet → step 1');
  elementsOf(await render({ wizard: 'open', step: '3', user: 'u-1' }));
  assert.equal(capturedWizardProps[1]?.step, 2, 'no plan yet → step 2');
  elementsOf(await render({ wizard: 'open', step: '3', plan: 'p-1' }));
  assert.equal(capturedWizardProps[2]?.step, 1, 'no keeper yet → step 1');
});

test('each row offers Reassign and an End mutation for that subscription', async () => {
  servedRows = [row()]; servedSubTotal = 1;
  const tree = await render();
  const reassign = elementsOf(tree).links.find(link => textOf(link) === 'Reassign');
  assert.equal(reassign?.props.href, '/admin/subscriptions?wizard=open&step=2&user=u-1');
  const endForm = elementsOf(tree).forms.find(form => form.props['data-action'] === 'end-action');
  assert.ok(endForm, 'end mutation form missing');
  const hidden = elements(endForm).find(item => item.type === 'input' &&
    item.props.name === 'subscriptionId');
  assert.equal(hidden?.props.value, 'sub-1');
  const endButton = elements(endForm).find(item => item.type === 'button' && textOf(item) === 'End');
  assert.ok(endButton, 'end button missing');
});

test('the plan step is served active plans with search and pagination', async () => {
  capturedWizardProps = []; capturedPlanQueries = [];
  servedRows = []; servedSubTotal = 0;
  dbUsers['u-1'] = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };
  servedPlans = [
    { id: 'p-1', name: 'Pro', planType: 'STANDARD', billingOptionCount: 2,
      billingOptions: [{ id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
        { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true }] },
    { id: 'p-2', name: 'Basic', planType: 'STANDARD', billingOptionCount: 2,
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
      { id: 'p-1', title: 'Pro', subtitle: 'Standard · 2 options' },
      { id: 'p-2', title: 'Basic', subtitle: 'Standard · 2 options' },
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