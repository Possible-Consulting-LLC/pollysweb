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

function loadSelectionTray() {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL('./selection-tray.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const deps: Record<string, unknown> = {
    'react/jsx-runtime': jsx,
    '@/lib/utils': { cn: (...parts: unknown[]) => parts.filter(Boolean).join(' ') },
    '@/components/ui/card': { cardClassName: 'card' },
  };
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      if (name === 'react/jsx-runtime') return jsx;
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports.SelectionTray as (props: Record<string, unknown>) => unknown;
}

const SelectionTray = loadSelectionTray();

const items = [
  { id: 'plan-1', title: 'Standard', subtitle: 'Baseline' },
  { id: 'plan-7', title: 'Pro' },
];

test('selection tray lists every selected item as a removable chip, even off-page ones', () => {
  const deselected: string[] = [];
  const tree = SelectionTray({ items, onDeselect: (id: string) => deselected.push(id),
    collapsed: false, onCollapsedToggle: () => {} });
  const body = text(tree);
  assert.equal(body.includes('Selected (2)'), true);
  assert.equal(body.includes('Standard'), true);
  assert.equal(body.includes('Pro'), true);
  // Chips are plain labels, not links — removal is the only interaction.
  const removes = elements(tree).filter(item => item.type === 'button' &&
    String(item.props['aria-label'] ?? '').startsWith('Deselect'));
  assert.deepEqual(removes.map(button => button.props['aria-label']),
    ['Deselect Standard', 'Deselect Pro']);
  for (const button of removes) (button.props.onClick as (id: unknown) => void)(button.props['data-id']);
  assert.deepEqual(deselected, ['plan-1', 'plan-7']);
  // Subtitles render when present.
  assert.equal(body.includes('Baseline'), true);
});

test('selection tray hides its chips when collapsed but keeps the header and actions', () => {
  const actions = jsx.jsx('button', { children: 'Activate' });
  const tree = SelectionTray({ items, onDeselect: () => {}, collapsed: true,
    onCollapsedToggle: () => {}, children: actions });
  const body = text(tree);
  assert.equal(body.includes('Selected (2)'), true);
  assert.equal(body.includes('Activate'), true);
  assert.equal(body.includes('Standard'), false);
  const toggle = elements(tree).find(item => item.type === 'button' && text(item).includes('Selected (2)'));
  assert.equal(toggle?.props['aria-expanded'], false);
});

test('selection tray expands via its toggle and renders bulk action children', () => {
  const toggles: boolean[] = [];
  const tree = SelectionTray({ items, onDeselect: () => {}, collapsed: false,
    onCollapsedToggle: () => toggles.push(true),
    children: [jsx.jsx('button', { children: 'Publish' })] });
  const toggle = elements(tree).find(item => item.type === 'button' && text(item).includes('Selected (2)'));
  assert.equal(toggle?.props['aria-expanded'], true);
  (toggle?.props.onClick as () => void)?.();
  assert.deepEqual(toggles, [true]);
  assert.equal(text(tree).includes('Publish'), true);
});

test('selection tray renders nothing when the selection is empty', () => {
  assert.equal(SelectionTray({ items: [], onDeselect: () => {}, collapsed: false,
    onCollapsedToggle: () => {} }), null);
});

// --- Task 7: mockup parity ---

test('the tray is a soft bordered panel — no card enclosure', () => {
  const tree = SelectionTray({ items, onDeselect: () => {}, collapsed: false,
    onCollapsedToggle: () => {} }) as unknown;
  const section = elements(tree).find((item) => item.props['data-testid'] === 'selection-tray');
  assert.ok(section, 'tray section missing');
  const cls = String(section.props.className);
  assert.equal(cls.split(' ').includes('card'), false, 'no cardClassName enclosure');
  assert.equal(cls.includes('border-[var(--hover)]'), true, 'mockup tray border');
  assert.equal(cls.includes('bg-[var(--card)]'), true, 'mockup tray background');
});

test('chips are hover-tinted pills with the plum-tinted border and plum removal', () => {
  const tree = SelectionTray({ items, onDeselect: () => {}, collapsed: false,
    onCollapsedToggle: () => {} }) as unknown;
  const chip = elements(tree).find((item) => item.props['data-tray-chip'] === 'plan-1');
  assert.ok(chip, 'chip missing');
  const cls = String(chip.props.className);
  assert.equal(cls.includes('bg-[var(--hover)]'), true);
  assert.equal(cls.includes('border-[var(--plum)]/25'), true);
  assert.equal(cls.includes('rounded-full'), true);
  const remove = elements(chip).find((item) => item.type === 'button');
  assert.equal(String(remove?.props.className).includes('text-[var(--plum)]'), true);
});

test('an optional trailing control renders in the tray head (the "Selected only" toggle)', () => {
  const tree = SelectionTray({ items, onDeselect: () => {}, collapsed: false,
    onCollapsedToggle: () => {}, trailing: jsx.jsx('button', { children: 'Selected only' }) }) as unknown;
  assert.equal(elements(tree).some((item) => item.type === 'button' && text(item) === 'Selected only'),
    true);
});
