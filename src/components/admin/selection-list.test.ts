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
  // Nested function components (e.g. the ui/button stub and the real
  // SelectionTray) are resolved by calling them with their props, since no
  // React renderer is involved.
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

/** Transpile-and-run a component module against stubbed dependencies. */
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

// The real shared SelectionTray is exercised, not a stub: its card dependency
// is stubbed to a class string and everything else runs as written.
const trayExports = loadModule('./selection-tray.tsx', {
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
  '@/components/ui/card': { cardClassName: 'card' },
});

// Real shared class constants (mockup parity lives in one place).
const listSharedExports = (() => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL('./list-shared.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports });
  return exports;
})();

// Button stub preserves variant/size plus every handler/aria prop so tests
// can assert variant choice, disabled state and fired callbacks.
const SelectionList = loadModule('./selection-list.tsx', {
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
  '@/components/ui/card': { cardClassName: 'card' },
  '@/components/admin/list-shared': listSharedExports,
  '@/components/ui/button': {
    Button: ({ variant, size, className, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', className, ...props }),
  },
  '@/components/admin/selection-tray': trayExports,
}).SelectionList as (props: Record<string, unknown>) => unknown;

const baseRows = [
  { id: 'alpha', title: 'Alpha', selected: true },
  { id: 'beta', title: 'Beta' },
  { id: 'gamma', title: 'Gamma', subtitle: 'The third one', disabled: true },
];

const baseProps = { rows: baseRows, total: 45, page: 2, pageSize: 20, search: '', selectedCount: 3 };

const selectedRowsProp = [
  { id: 'alpha', title: 'Alpha', subtitle: 'First pick' },
  { id: 'zeta', title: 'Zeta', subtitle: 'From page 2' },
];

function buttons(tree: unknown): Element[] {
  return elements(tree).filter((item) => item.type === 'button');
}

function findByLabel(tree: unknown, label: string): Element | undefined {
  return elements(tree).find((item) => item.props['aria-label'] === label);
}

test('renders every row with titles, subtitles, the selection counter and the page label', () => {
  const rendered = textOf(SelectionList(baseProps));
  assert.match(rendered, /Alpha/);
  assert.match(rendered, /Beta/);
  assert.match(rendered, /Gamma/);
  assert.match(rendered, /The third one/);
  assert.match(rendered, /3 of 45 selected/);
  assert.match(rendered, /Page 2 of 3/);
});

test('empty lists fall back to the empty label', () => {
  const rendered = textOf(SelectionList({ ...baseProps, rows: [], total: 0, page: 1, emptyLabel: 'No rows match.' }));
  assert.match(rendered, /No rows match\./);
});

test('row checkboxes fire onToggle with the row id and reflect selection state', () => {
  let toggled: string | undefined;
  const tree = SelectionList({ ...baseProps, onToggle: (id: string) => { toggled = id; } });
  const alpha = findByLabel(tree, 'Toggle Alpha');
  assert.ok(alpha, 'toggle for Alpha not rendered');
  assert.equal(alpha.props.type, 'checkbox');
  assert.equal(alpha.props.checked, true);
  const beta = findByLabel(tree, 'Toggle Beta');
  assert.equal(beta?.props.checked, false);
  (alpha.props.onChange as () => void)();
  assert.equal(toggled, 'alpha');
});

test('disabled rows render inert controls', () => {
  const tree = SelectionList(baseProps);
  const gamma = findByLabel(tree, 'Toggle Gamma');
  assert.ok(gamma, 'toggle for Gamma not rendered');
  assert.equal(gamma.props.disabled, true);
});

test('prev/next fire onPageChange with the neighbouring page numbers and disable at bounds', () => {
  let page: number | undefined;
  const tree = SelectionList({ ...baseProps, onPageChange: (p: number) => { page = p; } });
  const prev = findByLabel(tree, 'Previous page');
  const next = findByLabel(tree, 'Next page');
  assert.ok(prev && next);
  assert.equal(prev.props.disabled, false);
  assert.equal(next.props.disabled, false);
  (prev.props.onClick as () => void)();
  assert.equal(page, 1);
  (next.props.onClick as () => void)();
  assert.equal(page, 3);
  const first = SelectionList({ ...baseProps, page: 1 }) as unknown;
  assert.equal(findByLabel(first, 'Previous page')?.props.disabled, true);
  const last = SelectionList({ ...baseProps, page: 3 }) as unknown;
  assert.equal(findByLabel(last, 'Next page')?.props.disabled, true);
});

test('search input fires onSearchChange with the typed value', () => {
  let search: string | undefined;
  const tree = SelectionList({ ...baseProps, onSearchChange: (s: string) => { search = s; } });
  const input = elements(tree).find((item) => item.type === 'input');
  assert.ok(input, 'search input not rendered');
  assert.equal(input.props.value, '');
  (input.props.onChange as (event: unknown) => void)({ target: { value: 'photo' } });
  assert.equal(search, 'photo');
});

test('group headers render in the given order when groups are provided', () => {
  const tree = SelectionList({
    ...baseProps,
    rows: [
      { id: 'b2', title: 'Beta two', group: 'Two', selected: true },
      { id: 'a1', title: 'Alpha one', group: 'One' },
      { id: 'free', title: 'Ungrouped row' },
    ],
    groups: ['One', 'Two'],
  });
  const headers = elements(tree)
    .filter((item) => typeof item.props['data-group-header'] === 'string')
    .map((item) => item.props['data-group-header']);
  assert.deepEqual(headers, ['One', 'Two']);
  const rendered = textOf(tree);
  assert.match(rendered, /Beta two/);
  assert.match(rendered, /Alpha one/);
  assert.match(rendered, /Ungrouped row/);
});

test('toggle-all fires with the eligible row ids on the page', () => {
  let toggledAll: string[] | undefined;
  const tree = SelectionList({ ...baseProps, onToggleAll: (ids: string[]) => { toggledAll = ids; } });
  const all = findByLabel(tree, 'Toggle all on page');
  assert.ok(all, 'toggle-all not rendered');
  assert.equal(all.props.disabled, false);
  (all.props.onClick as () => void)();
  assert.deepEqual(toggledAll, ['alpha', 'beta']);
});

// --- Selection review tray (multi mode) ---

test('the shared tray renders every selected row together, from any page', () => {
  // Only Alpha is on the current page; Zeta was selected pages ago.
  const tree = SelectionList({ ...baseProps, rows: [baseRows[0]], selectedRows: selectedRowsProp });
  const rendered = textOf(tree);
  assert.match(rendered, /Selected \(2\)/);
  assert.match(rendered, /Alpha/);
  assert.match(rendered, /First pick/);
  assert.match(rendered, /Zeta/);
  assert.match(rendered, /From page 2/);
});

test('tray chip removal fires onToggle with the deselected id', () => {
  let toggled: string | undefined;
  const tree = SelectionList({ ...baseProps, selectedRows: selectedRowsProp, onToggle: (id: string) => { toggled = id; } });
  const chip = findByLabel(tree, 'Deselect Zeta');
  assert.ok(chip, 'tray chip for Zeta not rendered');
  (chip.props.onClick as () => void)();
  assert.equal(toggled, 'zeta');
});

test('the tray collapses only when the parent asks', () => {
  const expanded = SelectionList({ ...baseProps, selectedRows: selectedRowsProp }) as unknown;
  const expandToggle = buttons(expanded).find((item) => textOf(item).includes('Selected (2)'));
  assert.ok(expandToggle, 'tray header not rendered');
  assert.equal(expandToggle.props['aria-expanded'], true);
  assert.match(textOf(expanded), /Zeta/);
  const collapsed = SelectionList({ ...baseProps, selectedRows: selectedRowsProp, trayCollapsed: true }) as unknown;
  const collapseToggle = buttons(collapsed).find((item) => textOf(item).includes('Selected (2)'));
  assert.ok(collapseToggle, 'collapsed tray header not rendered');
  assert.equal(collapseToggle.props['aria-expanded'], false);
  assert.doesNotMatch(textOf(collapsed), /Zeta/);
});

test('"Selected only" is a paginated filter over the same list (toolbar, pager, counter stay live)', () => {
  let shown: boolean | undefined;
  const normal = SelectionList({ ...baseProps, selectedRows: selectedRowsProp, onSelectedOnlyChange: (v: boolean) => { shown = v; } }) as unknown;
  // Mockup affordance (INT:82): a checkbox in the tray head, not a Button.
  const toggle = elements(normal).find((item) => item.props['data-testid'] === 'selected-only-toggle');
  assert.ok(toggle, '"Selected only" checkbox missing from the tray');
  const box = elements(toggle).find((item) => item.type === 'input');
  assert.ok(box, 'checkbox affordance missing');
  (box.props.onChange as () => void)();
  assert.equal(shown, true);

  // Active: the host pages over the selected rows; the SAME toolbar, pager,
  // and counter stay live over the narrowed set (mockup INT:160, 176-180).
  const filtered = SelectionList({
    ...baseProps, rows: [
      { id: 'alpha', title: 'Alpha', selected: true, subtitle: 'First pick' },
      { id: 'zeta', title: 'Zeta', selected: true, subtitle: 'From page 2' },
    ], total: 2, page: 1, pageSize: 1, selectedRows: selectedRowsProp, selectedOnly: true,
  }) as unknown;
  const rendered = textOf(filtered);
  assert.match(rendered, /Zeta/);
  assert.match(rendered, /Alpha/);
  assert.doesNotMatch(rendered, /Beta/);
  // The toolbar, counter, and pager stay live — the old unpaged dump is gone.
  assert.ok(elements(filtered).some((item) => item.props['data-testid'] === 'list-toolbar'));
  assert.ok(elements(filtered).some((item) => item.props['data-testid'] === 'selected-count'));
  assert.ok(elements(filtered).some((item) => item.props['data-testid'] === 'list-pager'),
    'selected-only pages recompute over the selected rows');
  const page2 = SelectionList({
    ...baseProps, rows: [
      { id: 'zeta', title: 'Zeta', selected: true, subtitle: 'From page 2' },
    ], total: 2, page: 2, pageSize: 1, selectedRows: selectedRowsProp, selectedOnly: true,
  }) as unknown;
  assert.match(textOf(page2), /Zeta/);
  assert.match(textOf(page2), /Page 2 of 2/);
});

test('no tray and no "Selected only" toggle when selectedRows is absent or empty', () => {
  for (const selectedRows of [undefined, []]) {
    const tree = SelectionList({ ...baseProps, selectedRows }) as unknown;
    assert.equal(findByLabel(tree, 'Deselect Alpha'), undefined);
    assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'selected-only-toggle'), false,
      '"Selected only" must be gone without a selection');
    assert.doesNotMatch(textOf(tree), /Selected \(2\)/);
  }
});

// --- Task 8 fix round 1: row toggling, footer slot, placeholder, pager hiding ---

test('multi-mode rows click-to-toggle like the mockup\'s delegated rows (no double fire)', () => {
  let toggles = 0;
  const toggled: string[] = [];
  const tree = SelectionList({ ...baseProps,
    onToggle: (id: string) => { toggles += 1; toggled.push(id); } }) as unknown;
  // Clicking the row (not the checkbox) toggles.
  const row = elements(tree).find((item) => item.props['data-row-id'] === 'beta');
  assert.ok(row, 'row missing');
  (row.props.onClick as (event: unknown) => void)({ target: { tagName: 'SPAN' } });
  assert.deepEqual(toggled, ['beta']);
  // A click on the checkbox itself delegates once — no double fire.
  (row.props.onClick as (event: unknown) => void)({ target: { tagName: 'INPUT' } });
  assert.equal(toggles, 1, 'checkbox-originated clicks toggle once');
  // Disabled rows stay inert.
  const gamma = elements(tree).find((item) => item.props['data-row-id'] === 'gamma');
  assert.ok(gamma, 'disabled row missing');
  (gamma.props.onClick as (event: unknown) => void)({ target: { tagName: 'SPAN' } });
  assert.equal(toggles, 1);
});

test('the footer hosts the primary action slot beside the pager (mockup "Save matrix")', () => {
  let clicked = false;
  const action = jsx.jsx('button', { 'data-footer-action': true,
    onClick: () => { clicked = true; } });
  const tree = SelectionList({ ...baseProps, footerAction: action }) as unknown;
  const footer = elements(tree).filter((item) => item.props['data-footer-action']);
  assert.equal(footer.length, 1, 'the footer action renders in the list footer');
  (footer[0].props.onClick as () => void)();
  assert.equal(clicked, true);
  // The pager and the action share the footer row.
  assert.ok(findByLabel(tree, 'Previous page'), 'pager still renders beside the action');
});

test('toggle-all stays, moves to the footer arrangement around the action slot', () => {
  const tree = SelectionList({ ...baseProps, onToggleAll: () => {},
    footerAction: jsx.jsx('button', { children: 'Save matrix' }) }) as unknown;
  const all = findByLabel(tree, 'Toggle all on page');
  assert.ok(all, 'toggle-all missing');
  const save = buttons(tree).find((item) => textOf(item) === 'Save matrix');
  assert.ok(save, 'footer action missing');
  // Both sit on the action side of the footer, pager on the other.
  assert.ok(findByLabel(tree, 'Previous page'));
});

test('the pager footer hides when totalPages ≤ 1; the action still renders', () => {
  const single = SelectionList({ ...baseProps, total: 3, page: 1, pageSize: 20 }) as unknown;
  assert.equal(findByLabel(single, 'Previous page'), undefined, 'pager hidden on one page');
  assert.equal(findByLabel(single, 'Next page'), undefined);
  const withAction = SelectionList({ ...baseProps, total: 3, page: 1, pageSize: 20,
    footerAction: jsx.jsx('button', { children: 'Save matrix' }) }) as unknown;
  assert.equal(findByLabel(withAction, 'Previous page'), undefined);
  assert.match(textOf(withAction), /Save matrix/, 'the footer action survives');
});

test('the default search input carries the mockup placeholder and the empty state echoes the query', () => {
  const tree = SelectionList({ ...baseProps, rows: [], total: 0, page: 1, search: 'molt' }) as unknown;
  const input = elements(tree).find((item) => item.type === 'input' && item.props.type !== 'checkbox');
  assert.equal(input?.props.placeholder, 'Search features…');
  assert.match(textOf(tree), /Nothing matches “\s*molt\s*”\./);
  const idle = SelectionList({ ...baseProps, rows: [], total: 0, page: 1, search: '',
    emptyLabel: 'No rows match.' }) as unknown;
  assert.match(textOf(idle), /No rows match\./);
});

// --- Single selection mode ---

const singleRows = [
  { id: 'alpha', title: 'Alpha' },
  { id: 'beta', title: 'Beta' },
  { id: 'gamma', title: 'Gamma', subtitle: 'The third one', disabled: true },
];
const singleProps = { rows: singleRows, total: 45, page: 2, pageSize: 20, search: '', selectedCount: 1, selectionMode: 'single' };

test('single mode renders no checkboxes and no selection counter', () => {
  const tree = SelectionList(singleProps) as unknown;
  assert.equal(elements(tree).some((item) => item.props.role === 'checkbox'), false);
  assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'selected-count'), false);
});

test('single mode rows fire the row-select callback on click', () => {
  let picked: string | undefined;
  const tree = SelectionList({ ...singleProps, onRowSelect: (id: string) => { picked = id; } }) as unknown;
  const row = buttons(tree).find((item) => textOf(item).includes('Beta'));
  assert.ok(row, 'clickable row for Beta not rendered');
  assert.equal(row.props['aria-pressed'], false);
  (row.props.onClick as () => void)();
  assert.equal(picked, 'beta');
});

test('single mode with a selection shows the focused view and a change affordance', () => {
  let changed = false;
  const tree = SelectionList({
    ...singleProps,
    rows: [
      { id: 'beta', title: 'Beta', selected: true, subtitle: 'Chosen one' },
      { id: 'gamma', title: 'Gamma' },
    ],
    onChange: () => { changed = true; },
  }) as unknown;
  const rendered = textOf(tree);
  assert.match(rendered, /Beta/);
  assert.match(rendered, /Chosen one/);
  assert.doesNotMatch(rendered, /Gamma/);
  assert.equal(elements(tree).some((item) => item.type === 'input'), false);
  const change = buttons(tree).find((item) => textOf(item) === 'Change');
  assert.ok(change, 'change affordance not rendered');
  (change.props.onClick as () => void)();
  assert.equal(changed, true);
});

test('single mode focused view keeps the row anatomy: leading avatar glyph and meta badge', () => {
  const tree = SelectionList({
    ...singleProps,
    rows: [
      { id: 'beta', title: 'Beta', selected: true, subtitle: 'Chosen one',
        leading: 'BE', badge: { label: 'Selected', tone: 'selected' } },
      { id: 'gamma', title: 'Gamma' },
    ],
  }) as unknown;
  // U1: the focused view renders the same leading glyph as the list row.
  const avatar = elements(tree).find((item) => item.props['data-row-avatar']);
  assert.ok(avatar, 'focused view dropped the leading avatar glyph');
  assert.equal(avatar.props['data-row-avatar'], 'BE');
  assert.equal(String(avatar.props.className).includes('rounded-full'), true);
  // U3: the focused row carries the mockup's gold "Selected" badge.
  const badge = elements(tree).find((item) => item.props['data-row-badge'] === 'Selected');
  assert.ok(badge, 'focused view missing the Selected badge');
  assert.equal(String(badge.props.className).includes('bg-[var(--gold)]'), true);
});

test('single mode focused view can draw the selected row from the parent-selected set', () => {
  const tree = SelectionList({
    ...singleProps,
    rows: [{ id: 'delta', title: 'Delta' }],
    selectedRows: [{ id: 'zeta', title: 'Zeta', selected: true }],
  }) as unknown;
  assert.match(textOf(tree), /Zeta/);
  assert.doesNotMatch(textOf(tree), /Delta/);
});

test('single mode without a selection renders the full searchable list', () => {
  const tree = SelectionList(singleProps) as unknown;
  const rendered = textOf(tree);
  assert.match(rendered, /Alpha/);
  assert.match(rendered, /Beta/);
  assert.match(rendered, /Gamma/);
  assert.equal(elements(tree).some((item) => item.type === 'input'), true);
  assert.equal(findByLabel(tree, 'Next page') !== undefined, true);
});

// --- Task 7: mockup-exact live-search toolbar + freestanding rows ---

test('the toolbar pairs the search input with the gold "N of M selected" counter chip', () => {
  const tree = SelectionList(baseProps) as unknown;
  const toolbar = elements(tree).find((item) => item.props['data-testid'] === 'list-toolbar');
  assert.ok(toolbar, 'toolbar row missing');
  const chip = elements(toolbar).find((item) => item.props['data-testid'] === 'selected-count');
  assert.ok(chip, 'counter chip missing from the toolbar');
  assert.equal(textOf(chip), '3 of 45 selected');
  assert.equal(String(chip.props.className).includes('bg-[var(--gold)]'), true,
    'counter chip is the gold pill');
  assert.equal(String(chip.props.className).includes('rounded-full'), true);
  // The chip sits beside the search input in the same toolbar row.
  assert.equal(elements(toolbar).some((item) => item.type === 'input'), true);
});

test('rows are freestanding hover-tinted elements with plum selected titles — no card enclosure', () => {
  const tree = SelectionList(baseProps) as unknown;
  const rows = elements(tree).filter((item) => item.props['data-row-id']);
  assert.deepEqual(rows.map((row) => row.props['data-row-id']), ['alpha', 'beta', 'gamma']);
  for (const row of rows) {
    const cls = String(row.props.className);
    assert.equal(cls.split(' ').includes('card'), false, 'rows must not be card-enclosed');
    assert.equal(cls.includes('hover:bg-[var(--hover)]'), true, 'rows carry the mockup hover tint');
    assert.equal(cls.includes('rounded'), true, 'rows are freestanding rounded elements');
  }
  const alphaSpans = elements(rows[0]).filter((item) => item.type === 'span' && textOf(item) === 'Alpha');
  assert.ok(alphaSpans.some((item) => String(item.props.className).includes('text-[var(--plum)]')),
    'selected rows mark their title plum');
});

test('a searchSlot replaces the plain search input (the live-search hosts it)', () => {
  const slot = jsx.jsx('div', { 'data-slot-marker': 'live' });
  const tree = SelectionList({ ...baseProps, searchSlot: slot }) as unknown;
  assert.equal(elements(tree).some((item) => item.props['data-slot-marker'] === 'live'), true);
  const textInputs = elements(tree).filter((item) => item.type === 'input' && item.props.type !== 'checkbox');
  assert.equal(textInputs.length, 0, 'the plain search input is replaced by the slot');
});

test('toolbar={false} hands the toolbar to the host — picker surfaces render it themselves', () => {
  const tree = SelectionList({ ...baseProps, selectedRows: selectedRowsProp, toolbar: false }) as unknown;
  assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'selected-count'), false);
  assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'list-toolbar'), false);
  const textInputs = elements(tree).filter((item) => item.type === 'input' && item.props.type !== 'checkbox');
  assert.equal(textInputs.length, 0);
  assert.match(textOf(tree), /Selected \(2\)/, 'rows and tray still render');
  assert.match(textOf(tree), /Beta/);
});

test('single-mode rows are freestanding pickers with optional avatars', () => {
  const tree = SelectionList({ ...singleProps, rows: [
    { id: 'alpha', title: 'Alpha', subtitle: 'alpha@example.com', leading: 'AK' },
    { id: 'beta', title: 'Beta' },
  ] }) as unknown;
  const alpha = findByLabel(tree, 'Select Alpha');
  assert.ok(alpha, 'single-mode row missing');
  assert.equal(String(alpha.props.className).includes('hover:bg-[var(--hover)]'), true);
  assert.equal(String(alpha.props.className).includes('card'), false);
  const avatar = elements(alpha).find((item) => item.props['data-row-avatar'] === 'AK');
  assert.ok(avatar, 'leading avatar missing');
  const beta = findByLabel(tree, 'Select Beta');
  assert.equal(beta?.props['aria-pressed'], false);
});

// --- Task 8 fix round 2: row meta badge slot (mockup Valid / deleting / Selected) ---

test('single-mode rows render the trailing meta badge in all three mockup tones', () => {
  const tree = SelectionList({ ...singleProps, rows: [
    { id: 'alpha', title: 'Alpha', badge: { label: 'Valid', tone: 'ok' } },
    { id: 'beta', title: 'Beta', badge: { label: 'deleting', tone: 'muted' } },
    { id: 'gamma', title: 'Gamma', badge: { label: 'Selected', tone: 'selected' } },
  ] }) as unknown;
  const valid = findByLabel(tree, 'Select Alpha');
  const validBadge = elements(valid!).find((item) => item.props['data-row-badge'] === 'Valid');
  assert.ok(validBadge, 'ok-tone badge missing');
  assert.equal(String(validBadge.props.className).includes('text-[var(--plum)]'), true);
  const deleting = findByLabel(tree, 'Select Beta');
  const xBadge = elements(deleting!).find((item) => item.props['data-row-badge'] === 'deleting');
  assert.ok(xBadge, 'muted-tone badge missing');
  assert.equal(String(xBadge.props.className).includes('border-dashed'), true,
    'the deleting badge is the dashed outline chip');
  const selected = findByLabel(tree, 'Select Gamma');
  const selBadge = elements(selected!).find((item) => item.props['data-row-badge'] === 'Selected');
  assert.ok(selBadge, 'selected-tone badge missing');
  assert.equal(String(selBadge.props.className).includes('bg-[var(--gold)]'), true);
});

test('multi-mode rows render the meta badge too (shared row anatomy)', () => {
  const tree = SelectionList({ ...baseProps, rows: [
    { id: 'alpha', title: 'Alpha', badge: { label: 'Valid' } },
    { id: 'beta', title: 'Beta' },
  ] }) as unknown;
  const row = elements(tree).find((item) => item.props['data-row-id'] === 'alpha');
  const badge = elements(row!).find((item) => item.props['data-row-badge'] === 'Valid');
  assert.ok(badge, 'multi-mode rows lack the badge slot');
  assert.equal(elements(tree).filter((item) => item.props['data-row-badge']).length, 1,
    'rows without a badge render no badge slot');
});

test('disabled single-mode rows never fire the row-select callback', () => {
  let picked: string | undefined;
  const tree = SelectionList({ ...singleProps, onRowSelect: (id: string) => { picked = id; } }) as unknown;
  const gamma = findByLabel(tree, 'Select Gamma');
  assert.ok(gamma, 'disabled row missing');
  assert.equal(gamma.props.disabled, true);
  (gamma.props.onClick as () => void)();
  assert.equal(picked, undefined, 'a disabled row must be unselectable');
});

// --- S13a: per-surface row-click behavior flag ---

test("S13a: rowClick defaults to 'select' — the S8 click-to-toggle stays", () => {
  const toggled: string[] = [];
  const tree = SelectionList({ ...baseProps,
    onToggle: (id: string) => { toggled.push(id); } }) as unknown;
  const row = elements(tree).find((item) => item.props['data-row-id'] === 'beta');
  (row!.props.onClick as (event: unknown) => void)({ target: { tagName: 'SPAN' } });
  assert.deepEqual(toggled, ['beta']);
});

test("S13a: rowClick='expand' — the row click expands (the checkbox stays the select affordance)", () => {
  const expanded: string[] = [];
  const toggled: string[] = [];
  const tree = SelectionList({ ...baseProps, rowClick: 'expand',
    onToggle: (id: string) => { toggled.push(id); },
    onExpandToggle: (id: string) => { expanded.push(id); } }) as unknown;
  const row = elements(tree).find((item) => item.props['data-row-id'] === 'beta');
  assert.ok(row, 'row missing');
  // The row click expands — it never toggles selection.
  (row.props.onClick as (event: unknown) => void)({ target: { tagName: 'SPAN' } });
  assert.deepEqual(expanded, ['beta']);
  assert.deepEqual(toggled, [], 'a row click must not select in expand mode');
  // The checkbox keeps firing onToggle (the select affordance).
  const betaBox = findByLabel(tree, 'Toggle Beta');
  assert.ok(betaBox, 'checkbox select affordance missing');
  (betaBox!.props.onChange as () => void)();
  assert.deepEqual(toggled, ['beta']);
  assert.deepEqual(expanded, ['beta'], 'the checkbox never triggers the expand toggle');
});

test("S13a: expand mode guards — disabled rows and detail-area clicks stay inert", () => {
  const expanded: string[] = [];
  const tree = SelectionList({ ...baseProps, rowClick: 'expand',
    onExpandToggle: (id: string) => { expanded.push(id); } }) as unknown;
  const gamma = elements(tree).find((item) => item.props['data-row-id'] === 'gamma');
  (gamma!.props.onClick as (event: unknown) => void)({ target: { tagName: 'SPAN' } });
  assert.deepEqual(expanded, [], 'disabled rows stay inert');
  const beta = elements(tree).find((item) => item.props['data-row-id'] === 'beta');
  // A normal row click expands exactly once…
  (beta!.props.onClick as (event: unknown) => void)({ target: { tagName: 'SPAN' } });
  assert.deepEqual(expanded, ['beta'],
    'the expand toggle fires once for the row itself');
  // …and a click originating inside the rendered detail never refires it.
  (beta!.props.onClick as (event: unknown) => void)(
    { target: { tagName: 'P', closest: () => ({}) } });
  assert.deepEqual(expanded, ['beta'], 'detail-area clicks do not refire the toggle');
  (beta!.props.onClick as (event: unknown) => void)({ target: { tagName: 'INPUT' } });
  assert.deepEqual(expanded, ['beta'], 'checkbox-originated clicks never expand');
});

test("S13a: expand mode renders the parent-owned detail under the expanded row only", () => {
  const tree = SelectionList({ ...baseProps, rowClick: 'expand', expandedId: 'beta',
    detailFor: (row: { title: string }) => jsx.jsx('p', { children: `Detail for ${row.title}` }),
    onExpandToggle: () => {} }) as unknown;
  assert.equal(elements(tree).filter((item) => item.props['data-row-detail']).length, 1);
  assert.match(textOf(tree), /Detail for Beta/);
  assert.doesNotMatch(textOf(tree), /Detail for Alpha/, 'closed rows stay folded');
  assert.doesNotMatch(textOf(tree), /Detail for Gamma/);
  // No expandedId → no detail renders at all.
  const folded = SelectionList({ ...baseProps, rowClick: 'expand',
    detailFor: (row: { title: string }) => jsx.jsx('p', { children: `Detail for ${row.title}` }) }) as unknown;
  assert.equal(elements(folded).filter((item) => item.props['data-row-detail']).length, 0);
});

test('S13a: single mode ignores the rowClick flag (pick rows keep their own contract)', () => {
  let picked: string | undefined;
  const expanded: string[] = [];
  const tree = SelectionList({ ...singleProps, rowClick: 'expand',
    onRowSelect: (id: string) => { picked = id; },
    onExpandToggle: (id: string) => { expanded.push(id); } }) as unknown;
  const row = buttons(tree).find((item) => textOf(item).includes('Beta'));
  (row!.props.onClick as () => void)();
  assert.equal(picked, 'beta');
  assert.deepEqual(expanded, []);
});
