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
  const item = node as Element;
  // Function components render their own children (e.g. the plan detail panel);
  // call them so their output is included, mirroring elements().
  if (typeof item.type === 'function') return text((item.type as (props: unknown) => unknown)(item.props));
  return text(item.props.children);
}

function textOf(tree: unknown): string {
  return text(tree).replace(/\s+/g, ' ').trim();
}

type PlanSummaryLike = { id: string; name: string; description: string; planType: string;
  maxSpiders: number | null; active: boolean; public: boolean; sortOrder: number;
  updatedAt: Date; billingOptionCount: number; enabledFeatureCount: number;
  subscriptionCount: number; billingOptions: unknown[] };

/** Renders the server component through the repo's transpile-and-run pattern. */
function loadPlansPage() {
  const helperCode = ts.transpileModule(
    readFileSync(new URL('./paginated-list.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helperExports: Record<string, unknown> = {};
  runInNewContext(helperCode, { exports: helperExports });
  const code = ts.transpileModule(
    readFileSync(new URL('../../app/admin/plans/page.tsx', import.meta.url), 'utf8'),
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

let capturedQueries: Array<{ search?: string; page: number; pageSize: number }> = [];
let servedPlans: PlanSummaryLike[] = [];
let servedTotal = 0;
const deps: Record<string, unknown> = {
  // ts.transpileModule applies no esModuleInterop, so the default import reads .default directly.
  'next/link': { default: ({ href, children, className }: { href: string; children?: unknown; className?: string }) =>
    jsx.jsx('a', { href, className, children }) },
  'lucide-react': { ChevronDown: (props: Record<string, unknown>) => jsx.jsx('svg', props) },
  '@/lib/utils': { cn: (...parts: unknown[]) => parts.filter(Boolean).join(' ') },
  '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'actor-1' }) },
  '@/lib/db': { prisma: {} },
  '@/lib/features/registry': { FEATURE_REGISTRY: Array.from({ length: 34 }, (_, i) => ({ key: `f${i}` })) },
  '@/lib/admin/plans': {
    listPlans: async (_tx: unknown, query: { search?: string; page: number; pageSize: number }) => {
      capturedQueries.push({ ...query });
      const start = (query.page - 1) * query.pageSize;
      return { plans: servedPlans.slice(start, start + query.pageSize), total: servedTotal };
    },
  },
  '@/components/mutation-form': ({ children }: { children?: unknown }) => jsx.jsx('form', { children }),
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/components/ui/card': { Card: ({ children, className }: { children?: unknown; className?: string }) =>
    jsx.jsx('div', { className, children }) },
  '@/components/ui/button': {
    Button: ({ variant, size, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props }),
    buttonVariants: ({ variant, size }: { variant?: string; size?: string } = {}) =>
      `variant-${variant ?? 'primary'} size-${size ?? 'md'}`,
  },
  './actions': { deletePlanAction: 'delete-plan', duplicatePlanAction: 'duplicate-plan',
    reorderPlanAction: 'reorder-plan' },
};

const PlansPage = loadPlansPage();

const render = async (params: Record<string, string> = {}) =>
  PlansPage({ searchParams: Promise.resolve(params) });

function planSummaries(count: number, overrides: Record<string, Partial<PlanSummaryLike>> = {}):
  PlanSummaryLike[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `plan-${index + 1}`, name: `Plan ${index + 1}`, description: `Desc ${index + 1}`,
    planType: 'STANDARD', maxSpiders: null, active: true, public: true, sortOrder: index,
    updatedAt: new Date(0), billingOptionCount: 0, enabledFeatureCount: 0,
    subscriptionCount: 0, billingOptions: [], ...overrides[`plan-${index + 1}`],
  }));
}

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    inputs: all.filter(item => item.type === 'input'),
  };
}

const toggleLinks = (tree: unknown) => elementsOf(tree).links
  .filter(link => /\/admin\/plans\?/.test(String(link.props.href)) &&
    /(^|&)open=plan-\d+/.test(String(link.props.href)));

test('plans page renders toggle rows for the accordion, and no detail while collapsed', async () => {
  capturedQueries = []; servedPlans = planSummaries(3); servedTotal = 3;
  const tree = await render();
  const { inputs, buttons } = elementsOf(tree);
  assert.equal(textOf(tree).replace(/\s+/g, ' ').includes('Page 1 of 1'), true);
  // Collapsed rows toggle `open=<planId>` in the URL, preserving search and page.
  assert.deepEqual(toggleLinks(tree).map(link => link.props.href),
    ['/admin/plans?page=1&open=plan-1', '/admin/plans?page=1&open=plan-2', '/admin/plans?page=1&open=plan-3']);
  const searchInput = inputs.find(input => input.props.name === 'search');
  assert.ok(searchInput, 'search input missing');
  // A GET search form with only the search field drops page and open, so a new
  // search always restarts on page 1 with every row folded up.
  assert.equal(searchInput.props.defaultValue, '');
  assert.equal(inputs.some(input => input.type === 'hidden'), false);
  assert.deepEqual(capturedQueries, [{ search: '', page: 1, pageSize: 20 }]);
  assert.ok(elementsOf(tree).links.some(link => link.props.href === '/admin/plans/new'), 'create link missing');
  // Nothing expanded: no detail cards, no per-row action buttons.
  assert.equal(textOf(tree).includes('Identity'), false);
  assert.equal(buttons.some(button => text(button) === 'Duplicate'), false);
});

test('plans page paginates at 20 with disabled bounds and search-preserving pager links', async () => {
  capturedQueries = []; servedPlans = planSummaries(25); servedTotal = 25;
  const page1 = await render();
  const first = elementsOf(page1);
  assert.equal(toggleLinks(page1).length, 20);
  assert.equal(textOf(page1).includes('Page 1 of 2'), true);
  // Pager links do not carry open state: paging folds the accordion up.
  const next1 = first.links.find(link => text(link) === 'Next');
  assert.equal(next1?.props.href, '/admin/plans?page=2');
  const prev1 = first.buttons.find(button => text(button) === 'Previous');
  assert.equal(prev1?.props.disabled, true);
  const page2 = await render({ page: '2' });
  const second = elementsOf(page2);
  assert.equal(toggleLinks(page2).length, 5);
  assert.equal(textOf(page2).includes('Page 2 of 2'), true);
  // Row toggles preserve the page.
  assert.ok(toggleLinks(page2).every(link => String(link.props.href).includes('page=2')));
  assert.equal(second.links.find(link => text(link) === 'Previous')?.props.href, '/admin/plans?page=1');
  assert.equal(second.buttons.find(button => text(button) === 'Next')?.props.disabled, true);
  assert.deepEqual(capturedQueries,
    [{ search: '', page: 1, pageSize: 20 }, { search: '', page: 2, pageSize: 20 }]);
});

test('plans page passes the search to the service, clamps out-of-range pages, and keeps toggles filtered', async () => {
  capturedQueries = []; servedPlans = planSummaries(25); servedTotal = 25;
  const tree = await render({ search: 'plan', page: '99' });
  // First fetch uses the URL page; the clamp refetch targets the last valid page.
  assert.deepEqual(capturedQueries,
    [{ search: 'plan', page: 99, pageSize: 20 }, { search: 'plan', page: 2, pageSize: 20 }]);
  // Toggles preserve the search term and the clamped page.
  assert.ok(toggleLinks(tree).every(link =>
    String(link.props.href).startsWith('/admin/plans?search=plan&page=2&open=')));
  const { inputs } = elementsOf(tree);
  assert.equal(inputs.find(input => input.props.name === 'search')?.props.defaultValue, 'plan');
  const summaryLine = textOf(tree);
  assert.equal(summaryLine.includes('25'), true);
  assert.equal(summaryLine.includes('matching the search'), true);
});

test('the open plan expands inline with identity, billing, usage cards, and actions', async () => {
  capturedQueries = []; servedPlans = planSummaries(2, {
    'plan-1': { description: 'Careful care', maxSpiders: 5, billingOptionCount: 2,
      enabledFeatureCount: 19, subscriptionCount: 7,
      billingOptions: [{ id: 'opt-1', interval: 'MONTHLY', basePriceCents: 199, active: true },
        { id: 'opt-2', interval: 'ANNUAL', basePriceCents: 1999, active: false }] },
  }); servedTotal = 2;
  const tree = await render({ open: 'plan-1' });
  const { links, buttons } = elementsOf(tree);
  const body = textOf(tree);
  // Detail cards render once — the other row stays folded.
  assert.equal((body.match(/Identity/g) ?? []).length, 1);
  assert.equal(body.includes('appears on public pricing (future phase)'), true);
  assert.equal(body.includes('Careful care'), true);
  assert.equal(body.includes('Billing options'), true);
  assert.equal(body.includes('$1.99'), true);
  assert.equal(body.includes('$19.99 (inactive)'), true);
  assert.equal(body.includes('Usage'), true);
  assert.equal(body.includes('19 of 34'), true);
  assert.equal(body.includes('Effective subscriptions'), true);
  // Only one row open at a time: the open row's own toggle collapses (no open
  // param; distinct from the pager because Previous is a disabled button here),
  // and the other row targets its own id.
  assert.deepEqual(elementsOf(tree).links
    .filter(link => /open=plan-\d+/.test(String(link.props.href))).map(link => link.props.href),
    ['/admin/plans?page=1&open=plan-2']);
  assert.ok(elementsOf(tree).links.some(link => link.props.href === '/admin/plans?page=1'),
    'collapse toggle missing');
  // Actions live in the expanded panel.
  const editLink = links.find(link => link.props.href === '/admin/plans/plan-1/edit');
  assert.ok(editLink, 'edit link missing');
  assert.equal(String(editLink.props.className).includes('variant-primary'), true);
  assert.ok(buttons.some(button => text(button).replace(/\s+/g, ' ').includes('Duplicate')));
  assert.ok(buttons.some(button => text(button).includes('Delete or deactivate')));
});

test('a private plan shows the assignable-only note and actions collapse with the row', async () => {
  capturedQueries = []; servedPlans = planSummaries(2, { 'plan-2': { public: false, name: 'Staff' } });
  servedTotal = 2;
  const tree = await render({ open: 'plan-2' });
  const body = textOf(tree);
  assert.equal(body.includes('assignable only'), true);
  assert.equal(body.includes('appears on public pricing'), false);
  // Collapsed state (no open param) renders no detail and no row actions.
  const collapsed = await render();
  const collapsedText = textOf(collapsed);
  assert.equal(collapsedText.includes('Identity'), false);
  assert.equal(elementsOf(collapsed).buttons.some(button => text(button).includes('Duplicate')), false);
});

test('plans page uses uniform themed buttons and per-row reorder directions in the panel', async () => {
  capturedQueries = []; servedPlans = planSummaries(2); servedTotal = 2;
  const tree = await render({ open: 'plan-1' });
  const { buttons, links } = elementsOf(tree);
  const labelText = (button: Element) => text(button).replace(/\s+/g, ' ');
  const byLabel = (wanted: string) => buttons.filter(button => labelText(button).includes(wanted));
  // Duplicate is secondary, delete is danger, reorder is ghost — all size sm,
  // and each exists only inside the single expanded panel.
  for (const [label, variant, count] of [['Duplicate', 'secondary', 1], ['Delete', 'danger', 1],
    ['Move down', 'ghost', 1], ['Move up', 'ghost', 0]] as const) {
    const group = byLabel(label);
    assert.equal(group.length, count, `${label} count`);
    assert.ok(group.every(button => button.props['data-variant'] === variant && button.props['data-size'] === 'sm'),
      `${label} buttons are not uniform ${variant}/sm`);
  }
  const createLink = links.find(link => link.props.href === '/admin/plans/new');
  assert.equal(String(createLink?.props.className).includes('variant-primary'), true);
  assert.equal(String(createLink?.props.className).includes('size-md'), true);
});
