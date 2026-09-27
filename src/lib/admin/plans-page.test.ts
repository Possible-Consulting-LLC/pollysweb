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
  return text((node as Element).props.children);
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
  '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'actor-1' }) },
  '@/lib/db': { prisma: {} },
  '@/lib/admin/plans': {
    listPlans: async (_tx: unknown, query: { search?: string; page: number; pageSize: number }) => {
      capturedQueries.push({ ...query });
      const start = (query.page - 1) * query.pageSize;
      return { plans: servedPlans.slice(start, start + query.pageSize), total: servedTotal };
    },
  },
  '@/components/mutation-form': ({ children }: { children?: unknown }) => jsx.jsx('form', { children }),
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/components/ui/card': ({ children, className }: { children?: unknown; className?: string }) =>
    jsx.jsx('div', { className, children }),
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

function planSummaries(count: number): PlanSummaryLike[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `plan-${index + 1}`, name: `Plan ${index + 1}`, description: '', planType: 'STANDARD',
    maxSpiders: null, active: true, public: true, sortOrder: index, updatedAt: new Date(0),
    billingOptionCount: 0, enabledFeatureCount: 0, subscriptionCount: 0, billingOptions: [],
  }));
}

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    inputs: all.filter(item => item.type === 'input'),
    forms: all.filter(item => item.type === 'form'),
  };
}

test('plans page renders a search form without page state and click-through rows', async () => {
  capturedQueries = []; servedPlans = planSummaries(3); servedTotal = 3;
  const tree = await render();
  const { links, inputs } = elementsOf(tree);
  assert.equal(textOf(tree).replace(/\s+/g, ' ').includes('Page 1 of 1'), true);
  // Row anchors only: the page's own edit links are /edit-suffixed and excluded.
  const rowLinks = links.filter(link => /^\/admin\/plans\/plan-\d+$/.test(String(link.props.href)));
  assert.deepEqual(rowLinks.map(link => link.props.href),
    ['/admin/plans/plan-1', '/admin/plans/plan-2', '/admin/plans/plan-3']);
  const searchInput = inputs.find(input => input.props.name === 'search');
  assert.ok(searchInput, 'search input missing');
  // A GET search form with only the search field drops any page param, so a
  // new search always restarts on page 1.
  assert.equal(searchInput.props.defaultValue, '');
  assert.equal(inputs.some(input => input.type === 'hidden' && input.props.name === 'page'), false);
  assert.deepEqual(capturedQueries, [{ search: '', page: 1, pageSize: 20 }]);
  assert.ok(links.some(link => link.props.href === '/admin/plans/new'), 'create link missing');
});

test('plans page paginates at 20 with disabled bounds and working pager links', async () => {
  capturedQueries = []; servedPlans = planSummaries(25); servedTotal = 25;
  const page1 = await render();
  const first = elementsOf(page1);
  assert.equal(first.links.filter(link => /^\/admin\/plans\/plan-\d+$/.test(String(link.props.href))).length, 20);
  assert.equal(textOf(page1).includes('Page 1 of 2'), true);
  const prev1 = first.buttons.find(button => text(button) === 'Previous');
  const next1 = first.links.find(link => text(link) === 'Next');
  assert.equal(prev1?.props.disabled, true);
  assert.equal(next1?.props.href, '/admin/plans?page=2');
  const page2 = await render({ page: '2' });
  const second = elementsOf(page2);
  assert.equal(second.links.filter(link => /^\/admin\/plans\/plan-\d+$/.test(String(link.props.href))).length, 5);
  assert.equal(textOf(page2).includes('Page 2 of 2'), true);
  const prev2 = second.links.find(link => text(link) === 'Previous');
  const next2 = second.buttons.find(button => text(button) === 'Next');
  assert.equal(prev2?.props.href, '/admin/plans?page=1');
  assert.equal(next2?.props.disabled, true);
  assert.deepEqual(capturedQueries,
    [{ search: '', page: 1, pageSize: 20 }, { search: '', page: 2, pageSize: 20 }]);
});

test('plans page passes the search to the service and clamps out-of-range pages', async () => {
  capturedQueries = []; servedPlans = planSummaries(25); servedTotal = 25;
  const tree = await render({ search: 'plan', page: '99' });
  // First fetch uses the URL page; the clamp refetch targets the last valid page.
  assert.deepEqual(capturedQueries,
    [{ search: 'plan', page: 99, pageSize: 20 }, { search: 'plan', page: 2, pageSize: 20 }]);
  // Pager links preserve the search term; the search input echoes it back.
  const { links, inputs } = elementsOf(tree);
  const pagerLinks = links.filter(link => ['Previous', 'Next'].includes(text(link)));
  assert.equal(pagerLinks.length, 1);
  assert.equal(pagerLinks[0].props.href, '/admin/plans?search=plan&page=1');
  assert.equal(inputs.find(input => input.props.name === 'search')?.props.defaultValue, 'plan');
  const summaryLine = textOf(tree);
  assert.equal(summaryLine.includes('25'), true);
  assert.equal(summaryLine.includes('matching the search'), true);
});

test('plans page uses uniform themed buttons and per-row reorder directions', async () => {
  capturedQueries = []; servedPlans = planSummaries(2); servedTotal = 2;
  const tree = await render();
  const { buttons, links } = elementsOf(tree);
  const labelText = (button: Element) => text(button).replace(/\s+/g, ' ');
  const byLabel = (wanted: string) => buttons.filter(button => labelText(button).includes(wanted));
  // Duplicate is secondary, delete is danger, reorder is ghost — all size sm.
  for (const [label, variant] of [['Duplicate', 'secondary'], ['Delete', 'danger'], ['Move up', 'ghost'], ['Move down', 'ghost']] as const) {
    const group = byLabel(label);
    assert.ok(group.length >= 1, `${label} control missing`);
    assert.ok(group.every(button => button.props['data-variant'] === variant && button.props['data-size'] === 'sm'),
      `${label} buttons are not uniform ${variant}/sm`);
  }
  const createLink = links.find(link => link.props.href === '/admin/plans/new');
  assert.equal(String(createLink?.props.className).includes('variant-primary'), true);
  assert.equal(String(createLink?.props.className).includes('size-md'), true);
  // First row (index 0) moves down, second row moves up.
  const directions: string[] = [];
  for (const button of buttons.filter(item => labelText(item).startsWith('Move ')))
    directions.push(labelText(button).replace('Move ', ''));
  assert.deepEqual(directions, ['down', 'up']);
});
