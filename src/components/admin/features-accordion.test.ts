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

/** The hook-free view plus the pure state-owner reducer are exercised; the
 * client wrapper is a thin useReducer/useActionState shell around them. */
function loadFeaturesAccordion() {
  const listSharedCode = ts.transpileModule(
    readFileSync(new URL('./list-shared.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const listSharedExports: Record<string, unknown> = {};
  runInNewContext(listSharedCode, { exports: listSharedExports, URLSearchParams });
  const code = ts.transpileModule(
    readFileSync(new URL('./features-accordion.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    URLSearchParams,
    require: (name: string) => {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === '@/components/admin/list-shared') return listSharedExports;
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports as {
    FeaturesAccordionView: (props: Record<string, unknown>) => unknown;
    accordionReducer: (state: AccordionState, action: AccordionAction) => AccordionState;
  };
}

type AccordionState = { selection: Map<string, { title: string; subtitle: string }>; trayCollapsed: boolean };
type AccordionAction =
  | { type: 'toggle'; key: string; title: string; subtitle: string }
  | { type: 'toggleTrayCollapsed' };

const deps: Record<string, unknown> = {
  react: {
    useState: (initial: unknown) => [initial, () => {}],
    useReducer: (reducer: unknown, initial: unknown) => [initial, () => {}],
  },
  'next/link': { default: ({ href, children, className, ...rest }: Record<string, unknown>) =>
    jsx.jsx('a', { href, className, ...rest, children }) },
  'lucide-react': { ChevronDown: (props: Record<string, unknown>) => jsx.jsx('svg', props) },
  '@/lib/utils': { cn: (...parts: unknown[]) => parts.filter(Boolean).join(' ') },
  '@/components/ui/card': { cardClassName: 'card' },
  '@/components/mutation-form': { MutationForm: ({ children, ...props }: Record<string, unknown>) =>
    jsx.jsx('form', { ...props, children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/components/ui/button': {
    Button: ({ variant, size, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props }),
    buttonVariants: ({ variant, size }: { variant?: string; size?: string } = {}) =>
      `variant-${variant ?? 'primary'} size-${size ?? 'md'}`,
  },
  '@/components/admin/selection-tray': { SelectionTray: ({ items, onDeselect, collapsed,
    onCollapsedToggle, children }: Record<string, unknown>) => jsx.jsx('section', {
    'data-tray': true,
    'data-collapsed': Boolean(collapsed),
    children: [
      jsx.jsx('button', { onClick: onCollapsedToggle,
        children: `Selected (${(items as unknown[]).length})` }),
      ...(items as Array<{ id: string; title: string; subtitle?: string }>).map(item =>
        jsx.jsx('button', { 'data-remove': item.id, 'data-subtitle': item.subtitle ?? '',
          onClick: () => (onDeselect as (id: string) => void)(item.id),
          children: `× ${item.title}` })),
      jsx.jsx('div', { children }),
    ] }) },
  '@/app/admin/features/actions': { setFeatureReleaseAction: 'set-feature-release',
    saveFeatureMetadataAction: 'save-feature-metadata',
    bulkSetFeatureReleaseAction: 'bulk-set-feature-release' },
};

const { FeaturesAccordionView, accordionReducer } = loadFeaturesAccordion();

type FeatureRowView = { id: string; key: string; name: string; description: string;
  category: string; active: boolean; orphan: boolean; assignedPlans: string[]; totalPlans: number };

function features(count: number): FeatureRowView[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `feature-${index + 1}`, key: `feature.key-${index + 1}`, name: `Feature ${index + 1}`,
    description: `Desc ${index + 1}`, category: index < 2 ? 'care' : 'spoods',
    active: index % 2 === 0, orphan: false, assignedPlans: index === 0 ? ['Free', 'Basic'] : [],
    totalPlans: 3,
  }));
}

const orphanRow: FeatureRowView = { id: 'feature-9', key: 'legacy.bulk_import', name: 'Old import',
  description: 'Legacy description', category: 'legacy', active: true, orphan: true,
  assignedPlans: [], totalPlans: 3 };

const base = { features: features(3), total: 34, search: '', page: 1, openKey: '',
  selectedItems: [] as Array<{ id: string; title: string; subtitle?: string }>,
  onToggleSelected: (_key: string) => {}, trayCollapsed: false, onToggleTrayCollapsed: () => {} };

const render = (overrides: Partial<typeof base> = {}) => FeaturesAccordionView({ ...base, ...overrides });

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    checkboxes: all.filter(item => item.type === 'input' && item.props.type === 'checkbox'),
    forms: all.filter(item => item.type === 'form'),
  };
}

test('checkboxes toggle selection and orphaned rows render an inert checkbox', () => {
  const rows = [...features(2), orphanRow];
  const toggled: string[] = [];
  const tree = render({ features: rows, onToggleSelected: (key: string) => { toggled.push(key); } });
  const { checkboxes } = elementsOf(tree);
  assert.equal(checkboxes.length, 3);
  const orphanBox = checkboxes[2];
  assert.equal(orphanBox.props.disabled, true);
  (checkboxes[1].props.onChange as () => void)();
  assert.deepEqual(toggled, ['feature.key-2']);
});

test('the counter is always visible and off-page selections persist in the tray', () => {
  const none = textOf(render());
  assert.equal(none.includes('34 features'), true);
  const some = render({ selectedItems: [
    { id: 'feature.key-1', title: 'Feature 1', subtitle: 'feature.key-1' },
    { id: 'feature.key-9', title: 'Old import', subtitle: 'legacy.bulk_import' }] });
  const body = textOf(some);
  assert.equal(body.includes('2 of 34 selected'), true);
  assert.equal(body.includes('× Old import'), true);
  // Chips carry the key so identically named rows stay distinguishable.
  assert.equal(elements(some).some(item => item.props['data-remove'] === 'feature.key-9'), true);
});

test('rows group by category in sorted order with group headers', () => {
  const tree = render({ features: features(3) });
  const headers = elements(tree)
    .filter(item => item.type === 'h3' && item.props['data-group-header'])
    .map(item => String(item.props['data-group-header']));
  assert.deepEqual(headers, ['care', 'spoods']);
});

test('accordion expansion renders detail cards and actions once; single-open via URL', () => {
  const rows = features(3);
  const tree = render({ features: rows, openKey: 'feature.key-1' });
  const body = textOf(tree);
  assert.equal((body.match(/Plan assignments/g) ?? []).length, 1, 'single-open detail');
  assert.equal(body.includes('Key: feature.key-1'), true);
  assert.equal(body.includes('2 of 3 plans'), true);
  assert.equal(body.includes('Free, Basic'), true);
  assert.equal(body.includes('Released'), true);
  // The open row's link collapses (no open param, aria-expanded true); the
  // other rows carry their own expand link (aria-expanded false).
  const openRow = elementsOf(tree).links.find(link =>
    String(link.props.href) === '/admin/features?page=1');
  assert.ok(openRow, 'open row link missing');
  assert.equal(openRow.props['aria-expanded'], true);
  const expand = elementsOf(tree).links.find(link =>
    String(link.props.href) === '/admin/features?page=1&open=feature.key-2');
  assert.ok(expand, 'other rows must keep their own expand link');
  assert.equal(expand.props['aria-expanded'], false);
  // Per-feature actions are present in the expanded detail.
  const release = elements(tree).filter(item => item.type === 'form' &&
    item.props.action === 'set-feature-release');
  assert.equal(release.length, 1);
  assert.deepEqual(elements(release[0]).filter(item => item.type === 'input')
    .map(item => ({ name: item.props.name, value: item.props.value })),
    [{ name: 'key', value: 'feature.key-1' }, { name: 'active', value: 'false' }]);
  const metadata = elements(tree).find(item => item.type === 'form' &&
    item.props.action === 'save-feature-metadata');
  assert.ok(metadata, 'metadata form missing');
  assert.ok(elements(metadata).some(item => item.type === 'input' && item.props.name === 'name'));
});

test('orphaned feature detail is greyed, explained, and inert', () => {
  const tree = render({ features: [...features(2), orphanRow], openKey: 'legacy.bulk_import' });
  const fieldsets = elements(tree).filter(item => item.type === 'fieldset');
  assert.equal(fieldsets.length, 1);
  assert.equal(fieldsets[0].props.disabled, true);
  const body = textOf(tree);
  assert.equal(body.includes('no longer in the code registry'), true);
  // Inert release form still targets the row's current state but sits in the disabled fieldset.
  const release = elements(fieldsets[0]).filter(item => item.type === 'form' &&
    item.props.action === 'set-feature-release');
  assert.equal(release.length, 1);
  const metadata = elements(fieldsets[0]).filter(item => item.type === 'form' &&
    item.props.action === 'save-feature-metadata');
  assert.equal(metadata.length, 1);
});

test('the tray carries exactly two bulk actions submitting every selected key', () => {
  const selectedItems = [{ id: 'feature.key-1', title: 'Feature 1', subtitle: 'feature.key-1' },
    { id: 'feature.key-2', title: 'Feature 2', subtitle: 'feature.key-2' }];
  const tree = render({ selectedItems });
  const bulkForms = elementsOf(tree).forms.filter(form => form.props.action === 'bulk-set-feature-release');
  assert.equal(bulkForms.length, 2, 'release and unrelease only');
  for (const form of bulkForms) {
    const keys = elements(form).filter(item => item.type === 'input' && item.props.name === 'key')
      .map(item => String(item.props.value));
    assert.deepEqual(keys.sort(), ['feature.key-1', 'feature.key-2']);
  }
  const release = bulkForms.find(form => text(form).includes('Release selected'));
  const unrelease = bulkForms.find(form => text(form).includes('Unrelease selected'));
  assert.deepEqual(elements(release!).filter(item => item.type === 'input' && item.props.name === 'active')
    .map(item => item.props.value), ['true']);
  assert.deepEqual(elements(unrelease!).filter(item => item.type === 'input' && item.props.name === 'active')
    .map(item => item.props.value), ['false']);
  assert.equal(textOf(tree).includes('Delete'), false, 'no other bulk actions');
});

test('bulk buttons and tray toggle use themed controls', () => {
  let toggledCollapsed = false;
  const tree = render({ selectedItems: [{ id: 'feature.key-1', title: 'Feature 1', subtitle: 'feature.key-1' }],
    onToggleTrayCollapsed: () => { toggledCollapsed = true; } });
  const trayToggle = elementsOf(tree).buttons.find(button => text(button).includes('Selected (1)'));
  (trayToggle?.props.onClick as () => void)?.();
  assert.equal(toggledCollapsed, true);
  const release = elements(tree).find(item => item.type === 'button' && text(item) === 'Release selected');
  assert.equal(release?.props['data-variant'], 'soft');
  assert.equal(release?.props['data-size'], 'sm');
});

test('state owner: selection accumulates across page changes and never shrinks but a re-toggle removes', () => {
  let state: AccordionState = { selection: new Map(), trayCollapsed: false };
  // Page 1: two keys toggled on.
  state = accordionReducer(state, { type: 'toggle', key: 'k1', title: 'A', subtitle: 'k1' });
  state = accordionReducer(state, { type: 'toggle', key: 'k2', title: 'B', subtitle: 'k2' });
  assert.equal(state.selection.size, 2);
  // Page change (props swap; the reducer is never called with a reset): page 2 adds k3.
  state = accordionReducer(state, { type: 'toggle', key: 'k3', title: 'C', subtitle: 'k3' });
  assert.deepEqual([...state.selection.keys()].sort(), ['k1', 'k2', 'k3']);
  assert.deepEqual([...state.selection.values()].map(item => item.subtitle).sort(),
    ['k1', 'k2', 'k3']);
  // Toggling an already-selected key removes exactly that one.
  state = accordionReducer(state, { type: 'toggle', key: 'k2', title: 'B', subtitle: 'k2' });
  assert.deepEqual([...state.selection.keys()].sort(), ['k1', 'k3']);
  // The state updates are copy-on-write: the previous map is never mutated.
  const frozen = new Map(state.selection);
  state = accordionReducer(state, { type: 'toggle', key: 'k9', title: 'Z', subtitle: 'k9' });
  assert.deepEqual([...frozen.keys()].sort(), ['k1', 'k3']);
  assert.equal(state.selection.size, 3);
});

test('state owner: the tray collapse flag flips via its own action', () => {
  let state: AccordionState = { selection: new Map(), trayCollapsed: false };
  state = accordionReducer(state, { type: 'toggleTrayCollapsed' });
  assert.equal(state.trayCollapsed, true);
  state = accordionReducer(state, { type: 'toggleTrayCollapsed' });
  assert.equal(state.trayCollapsed, false);
});
