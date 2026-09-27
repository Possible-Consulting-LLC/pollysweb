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

const cn = (...parts: unknown[]) => parts.filter(Boolean).join(' ');

/** Values crossing the vm realm carry a foreign prototype; normalize before
 * structural comparison. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

/** Transpile-and-run the live-search module. Only the pure state machine and
 * the hook-free view are exercised; the thin client shell (debounce/fetch)
 * wires them in the browser and is pinned by the integration suite. */
function loadLiveSearch() {
  const code = ts.transpileModule(
    readFileSync(new URL('./live-search.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    fetch: async (url: string, init?: { signal?: { aborted: boolean } }) => {
      fetchCalls.push(url);
      if (fetchResponse) return fetchResponse(url, init);
      return { ok: true, json: async () => ({ suggestions: [] }) };
    },
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports as unknown as importType;
}
type importType = {
  SUGGEST_DEBOUNCE_MS: number;
  Suggestion: unknown;
  initialLiveSearchState: (value?: string) => LiveSearchState;
  liveSearchReducer: (state: LiveSearchState, event: Record<string, unknown>) => LiveSearchState;
  liveSearchKeyDown: (key: string, state: LiveSearchState) => Record<string, unknown> | null;
  LiveSearchView: (props: Record<string, unknown>) => unknown;
  suggestViaEndpoint: (entity: string) => (query: string, signal?: { aborted: boolean }) => Promise<unknown[]>;
};
type LiveSearchState = {
  text: string; committed: string; open: boolean; suggestions: Array<{ id: string; title: string; subtitle?: string }>;
  loading: boolean; requestId: number; activeIndex: number;
};

const deps: Record<string, unknown> = {
  // Hook stubs: only the pure reducer and the hook-free view run here.
  react: {
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useReducer: (reducer: unknown, initial: unknown) => [initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  },
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
};

let fetchCalls: string[] = [];
let fetchResponse: ((url: string, init?: { signal?: { aborted: boolean } }) => unknown) | null = null;

const { initialLiveSearchState, liveSearchReducer, liveSearchKeyDown, LiveSearchView,
  SUGGEST_DEBOUNCE_MS, suggestViaEndpoint } = loadLiveSearch();

const withSuggestions = (state: LiveSearchState, suggestions: LiveSearchState['suggestions']): LiveSearchState =>
  ({ ...state, suggestions, open: true });

/** The reducer/view run inside a vm realm; normalize before comparing. */
const event = (value: Record<string, unknown> | null): Record<string, unknown> | null =>
  value === null ? null : JSON.parse(JSON.stringify(value));

// --- pure state machine ---

test('typing opens the popup and clears the highlight; whitespace-only closes it', () => {
  let state = initialLiveSearchState('');
  state = liveSearchReducer(state, { type: 'change', text: 'ma' });
  assert.equal(state.text, 'ma');
  assert.equal(state.open, true);
  assert.equal(state.activeIndex, -1);
  state = liveSearchReducer(state, { type: 'change', text: '   ' });
  assert.equal(state.open, false, 'blank input must not show a popup');
});

test('responses are accepted only for the latest request id (stale responses dropped)', () => {
  let state = liveSearchReducer(initialLiveSearchState(''), { type: 'change', text: 'ma' });
  state = liveSearchReducer(state, { type: 'request', requestId: 7 });
  assert.equal(state.loading, true);
  state = liveSearchReducer(state, { type: 'request', requestId: 8 });
  state = liveSearchReducer(state, { type: 'response', requestId: 7, suggestions: [{ id: 'stale', title: 'Stale' }] });
  assert.equal(state.suggestions.length, 0, 'stale response must be ignored');
  state = liveSearchReducer(state, { type: 'response', requestId: 8, suggestions: [{ id: 'fresh', title: 'Fresh' }] });
  assert.equal(state.suggestions.length, 1);
  assert.equal(state.loading, false);
  assert.equal(state.open, true);
});

test('arrow keys cycle through suggestions with wraparound', () => {
  let state = withSuggestions(initialLiveSearchState('ma'),
    [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }]);
  state = liveSearchReducer(state, { type: 'highlight', move: 1 });
  assert.equal(state.activeIndex, 0);
  state = liveSearchReducer(state, { type: 'highlight', move: 1 });
  state = liveSearchReducer(state, { type: 'highlight', move: 1 });
  assert.equal(state.activeIndex, 2);
  state = liveSearchReducer(state, { type: 'highlight', move: 1 });
  assert.equal(state.activeIndex, 0, 'wraps to the first suggestion');
  state = liveSearchReducer(state, { type: 'highlight', move: -1 });
  assert.equal(state.activeIndex, 2, 'wraps backwards past the first');
});

test('Escape closes the popup and reverts the text to the committed value', () => {
  let state = liveSearchReducer(initialLiveSearchState('committed search'), { type: 'change', text: 'draft' });
  state = liveSearchReducer(state, { type: 'escape', committed: 'committed search' });
  assert.equal(state.text, 'committed search');
  assert.equal(state.committed, 'committed search');
  assert.equal(state.open, false);
  assert.equal(state.suggestions.length, 0);
});

test('picking and fallback-commit both close the popup', () => {
  let state = withSuggestions(initialLiveSearchState(''), [{ id: 'a', title: 'A' }]);
  state = liveSearchReducer(state, { type: 'pick' });
  assert.equal(state.open, false);
  state = withSuggestions(state, [{ id: 'a', title: 'A' }]);
  state = liveSearchReducer(state, { type: 'commit' });
  assert.equal(state.open, false);
});

test('an external value change syncs the text and closes the popup', () => {
  let state = withSuggestions(initialLiveSearchState('old'), [{ id: 'a', title: 'A' }]);
  state = liveSearchReducer(state, { type: 'sync', text: 'new from url' });
  assert.equal(state.text, 'new from url');
  assert.equal(state.committed, 'new from url');
  assert.equal(state.open, false);
});

// --- keyboard mapping (pure) ---

test('keydown maps arrows to highlight moves, Enter to pick-or-commit, Escape to escape', () => {
  const state = withSuggestions(initialLiveSearchState('ma'), [{ id: 'a', title: 'A' }]);
  assert.deepEqual(event(liveSearchKeyDown('ArrowDown', state)), { type: 'highlight', move: 1 });
  assert.deepEqual(event(liveSearchKeyDown('ArrowUp', state)), { type: 'highlight', move: -1 });
  const active = { ...state, activeIndex: 0 };
  assert.deepEqual(event(liveSearchKeyDown('Enter', active)), { type: 'pick' });
  assert.deepEqual(event(liveSearchKeyDown('Enter', { ...state, activeIndex: -1 })), { type: 'commit' });
  assert.deepEqual(event(liveSearchKeyDown('Escape', state)), { type: 'escape', committed: state.committed });
  assert.equal(liveSearchKeyDown('Tab', state), null);
  assert.deepEqual(event(liveSearchKeyDown('Enter', { ...state, open: false })), { type: 'commit' });
});

// --- hook-free view (popup mode) ---

const popupBase = {
  state: initialLiveSearchState(''),
  id: 'test-search',
  label: 'Search plans',
  placeholder: 'Search plans by name…',
};

function keyDown(props: Record<string, unknown>, key: string) {
  let prevented = false;
  (props.onKeyDown as (event: unknown) => void)({ key, preventDefault: () => { prevented = true; } });
  return prevented;
}

test('popup view renders combobox semantics on the input and a listbox of options', () => {
  const state = { ...withSuggestions(initialLiveSearchState('ma'),
    [{ id: 's-1', title: 'Alpha' }, { id: 's-2', title: 'Beta' }]), activeIndex: 1 };
  const tree = LiveSearchView({ ...popupBase, state, selectedIds: new Set(['s-2']) }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search');
  assert.ok(input, 'input missing');
  assert.equal(input.props.role, 'combobox');
  assert.equal(input.props['aria-expanded'], true);
  assert.equal(input.props['aria-controls'], 'test-search-listbox');
  assert.equal(input.props['aria-autocomplete'], 'list');
  const listbox = elements(tree).find(item => item.props.role === 'listbox');
  assert.ok(listbox, 'listbox missing while open');
  const options = elements(tree).filter(item => item.props.role === 'option');
  assert.deepEqual(options.map(option => option.props.id),
    ['test-search-option-s-1', 'test-search-option-s-2']);
  // Selected-state markers: rows already picked render selected (aria-selected + plum).
  assert.deepEqual(options.map(option => option.props['aria-selected']), [false, true]);
  assert.equal(String(options[1].props.className).includes('text-[var(--plum)]'), true);
  // The active option is announced via aria-activedescendant and highlighted.
  const activeOption = options.find(option => option.props['data-active'] === 'true');
  assert.ok(activeOption, 'active option missing');
  assert.equal(input.props['aria-activedescendant'], 'test-search-option-s-2');
});

test('popup view stays closed with no aria-controls when the state is closed', () => {
  const tree = LiveSearchView({ ...popupBase, state: initialLiveSearchState('ma') }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search');
  assert.equal(input?.props['aria-expanded'], false);
  assert.equal(input?.props['aria-controls'], undefined);
  assert.equal(elements(tree).some(item => item.props.role === 'listbox'), false);
});

test('typing fires onType with the raw value; keyboard events dispatch mapped events with preventDefault', () => {
  let typed: string | undefined;
  const events: Array<Record<string, unknown>> = [];
  const state = withSuggestions(initialLiveSearchState('ma'), [{ id: 's-1', title: 'Alpha' }]);
  const tree = LiveSearchView({ ...popupBase, state,
    onType: (value: string) => { typed = value; },
    onEvent: (event: Record<string, unknown>) => { events.push(event); },
    onPick: () => {}, onFallbackSubmit: () => {} }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search')!;
  (input.props.onChange as (event: unknown) => void)({ target: { value: 'mar' } });
  assert.equal(typed, 'mar');
  assert.deepEqual(plain(events), [{ type: 'change', text: 'mar' }]);
  assert.equal(keyDown(input.props, 'ArrowDown'), true);
  assert.equal(events.at(-1)?.type, 'highlight');
  assert.equal(keyDown(input.props, 'Escape'), true);
  assert.equal(events.at(-1)?.type, 'escape');
  // Enter with no active option = the explicit full-page fallback, never a
  // plain-typing navigation.
  assert.equal(keyDown(input.props, 'Enter'), true);
  assert.equal(events.at(-1)?.type, 'commit');
});

test('Enter on the active option picks that suggestion, not a fallback', () => {
  let picked: { id: string; title: string } | undefined;
  const events: Array<Record<string, unknown>> = [];
  let fallback: string | undefined;
  const state = withSuggestions(initialLiveSearchState('ma'), [{ id: 's-1', title: 'Alpha' }]);
  const tree = LiveSearchView({ ...popupBase, state: { ...state, activeIndex: 0 },
    onEvent: (event: Record<string, unknown>) => { events.push(event); },
    onPick: (suggestion: { id: string; title: string }) => { picked = suggestion; },
    onFallbackSubmit: (value: string) => { fallback = value; } }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search')!;
  assert.equal(keyDown(input.props, 'Enter'), true);
  assert.deepEqual(picked, { id: 's-1', title: 'Alpha' });
  assert.deepEqual(plain(events), [{ type: 'pick' }]);
  assert.equal(fallback, undefined);
});

test('the fallback submit receives the trimmed text', () => {
  let fallback: string | undefined;
  const tree = LiveSearchView({ ...popupBase,
    state: { ...initialLiveSearchState(''), text: '  mar  ' },
    onFallbackSubmit: (value: string) => { fallback = value; } }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search')!;
  assert.equal(keyDown(input.props, 'Enter'), true);
  assert.equal(fallback, 'mar');
});

test('clicking an option picks it without navigation machinery', () => {
  let picked: { id: string } | undefined;
  const events: Array<Record<string, unknown>> = [];
  const state = withSuggestions(initialLiveSearchState('ma'), [{ id: 's-1', title: 'Alpha' }]);
  const tree = LiveSearchView({ ...popupBase, state,
    onEvent: (event: Record<string, unknown>) => { events.push(event); },
    onPick: (suggestion: { id: string }) => { picked = suggestion; } }) as unknown;
  const option = elements(tree).find(item => item.props.role === 'option')!;
  (option.props.onClick as () => void)();
  assert.deepEqual(plain(picked), { id: 's-1', title: 'Alpha' });
  assert.deepEqual(plain(events), [{ type: 'pick' }]);
});

test('blur closes the popup via a close event', () => {
  const events: Array<Record<string, unknown>> = [];
  const state = withSuggestions(initialLiveSearchState('ma'), [{ id: 's-1', title: 'Alpha' }]);
  const tree = LiveSearchView({ ...popupBase, state,
    onEvent: (event: Record<string, unknown>) => { events.push(event); } }) as unknown;
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search')!;
  (input.props.onBlur as () => void)();
  assert.deepEqual(plain(events), [{ type: 'close' }]);
});

// --- headless mode (single-mode pickers: the filtered list IS the result) ---

test('headless mode renders no listbox and reports results through renderSuggestions', () => {
  let rendered: { suggestions: unknown; query: string; loading: boolean } | undefined;
  const state = withSuggestions(initialLiveSearchState('ma'), [{ id: 's-1', title: 'Alpha' }]);
  const tree = LiveSearchView({ ...popupBase, mode: 'headless', state,
    toolbarEnd: jsx.jsx('span', { children: '34' }),
    renderSuggestions: (suggestions: unknown, query: string, loading: boolean) => {
      rendered = { suggestions, query, loading };
      return jsx.jsx('div', { 'data-result-area': true });
    } }) as unknown;
  assert.equal(elements(tree).some(item => item.props.role === 'listbox'), false);
  const input = elements(tree).find(item => item.props['data-live-search-input'] === 'test-search');
  assert.ok(input);
  assert.equal(input?.props.role, undefined, 'headless is a plain search input, not a combobox');
  assert.deepEqual(rendered, { suggestions: state.suggestions, query: 'ma', loading: false });
  assert.equal(elements(tree).some(item => item.props['data-result-area'] === true), true);
  assert.equal(textOf(tree).includes('34'), true, 'toolbarEnd (counter chip) renders beside the input');
});

test('headless mode with a blank query still renders the result area (the base list)', () => {
  let rendered: { suggestions: unknown; query: string } | undefined;
  const tree = LiveSearchView({ ...popupBase, mode: 'headless',
    state: initialLiveSearchState(''),
    renderSuggestions: (suggestions: unknown, query: string) => {
      rendered = { suggestions, query };
      return jsx.jsx('div', { 'data-result-area': true });
    } }) as unknown;
  assert.deepEqual(plain(rendered), { suggestions: [], query: '' });
  assert.equal(elements(tree).some(item => item.props['data-result-area'] === true), true);
});

// --- endpoint fetcher ---

test('suggestViaEndpoint GETs the admin suggest route with the encoded query', async () => {
  fetchCalls = [];
  fetchResponse = () => ({ ok: true, json: async () => ({ suggestions: [{ id: 'x', title: 'X' }] }) });
  const fetcher = suggestViaEndpoint('plans');
  const suggestions = await fetcher('red tailor') as unknown[];
  assert.deepEqual(fetchCalls, ['/admin/suggest/plans?q=red%20tailor']);
  assert.deepEqual(suggestions, [{ id: 'x', title: 'X' }]);
});

test('suggestViaEndpoint degrades to no suggestions on a failed request', async () => {
  fetchCalls = [];
  fetchResponse = () => ({ ok: false, status: 403, json: async () => ({}) });
  const suggestions = await suggestViaEndpoint('users')('ma');
  assert.deepEqual(plain(suggestions), []);
});

test('the debounce matches the ratified ~250ms budget', () => {
  assert.equal(SUGGEST_DEBOUNCE_MS, 250);
});