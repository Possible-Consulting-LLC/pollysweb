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

const cn = (...parts: unknown[]) => parts.filter(Boolean).join(' ');

/** Values crossing the vm realm carry a foreign prototype; normalize before
 * structural comparison. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Transpile-and-run the live-search module. Only the pure state machine, the
 * hook-free input view, and the fetcher are exercised; the hook (debounce/
 * fetch wiring) runs in the browser and is pinned by the integration suite. */
function loadLiveSearch() {
  const code = ts.transpileModule(
    readFileSync(new URL('./live-search.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    URL,
    URLSearchParams,
    fetch: async (url: string, init?: { signal?: { aborted: boolean } }) => {
      fetchCalls.push(url);
      if (fetchResponse) return fetchResponse(url, init);
      return { ok: true, json: async () => ({ rows: [], total: 0 }) };
    },
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports as unknown as LiveSearchModule;
}

type NarrowingState = {
  text: string; committed: string; query: string; page: number;
  rows: Array<{ id: string; title: string; subtitle?: string }>;
  total: number; loading: boolean; requestId: number;
};

type LiveSearchModule = {
  SUGGEST_DEBOUNCE_MS: number;
  initialNarrowingState: (value?: string) => NarrowingState;
  narrowingReducer: (state: NarrowingState, event: Record<string, unknown>) => NarrowingState;
  LiveSearchInput: (props: Record<string, unknown>) => unknown;
  narrowViaEndpoint: (entity: string, pageSize?: number) =>
    (query: string, page: number, signal?: { aborted: boolean }) => Promise<{ rows: unknown[]; total: number }>;
};

const deps: Record<string, unknown> = {
  // Hook stubs: only the pure reducer, the hook-free input, and the fetcher
  // run here.
  react: {
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useReducer: (reducer: unknown, initial: unknown) => [initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  },
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
  '@/components/ui/button': {
    Button: ({ variant, size, className, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', className, ...props }),
  },
};

let fetchCalls: string[] = [];
let fetchResponse: ((url: string, init?: { signal?: { aborted: boolean } }) => unknown) | null = null;

const { initialNarrowingState, narrowingReducer, LiveSearchInput,
  SUGGEST_DEBOUNCE_MS, narrowViaEndpoint } = loadLiveSearch();

const NARROWED: Record<string, unknown> = {
  type: 'response', requestId: 8, query: 'ma',
  rows: [{ id: 'a', title: 'Alpha' }], total: 34 };

// --- pure state machine ---

test('typing retires the previous response: the committed view shows until fresh matches land', () => {
  let state = { ...initialNarrowingState(''), requestId: 8 };
  state = narrowingReducer(state, NARROWED);
  assert.equal(state.query, 'ma');
  assert.equal(state.rows.length, 1);
  assert.equal(state.total, 34);
  state = narrowingReducer(state, { type: 'change', text: 'mar' });
  assert.equal(state.text, 'mar');
  assert.equal(state.query, '', 'no narrowed rows for text that has no response yet');
  assert.equal(state.page, 1, 'a new query restarts at page 1');
  assert.equal(state.loading, false);
});

test('responses are accepted only for the latest request id (stale responses dropped)', () => {
  let state = narrowingReducer(initialNarrowingState(''), { type: 'change', text: 'ma' });
  state = narrowingReducer(state, { type: 'request', requestId: 7 });
  assert.equal(state.loading, true);
  state = narrowingReducer(state, { type: 'request', requestId: 8 });
  state = narrowingReducer(state, { type: 'response', requestId: 7, query: 'ma',
    rows: [{ id: 'stale', title: 'Stale' }], total: 99 });
  assert.equal(state.query, '', 'stale response must be ignored');
  state = narrowingReducer(state, { type: 'response', requestId: 8, query: 'ma',
    rows: [{ id: 'fresh', title: 'Fresh' }], total: 3 });
  assert.equal(state.query, 'ma');
  assert.equal(state.rows.length, 1);
  assert.equal(state.total, 3);
  assert.equal(state.loading, false);
});

test('paging over matches keeps the page and swaps rows on the matched response', () => {
  let state = { ...initialNarrowingState('ma'), requestId: 8 };
  state = narrowingReducer(state, NARROWED);
  state = narrowingReducer(state, { type: 'page', page: 2 });
  assert.equal(state.page, 2);
  assert.equal(state.rows.length, 1, 'the previous page stays visible while the next loads');
  state = narrowingReducer(state, { type: 'request', requestId: 9 });
  state = narrowingReducer(state, { type: 'response', requestId: 9, query: 'ma',
    rows: [{ id: 'b', title: 'Beta' }], total: 34 });
  assert.deepEqual(state.rows.map(row => row.id), ['b']);
});

test('Escape reverts the text to the committed value and restores the committed view', () => {
  let state = { ...initialNarrowingState('committed search'), requestId: 8 };
  state = narrowingReducer(state, NARROWED);
  state = narrowingReducer(state, { type: 'escape', committed: 'committed search' });
  assert.equal(state.text, 'committed search');
  assert.equal(state.committed, 'committed search');
  assert.equal(state.query, '');
  assert.equal(state.page, 1);
});

test('an external value change (fallback navigation) syncs the text and restores the committed view', () => {
  let state = { ...initialNarrowingState('old'), requestId: 8 };
  state = narrowingReducer(state, NARROWED);
  state = narrowingReducer(state, { type: 'sync', text: 'new from url' });
  assert.equal(state.text, 'new from url');
  assert.equal(state.committed, 'new from url');
  assert.equal(state.query, '');
  assert.equal(state.page, 1);
  // The commit's sync voids the pre-commit fetch: a response that lands after
  // the navigation must not resurrect the narrowed view over the committed one.
  state = narrowingReducer(state, { type: 'response', requestId: 8, query: 'new from url',
    rows: [{ id: 'b', title: 'Beta' }], total: 1 });
  assert.equal(state.query, '', 'a late response for the pre-commit fetch is stale');
  assert.equal(state.rows.length, 0);
});

// --- hook-free input view: headless by construction, no dropdown anywhere ---

const inputBase = {
  id: 'test-search',
  label: 'Search plans',
  placeholder: 'Search plans by name…',
  value: '',
};

function keyDown(props: Record<string, unknown>, key: string) {
  let prevented = false;
  (props.onKeyDown as (event: unknown) => void)({ key, preventDefault: () => { prevented = true; } });
  return prevented;
}

test('the input is a plain search field — no combobox roles, no listbox by construction', () => {
  const tree = LiveSearchInput({ ...inputBase, value: 'ma', onType: () => {},
    onEscape: () => {} }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search');
  assert.ok(input, 'input missing');
  assert.equal(input.props.type, 'search');
  assert.equal(input.props.role, undefined, 'no combobox role — there is no popup');
  assert.equal(input.props['aria-expanded'], undefined);
  assert.equal(input.props['aria-controls'], undefined);
  assert.equal(elements(tree).some(item => item.props.role === 'listbox'), false,
    'a suggestion dropdown must not exist by construction');
  assert.equal(input.props.maxLength, 80, 'the live-search input keeps the old search input cap');
});

test('typing fires onType; Escape reverts; Enter submits the trimmed text as the explicit fallback', () => {
  let typed: string | undefined;
  let escaped = false;
  let entered: string | undefined;
  const tree = LiveSearchInput({ ...inputBase, value: '  mar  ',
    onType: (value: string) => { typed = value; },
    onEscape: () => { escaped = true; },
    onEnter: (value: string) => { entered = value; } }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search')!;
  (input.props.onChange as (event: unknown) => void)({ target: { value: 'mar' } });
  assert.equal(typed, 'mar');
  assert.equal(keyDown(input.props, 'ArrowDown'), false, 'plain typing has no suggestion navigation');
  assert.equal(keyDown(input.props, 'Escape'), true);
  assert.equal(escaped, true);
  assert.equal(keyDown(input.props, 'Enter'), true);
  assert.equal(entered, 'mar', 'Enter is the explicit full-page fallback with the trimmed text');
});

test('Enter without an onEnter handler is inert (plain typing never navigates)', () => {
  const tree = LiveSearchInput({ ...inputBase, value: 'ma', onType: () => {},
    onEscape: () => {} }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search')!;
  assert.doesNotThrow(() => keyDown(input.props, 'Enter'));
});

// --- endpoint fetcher ---

test('narrowViaEndpoint GETs the admin narrowing route with query, page, and page size', async () => {
  fetchCalls = [];
  fetchResponse = () => ({ ok: true,
    json: async () => ({ rows: [{ id: 'x', title: 'X' }], total: 42 }) });
  const fetcher = narrowViaEndpoint('plans', 20);
  const result = await fetcher('red tailor', 2);
  assert.deepEqual(fetchCalls, ['/admin/suggest/plans?q=red+tailor&page=2&pageSize=20']);
  assert.deepEqual(plain(result), { rows: [{ id: 'x', title: 'X' }], total: 42 });
});

test('narrowViaEndpoint degrades to an empty narrowed set on a failed request', async () => {
  fetchCalls = [];
  fetchResponse = () => ({ ok: false, status: 403, json: async () => ({}) });
  const result = await narrowViaEndpoint('users')('ma', 1);
  assert.deepEqual(plain(result), { rows: [], total: 0 });
});

test('the debounce matches the ratified ~250ms budget', () => {
  assert.equal(SUGGEST_DEBOUNCE_MS, 250);
});
