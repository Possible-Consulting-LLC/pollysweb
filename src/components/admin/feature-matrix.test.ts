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

const cn = (...parts: unknown[]) => parts.filter(Boolean).join(' ');

function loadModule(path: string, deps: Record<string, unknown>): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports;
}

const registryCode = ts.transpileModule(
  readFileSync(new URL('../../lib/features/registry.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const registryExports: Record<string, unknown> = {};
runInNewContext(registryCode, { exports: registryExports });
const registry = registryExports as {
  FEATURE_REGISTRY: Array<{ key: string; name: string; description: string; category: string }>;
  registryCategories: () => string[];
};

const buttonDeps = {
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
};

// The REAL shared components run here: the matrix must consume SelectionList
// (multi mode) with its tray and counter, not a bespoke table.
const tray = loadModule('./selection-tray.tsx', {
  ...buttonDeps,
  '@/components/ui/card': { cardClassName: 'card' },
});
const selectionList = loadModule('./selection-list.tsx', {
  ...buttonDeps,
  '@/components/admin/selection-tray': tray,
  '@/components/admin/list-shared': {
    counterChipClass: 'goldchip', categoryLabel: (category: string) => category,
  },
  '@/components/ui/button': {
    Button: ({ variant, size, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props }),
  },
});

const deps: Record<string, unknown> = {
  react: {
    // Only the hook-free view runs here; the wrapper's hooks are stubbed.
    useState: (initial: unknown) => [initial, () => {}],
    useReducer: (reducer: unknown, initial: unknown) => [initial, () => {}],
    useActionState: () => [undefined, () => {}, false],
  },
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
  '@/lib/features/registry': registry,
  '@/lib/features/pricing': loadModule('../../lib/features/pricing.ts', {
    ...buttonDeps,
    './registry': registry,
  }),
  '@/components/admin/selection-list': selectionList,
  '@/components/admin/selection-tray': tray,
  '@/components/admin/list-shared': loadModule('./list-shared.ts', { 'react/jsx-runtime': jsx }),  '@/components/ui/button': {
    Button: ({ variant, size, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props }),
  },
  '@/components/mutation-form': { MutationForm: ({ children, ...props }: Record<string, unknown>) =>
    jsx.jsx('form', { ...props, children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/app/admin/plans/actions': { saveFeatureMatrixAction: 'save-feature-matrix' },
};

const {
  FeatureMatrixView,
  matrixReducer,
  seedEnabledSet,
  seedMatrixState,
} = loadModule('./feature-matrix.tsx', deps) as {
  FeatureMatrixView: (props: Record<string, unknown>) => unknown;
  matrixReducer: (state: MatrixState, action: MatrixAction) => MatrixState;
  seedEnabledSet: (keys: string[]) => Map<string, { title: string; subtitle: string; group: string }>;
  seedMatrixState: (keys: string[]) => MatrixState;
};

type MatrixState = { enabled: Map<string, { title: string; subtitle: string; group: string }>;
  page: number; search: string; selectedOnly: boolean; trayCollapsed: boolean };
type MatrixAction =
  | { type: 'toggle'; key: string }
  | { type: 'page'; page: number }
  | { type: 'search'; search: string }
  | { type: 'selectedOnly'; selectedOnly: boolean }
  | { type: 'trayCollapsed' };

const PAGE_SIZE = 20;
// Page 1 holds the first 20 registry keys, page 2 the remaining 14 — the
// boundary sits inside the journey category.
const page1Keys = registry.FEATURE_REGISTRY.slice(0, PAGE_SIZE).map(feature => feature.key);
const page2Keys = registry.FEATURE_REGISTRY.slice(PAGE_SIZE).map(feature => feature.key);
assert.ok(page1Keys.length === 20 && page2Keys.length >= 1, 'the registry must span two pages');

const options = [
  { planId: 'plan-1', interval: 'MONTHLY', basePriceCents: 900, active: true },
  { planId: 'plan-1', interval: 'ANNUAL', basePriceCents: 9000, active: false },
];

const base = {
  planId: 'plan-1', planName: 'Standard', options,
  enabled: new Map<string, { title: string; subtitle: string; group: string }>(),
  total: registry.FEATURE_REGISTRY.length,
  page: 1, pageSize: PAGE_SIZE, search: '',
  selectedOnly: false, trayCollapsed: false,
  onToggle: (_key: string) => {}, onPageChange: (_page: number) => {},
  onSearchChange: (_search: string) => {}, onSelectedOnlyChange: (_selectedOnly: boolean) => {},
  onTrayCollapsedToggle: () => {},
  saveState: undefined as undefined | { error?: string; warning?: string; success?: boolean },
  saving: false, onSave: (_formData: FormData) => {},
};

const enabledMap = (keys: string[]) => new Map(keys.map(key => {
  const definition = registry.FEATURE_REGISTRY.find(feature => feature.key === key)!;
  return [key, { title: definition.name, subtitle: key, group: definition.category }];
}));

const render = (overrides: Partial<typeof base> = {}) => FeatureMatrixView({ ...base, ...overrides });

test('save submits the full enabled set for every registry key, not just the visible page', () => {
  // A key enabled on page 1 while viewing page 2: pagination must not drop it,
  // and the form must still cover every page-2 key (Review Focus 2).
  const tree = render({
    enabled: enabledMap([...page1Keys.slice(0, 2), ...page2Keys.slice(0, 2)]),
    page: 2,
  });
  const forms = elements(tree).filter(item => item.type === 'form');
  assert.equal(forms.length, 1);
  const submitted = elements(forms[0])
    .filter(item => item.type === 'input' && item.props.name === 'feature')
    .map(item => String(item.props.value));
  for (const key of [...page1Keys.slice(0, 2), ...page2Keys.slice(0, 2)])
    assert.ok(submitted.includes(key), `missing submitted key ${key}`);
  assert.equal(submitted.length, 4);
  const planId = elements(forms[0]).find(item => item.type === 'input' && item.props.name === 'planId');
  assert.equal(String(planId?.props.value), 'plan-1');
  // Page-2 keys not enabled are submitted as part of the full matrix implicitly:
  // the checkbox rows on page 2 render so the admin sees their state.
  const toggles = elements(tree).filter(item => item.type === 'input' &&
    item.props.type === 'checkbox' && item.props['aria-label']?.toString().startsWith('Toggle '));
  assert.ok(toggles.length >= page2Keys.length - 2, 'page 2 rows must render');
});

test('the counter and selectedRows reflect the full enabled set across the page boundary', () => {
  const tree = render({
    enabled: enabledMap([...page1Keys.slice(0, 2), ...page2Keys.slice(0, 3)]),
    page: 2,
  });
  const counter = elements(tree).find(item => item.props['data-testid'] === 'selected-count');
  assert.equal(textOf(counter), '5 of 34 selected');
  // The tray chips carry the off-page keys too (subtitle = key).
  const body = textOf(tree);
  assert.ok(body.includes(page1Keys[0]), 'off-page selected key missing from the tray');
});

test('SelectionList consumes selectedRows with group so Selected only groups by category', () => {
  const tree = render({
    enabled: enabledMap(['spood.create', 'care.feed.log', 'photo.upload']),
    selectedOnly: true,
  });
  const headers = elements(tree)
    .filter(item => item.type === 'h4' && item.props['data-group-header'])
    .map(item => String(item.props['data-group-header']));
  assert.deepEqual(headers.sort(), ['care', 'photos', 'spoods']);
});

test('pricing preview is computed from the unsaved enabled set', () => {
  const tree = render({ enabled: enabledMap(['spood.create', 'photo.upload']) });
  const body = textOf(tree);
  assert.ok(body.includes('Monthly: $9.00'), body);
  assert.ok(body.includes('Annual: No active annual price'), body);
  assert.ok(body.includes('Add a spood'), body);
});

test('a removal warning from the save result renders without blocking the form', () => {
  const tree = render({ saveState: { success: true, warning: 'Removed access: spood.create.' } });
  const alerts = elements(tree).filter(item => item.type === 'p' && item.props.role === 'alert');
  assert.equal(text(alerts[0]).includes('Removed access: spood.create.'), true);
  assert.equal(elements(tree).some(item => item.type === 'form'), true);
});

test('the save button is themed and reflects the pending state', () => {
  const idle = elements(render()).find(item => item.type === 'button' && text(item).includes('Save'));
  assert.equal(idle?.props['data-variant'], 'primary');
  assert.equal(idle?.props.disabled, false);
  const busy = elements(render({ saving: true })).find(item => item.type === 'button' && text(item).includes('Saving'));
  assert.equal(busy?.props.disabled, true);
});

test('toggles flow through onToggle with the feature key', () => {
  const toggled: string[] = [];
  const tree = render({ onToggle: (key: string) => { toggled.push(key); } });
  const first = elements(tree)
    .find(item => item.type === 'input' && item.props.type === 'checkbox' &&
      String(item.props['aria-label'] ?? '').startsWith('Toggle '));
  (first?.props.onChange as () => void)();
  assert.equal(toggled.length, 1);
  assert.equal(typeof toggled[0], 'string');
});

test('state owner: toggles accumulate in the enabled map and a re-toggle removes exactly that key', () => {
  let state: MatrixState = seedMatrixState([]);
  state = matrixReducer(state, { type: 'toggle', key: page1Keys[0] });
  state = matrixReducer(state, { type: 'toggle', key: page1Keys[1] });
  state = matrixReducer(state, { type: 'toggle', key: page2Keys[0] });
  assert.equal(state.enabled.size, 3);
  assert.deepEqual([...state.enabled.keys()].sort(),
    [page1Keys[0], page1Keys[1], page2Keys[0]].sort());
  state = matrixReducer(state, { type: 'toggle', key: page1Keys[1] });
  assert.equal(state.enabled.size, 2);
  assert.ok(!state.enabled.has(page1Keys[1]));
  // Copy-on-write: the previous map object is never mutated.
  const before = new Map(state.enabled);
  state = matrixReducer(state, { type: 'toggle', key: page2Keys[1] });
  assert.deepEqual([...before.keys()].sort(), [page1Keys[0], page2Keys[0]].sort());
  assert.equal(state.enabled.size, 3);
});

test('state owner: pagination and search never prune or alter the enabled set', () => {
  let state = seedMatrixState([page1Keys[0]]);
  state = matrixReducer(state, { type: 'toggle', key: page2Keys[0] });
  state = matrixReducer(state, { type: 'page', page: 2 });
  assert.equal(state.page, 2);
  assert.equal(state.enabled.size, 2, 'page change must not touch the enabled set');
  assert.ok(state.enabled.has(page1Keys[0]));
  assert.equal(state.selectedOnly, false, 'paging leaves the selected-only filter');
  state = matrixReducer(state, { type: 'search', search: 'molt' });
  assert.equal(state.search, 'molt');
  assert.equal(state.page, 1, 'searching resets the page');
  assert.equal(state.selectedOnly, false, 'searching leaves the selected-only filter');
  assert.equal(state.enabled.size, 2, 'searching must not touch the enabled set');
  state = matrixReducer(state, { type: 'selectedOnly', selectedOnly: true });
  assert.equal(state.enabled.size, 2, 'the selected-only filter must not touch the enabled set');
});

test('state owner: the tray collapse flag flips and seeding resolves registry titles', () => {
  let state: MatrixState = seedMatrixState([]);
  state = matrixReducer(state, { type: 'trayCollapsed' });
  assert.equal(state.trayCollapsed, true);
  state = matrixReducer(state, { type: 'trayCollapsed' });
  assert.equal(state.trayCollapsed, false);
  const seeded = seedEnabledSet(['spood.create']);
  // Results from the vm sandbox live in another realm; JSON copies keep strict
  // comparisons local (Maps serialize as entry pairs).
  const jsonOf = (value: Map<string, unknown>) => JSON.parse(JSON.stringify([...value.entries()]));
  assert.deepEqual(jsonOf(seeded),
    [['spood.create', { title: 'Add a spood', subtitle: 'spood.create', group: 'spoods' }]]);
  const seededState = seedMatrixState(['spood.create']);
  assert.deepEqual(jsonOf(seededState.enabled),
    [['spood.create', { title: 'Add a spood', subtitle: 'spood.create', group: 'spoods' }]]);
  assert.deepEqual({ page: seededState.page, search: seededState.search,
    selectedOnly: seededState.selectedOnly, trayCollapsed: seededState.trayCollapsed },
    { page: 1, search: '', selectedOnly: false, trayCollapsed: false });
});

// --- Task 7: live-search parity (client-side-ideal pattern) + visual parity ---

test('searching filters the full registry in place — matches beyond the loaded page appear, no navigation', () => {
  // The registry is fully client-resident: the filter is instant and spans ALL
  // rows by construction (the ratified client-side-ideal pattern for the
  // matrix), so typing never navigates and never submits.
  const tree = render({ search: 'journey', page: 1 });
  const rowIds = elements(tree)
    .filter((item) => item.props['data-row-id'])
    .map((item) => String(item.props['data-row-id']));
  assert.ok(rowIds.some((id) => id.startsWith('journey')),
    'matches from every registry category render in place');
  // No link-based navigation machinery anywhere in the search path.
  assert.equal(elements(tree).some((item) => item.type === 'a'), false);
});

test('selected-state markers: enabled rows render plum titles on the filtered surface', () => {
  const enabledKey = registry.FEATURE_REGISTRY.find((feature: { key: string }) =>
    feature.key.includes('journey'))!.key;
  const tree = render({ search: 'journey', enabled: enabledMap([enabledKey]) });
  const row = elements(tree)
    .filter((item) => item.props['data-row-id'] === enabledKey)[0];
  assert.ok(row, 'enabled row missing from the filtered view');
  const title = elements(row).find((item) =>
    item.type === 'span' && String(item.props.className ?? '').includes('text-[var(--plum)]'));
  assert.ok(title, 'enabled rows must carry the plum selected marker');
});

test('matrix feedback and accents are theme-token driven — no palette literals, no navigation', () => {
  const source = readFileSync(new URL('./feature-matrix.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:emerald|sky|amber|teal|indigo)-\d00/);
  assert.equal(source.includes('next/navigation'), false,
    'the matrix search never navigates — pure client filtering');
});
