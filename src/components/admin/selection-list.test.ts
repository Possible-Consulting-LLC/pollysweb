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
  // Nested function components (e.g. the ui/button stub) are resolved by
  // calling them with their props, since no React renderer is involved.
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

function loadSelectionList() {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL('./selection-list.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  const deps: Record<string, unknown> = {
    'react/jsx-runtime': jsx,
    '@/lib/utils': { cn: (...parts: unknown[]) => parts.filter(Boolean).join(' ') },
    // Button stub preserves variant/size plus every handler/aria prop so tests
    // can assert variant choice, disabled state and fired callbacks.
    '@/components/ui/button': {
      Button: ({ variant, size, className, ...props }: Record<string, unknown>) =>
        jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', className, ...props }),
    },
  };
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports.SelectionList as (props: Record<string, unknown>) => unknown;
}

const SelectionList = loadSelectionList();

const baseRows = [
  { id: 'alpha', title: 'Alpha', selected: true },
  { id: 'beta', title: 'Beta' },
  { id: 'gamma', title: 'Gamma', subtitle: 'The third one', disabled: true },
];

const baseProps = { rows: baseRows, total: 45, page: 2, pageSize: 20, search: '', selectedCount: 3 };

function buttons(tree: unknown): Element[] {
  return elements(tree).filter((item) => item.type === 'button');
}

test('renders every row with titles, subtitles, the selection counter and the page label', () => {
  const rendered = textOf(SelectionList(baseProps));
  assert.match(rendered, /Alpha/);
  assert.match(rendered, /Beta/);
  assert.match(rendered, /Gamma/);
  assert.match(rendered, /The third one/);
  assert.match(rendered, /3 selected/);
  assert.match(rendered, /Page 2 of 3/);
});

test('empty lists fall back to the empty label', () => {
  const rendered = textOf(SelectionList({ ...baseProps, rows: [], total: 0, page: 1, emptyLabel: 'No rows match.' }));
  assert.match(rendered, /No rows match\./);
});

test('row toggles fire onToggle with the row id and reflect selection state', () => {
  let toggled: string | undefined;
  const tree = SelectionList({ ...baseProps, onToggle: (id: string) => { toggled = id; } });
  const alpha = buttons(tree).find((item) => item.props['aria-label'] === 'Toggle Alpha');
  assert.ok(alpha, 'toggle for Alpha not rendered');
  assert.equal(alpha.props['aria-checked'], true);
  assert.equal(alpha.props['data-variant'], 'gold');
  const beta = buttons(tree).find((item) => item.props['aria-label'] === 'Toggle Beta');
  assert.equal(beta?.props['aria-checked'], false);
  (alpha.props.onClick as () => void)();
  assert.equal(toggled, 'alpha');
});

test('disabled rows render inert controls', () => {
  const tree = SelectionList(baseProps);
  const gamma = buttons(tree).find((item) => item.props['aria-label'] === 'Toggle Gamma');
  assert.ok(gamma, 'toggle for Gamma not rendered');
  assert.equal(gamma.props.disabled, true);
});

test('prev/next fire onPageChange with the neighbouring page numbers and disable at bounds', () => {
  let page: number | undefined;
  const tree = SelectionList({ ...baseProps, onPageChange: (p: number) => { page = p; } });
  const prev = buttons(tree).find((item) => item.props['aria-label'] === 'Previous page');
  const next = buttons(tree).find((item) => item.props['aria-label'] === 'Next page');
  assert.ok(prev && next);
  assert.equal(prev.props.disabled, false);
  assert.equal(next.props.disabled, false);
  (prev.props.onClick as () => void)();
  assert.equal(page, 1);
  (next.props.onClick as () => void)();
  assert.equal(page, 3);
  const first = SelectionList({ ...baseProps, page: 1 }) as unknown;
  assert.equal(buttons(first).find((item) => item.props['aria-label'] === 'Previous page')?.props.disabled, true);
  const last = SelectionList({ ...baseProps, page: 3 }) as unknown;
  assert.equal(buttons(last).find((item) => item.props['aria-label'] === 'Next page')?.props.disabled, true);
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
  const all = buttons(tree).find((item) => item.props['aria-label'] === 'Toggle all on page');
  assert.ok(all, 'toggle-all not rendered');
  assert.equal(all.props.disabled, false);
  (all.props.onClick as () => void)();
  assert.deepEqual(toggledAll, ['alpha', 'beta']);
});
