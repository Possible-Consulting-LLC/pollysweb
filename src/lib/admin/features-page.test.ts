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

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    inputs: all.filter(item => item.type === 'input'),
    forms: all.filter(item => item.type === 'form'),
  };
}

function textOf(tree: unknown): string {
  const flat = (node: unknown): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flat).filter(Boolean).join(' ');
    if (!node || typeof node !== 'object' || !('props' in node)) return '';
    const item = node as Element;
    if (typeof item.type === 'function') return flat((item.type as (props: unknown) => unknown)(item.props));
    return flat(item.props.children);
  };
  return flat(tree).replace(/\s+/g, ' ').trim();
}

/** Renders the server page through the repo's transpile-and-run pattern. Row
 * grouping, selection, and accordion behavior live in features-accordion.test.ts. */
function loadFeaturesPage() {
  const helperCode = ts.transpileModule(
    readFileSync(new URL('./paginated-list.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helperExports: Record<string, unknown> = {};
  runInNewContext(helperCode, { exports: helperExports });
  const listSharedCode = ts.transpileModule(
    readFileSync(new URL('../../components/admin/list-shared.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const listSharedExports: Record<string, unknown> = {};
  runInNewContext(listSharedCode, { exports: listSharedExports, URLSearchParams });
  const registryCode = ts.transpileModule(
    readFileSync(new URL('../features/registry.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const registryExports: Record<string, unknown> = {};
  runInNewContext(registryCode, { exports: registryExports });
  const code = ts.transpileModule(
    readFileSync(new URL('../../app/admin/features/page.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const pageExports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports: pageExports,
    URLSearchParams,
    require: (name: string) => {
      if (name === '@/lib/admin/paginated-list') return helperExports;
      if (name === '@/components/admin/list-shared') return listSharedExports;
      if (name === '@/lib/features/registry') return registryExports;
      if (name === 'react/jsx-runtime') return jsx;
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return pageExports.default as (input: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
}

type FeatureRow = { id: string; key: string; name: string; description: string; category: string; active: boolean };

const registryExports: Record<string, unknown> = {};
{
  const registryCode = ts.transpileModule(
    readFileSync(new URL('../features/registry.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(registryCode, { exports: registryExports });
}
const REGISTRY = (registryExports as { FEATURE_REGISTRY: Array<{ key: string; name: string; description: string; category: string }> })
  .FEATURE_REGISTRY;

const DB_ROWS: FeatureRow[] = Array.from({ length: 25 }, (_, index) => ({
  id: `feature-${index + 1}`, key: REGISTRY[index].key, name: `Feature ${index + 1}`,
  description: `Desc ${index + 1}`, category: index < 2 ? 'care' : 'spoods', active: index % 2 === 0,
}));

let featureQueries: Array<Record<string, unknown>> = [];
let translationQueries: Array<Record<string, unknown>> = [];
let servedRows: FeatureRow[] = [];
let servedTotal = 0;
let capturedProps: Array<Record<string, unknown>> = [];

const prismaStub = {
  feature: {
    findMany: async (args: Record<string, unknown>) => {
      featureQueries.push(JSON.parse(JSON.stringify(args)));
      const skip = Number(args.skip ?? 0);
      const take = Number(args.take ?? servedRows.length);
      return servedRows.slice(skip, skip + take).map(row => ({ ...row }));
    },
    count: async () => servedTotal,
  },
  plan: { count: async () => 3 },
  featurePlanTranslation: {
    findMany: async (args: Record<string, unknown>) => {
      translationQueries.push(JSON.parse(JSON.stringify(args)));
      const ids = (args.where as { featureId: { in: string[] } }).featureId.in;
      return ids.filter(id => id === DB_ROWS[20].id).map(featureId => ({
        featureId, enabled: true, plan: { name: 'Basic' } }));
    },
  },
};

const deps: Record<string, unknown> = {
  'next/link': { default: ({ href, children, className }: { href: string; children?: unknown; className?: string }) =>
    jsx.jsx('a', { href, className, children }) },
  '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'actor-1' }) },
  '@/lib/db': { prisma: prismaStub },
  '@/components/admin/features-accordion': { FeaturesAccordion: (props: Record<string, unknown>) => {
    capturedProps.push({ ...props });
    return jsx.jsx('div', { 'data-features': (props.features as unknown[]).length });
  } },
  '@/components/ui/button': {
    Button: ({ variant, size, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props }),
    buttonVariants: ({ variant, size }: { variant?: string; size?: string } = {}) =>
      `variant-${variant ?? 'primary'} size-${size ?? 'md'}`,
  },
  '@/components/mutation-form': { MutationForm: ({ children, ...props }: Record<string, unknown>) =>
    jsx.jsx('form', { ...props, children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/components/ui/card': { Card: ({ children, ...props }: Record<string, unknown>) =>
    jsx.jsx('div', { ...props, children }) },
  '@/app/admin/features/actions': { syncRegistryAction: 'sync-registry' },
  './actions': { syncRegistryAction: 'sync-registry' },
};

const FeaturesPage = loadFeaturesPage();
const render = (params: Record<string, string> = {}) => FeaturesPage({ searchParams: Promise.resolve(params) });

test('features page queries 20 per page with a name-or-key search and feeds the accordion', async () => {
  featureQueries = []; translationQueries = []; capturedProps = [];
  servedRows = DB_ROWS; servedTotal = 25;
  const tree = await render({ open: DB_ROWS[1].key, search: 'spood', page: '2' });
  elementsOf(tree);
  // Three feature queries: the paged rows, the count, and the cheap all-keys
  // pass that re-derives missing/orphan counts against the registry.
  assert.equal(featureQueries.filter(query => 'take' in query).length, 1);
  const where = featureQueries[0].where as { OR: Array<Record<string, unknown>> };
  assert.deepEqual(where, { OR: [
    { name: { contains: 'spood', mode: 'insensitive' } },
    { key: { contains: 'spood', mode: 'insensitive' } },
  ] });
  assert.deepEqual(featureQueries[0].orderBy, [{ category: 'asc' }, { key: 'asc' }]);
  assert.equal(featureQueries[0].skip, 20);
  assert.equal(featureQueries[0].take, 20);
  // Assignments are resolved with one grouped query for the page's features.
  assert.equal(translationQueries.length, 1);
  const props = JSON.parse(JSON.stringify(capturedProps[0]));
  assert.deepEqual(props, {
    features: servedRows.slice(20, 40).map(row => ({ ...row, orphan: false,
      assignedPlans: row.id === DB_ROWS[20].id ? ['Basic'] : [], totalPlans: 3 })),
    total: 25, search: 'spood', page: 2, pageSize: 20, openKey: DB_ROWS[1].key,
  });
  // Search is owned by the accordion's live toolbar (Task 7) — no GET form here.
  assert.equal(elementsOf(tree).inputs.some(input => input.props.name === 'search'), false);
  const syncForm = elementsOf(tree).forms.find(form => form.props.action === 'sync-registry');
  assert.ok(syncForm, 'sync registry card missing');
});

test('the accordion (with its live toolbar) renders even when nothing matches yet', async () => {
  featureQueries = []; capturedProps = []; servedRows = []; servedTotal = 0;
  const tree = await render({});
  elementsOf(tree);
  assert.equal(capturedProps.length, 1,
    'FeaturesAccordion always renders so the live search stays available');
});

test('a page beyond the total clamps back to the last valid page', async () => {
  featureQueries = []; capturedProps = [];
  servedRows = DB_ROWS; servedTotal = 25;
  const tree = await render({ page: '99' });
  elementsOf(tree);
  const paged = featureQueries.filter(query => 'skip' in query);
  assert.equal(paged[paged.length - 1].skip, 20, 're-queried at the last valid page (2 of 25 at 20/page)');
  assert.equal(capturedProps[0].page, 2);
});

test('the header stat line is honest during a search', async () => {
  servedRows = DB_ROWS; servedTotal = 25;
  const filtered = textOf(await render({ search: 'molt' }));
  assert.equal(filtered.includes('25 matches'), true);
  assert.equal(filtered.includes('in the database'), true);
  const plain = textOf(await render({}));
  assert.equal(plain.includes('matches'), false);
  assert.equal(plain.includes('in the database'), true);
});

test('the committed pager lives in the accordion island; empty searches skip the where clause', async () => {
  featureQueries = []; capturedProps = [];
  servedRows = DB_ROWS; servedTotal = 25;
  const tree = await render({ search: 'molt', page: '1', open: 'spood.create-1' });
  elementsOf(tree);
  // The server page renders no pagination nav — the island owns both pagers
  // (committed + live narrowing) and derives the last page from page size.
  assert.equal(capturedProps[0].pageSize, 20);
  assert.equal(elementsOf(tree).links.some(link => String(link.props.href).includes('page=2')),
    false, 'no server-rendered pager');
  const searchQuery = featureQueries[0].where as { OR: unknown[] };
  assert.ok(searchQuery.OR, 'search must filter');
  featureQueries = [];
  await render({});
  assert.equal(featureQueries[0].where, undefined, 'no search → unfiltered query');
});

// --- Fix round 1b: the island is the single owner of the empty state ---

test('the server page renders no empty-state message — the island owns it in both modes', async () => {
  featureQueries = []; capturedProps = []; servedRows = []; servedTotal = 0;
  const plain = textOf(await render({}));
  assert.equal(plain.includes('No features in the database yet'), false,
    'the committed empty state belongs to the accordion island');
  assert.equal(plain.includes('No features match this search'), false,
    'the searched empty state belongs to the accordion island');
  const searched = textOf(await render({ search: 'molt' }));
  assert.equal(searched.includes('No features match this search'), false,
    'no duplicate server message beside the island’s own empty state');
});
