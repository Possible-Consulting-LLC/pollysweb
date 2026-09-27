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
  if (typeof item.type === 'function') return text((item.type as (props: unknown) => unknown)(item.props));
  return text(item.props.children);
}

function textOf(tree: unknown): string {
  return text(tree).replace(/\s+/g, ' ').trim();
}

/** Renders the server component through the repo's transpile-and-run pattern.
 * Row/checkbox/tray/counter behavior is pinned in plans-accordion.test.ts and
 * selection-tray.test.ts; here we pin the server-owned concerns. */
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
let capturedProps: Array<Record<string, unknown>> = [];
let servedPlans: Array<{ id: string; name: string }> = [];
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
  // The client accordion owns selection state (hooks); the page passes it the
  // server-fed page of rows plus the URL's open plan.
  '@/components/admin/plans-accordion': { PlansAccordion: (props: Record<string, unknown>) => {
    capturedProps.push({ ...props });
    return jsx.jsx('div', { 'data-plans': (props.plans as unknown[]).length });
  } },
  '@/components/ui/button': {
    Button: ({ variant, size, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props }),
    buttonVariants: ({ variant, size }: { variant?: string; size?: string } = {}) =>
      `variant-${variant ?? 'primary'} size-${size ?? 'md'}`,
  },
};

const PlansPage = loadPlansPage();

const render = async (params: Record<string, string> = {}) =>
  PlansPage({ searchParams: Promise.resolve(params) });

test('plans page feeds the accordion the server page and the URL open plan', async () => {
  capturedQueries = []; capturedProps = []; servedPlans = [{ id: 'plan-1', name: 'Plan 1' },
    { id: 'plan-2', name: 'Plan 2' }]; servedTotal = 2;
  const tree = await render({ open: 'plan-2', search: '', page: '1' });
  // Resolving the tree invokes the stubbed client component.
  elementsOf(tree);
  assert.deepEqual(capturedProps, [{ plans: servedPlans, total: 2, search: '', page: 1, openId: 'plan-2' }]);
  // Search is owned by the accordion's live toolbar (Task 7) — no GET form here.
  assert.equal(elementsOf(tree).inputs.some(input => input.props.name === 'search'), false);
  assert.ok(elements(tree).some(item => item.type === 'a' && item.props.href === '/admin/plans/new'),
    'create link missing');
  assert.deepEqual(capturedQueries, [{ search: '', page: 1, pageSize: 20 }]);
});

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    inputs: all.filter(item => item.type === 'input'),
  };
}

test('plans page paginates at 20 with disabled bounds and working pager links', async () => {
  capturedQueries = []; capturedProps = [];
  servedPlans = Array.from({ length: 25 }, (_, index) => ({ id: `plan-${index + 1}`, name: `Plan ${index + 1}` }));
  servedTotal = 25;
  const page1 = await render();
  elementsOf(page1);
  assert.equal(capturedProps[0] !== undefined ? (capturedProps[0] as { plans: unknown[] }).plans.length : undefined, 20);
  assert.equal(textOf(page1).includes('Page 1 of 2'), true);
  const prev1 = elementsOf(page1).buttons.find(button => text(button) === 'Previous');
  const next1 = elementsOf(page1).links.find(link => text(link) === 'Next');
  assert.equal(prev1?.props.disabled, true);
  assert.equal(next1?.props.href, '/admin/plans?page=2');
  const page2 = await render({ page: '2' });
  capturedProps = [];
  elementsOf(page2);
  assert.equal(capturedProps[0] !== undefined ? (capturedProps[0] as { plans: unknown[] }).plans.length : undefined, 5);
  assert.equal(textOf(page2).includes('Page 2 of 2'), true);
  assert.equal(elementsOf(page2).links.find(link => text(link) === 'Previous')?.props.href, '/admin/plans?page=1');
  assert.equal(elementsOf(page2).buttons.find(button => text(button) === 'Next')?.props.disabled, true);
  assert.deepEqual(capturedQueries,
    [{ search: '', page: 1, pageSize: 20 }, { search: '', page: 2, pageSize: 20 }]);
  // Mockup footer: the pager sits on a hover-toned rule.
  const nav = elements(page2).find((item: { type: string }) => item.type === 'nav');
  assert.equal(String(nav!.props.className).includes('border-[var(--hover)]'), true);
});

test('plans page passes the search to the service and clamps out-of-range pages', async () => {
  capturedQueries = []; capturedProps = []; servedTotal = 25;
  await render({ search: 'plan', page: '99' });
  // First fetch uses the URL page; the clamp refetch targets the last valid page.
  assert.deepEqual(capturedQueries,
    [{ search: 'plan', page: 99, pageSize: 20 }, { search: 'plan', page: 2, pageSize: 20 }]);
  // The accordion receives the URL search (its live toolbar echoes it back).
  capturedProps = [];
  const tree = await render({ search: 'plan' });
  elementsOf(tree);
  assert.equal((capturedProps[0] as { search: string }).search, 'plan');
});

test('search is URL-owned with no form state — the live toolbar owns the input', async () => {
  capturedProps = []; servedPlans = [{ id: 'plan-1', name: 'Plan 1' }]; servedTotal = 1;
  const tree = await render({ search: 'plan', open: 'plan-1', page: '1' });
  const { inputs } = elementsOf(tree);
  assert.equal(inputs.length, 0, 'no search form on the page; the accordion toolbar owns it');
  assert.equal((capturedProps[0] as { search: string }).search, 'plan');
});
