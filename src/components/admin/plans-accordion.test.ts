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

/** The hook-free view is what the tests exercise; the thin client wrapper
 * (useState) keeps its logic one level up and delegates everything here. */
function loadAccordionView() {
  const helperCode = ts.transpileModule(
    readFileSync(new URL('../../lib/admin/paginated-list.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helperExports: Record<string, unknown> = {};
  runInNewContext(helperCode, { exports: helperExports });
  const registryCode = ts.transpileModule(
    readFileSync(new URL('../../lib/features/registry.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const registryExports: Record<string, unknown> = {};
  runInNewContext(registryCode, { exports: registryExports });
  const code = ts.transpileModule(
    readFileSync(new URL('./plans-accordion.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {
    exports,
    URLSearchParams,
    require: (name: string) => {
      if (name === '@/lib/admin/paginated-list') return helperExports;
      if (name === '@/lib/features/registry') return registryExports;
      if (name === 'react/jsx-runtime') return jsx;
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports.PlansAccordionView as (props: Record<string, unknown>) => unknown;
}

const deps: Record<string, unknown> = {
  // The client wrapper's useState import is stubbed; only the hook-free view is exercised.
  react: { useState: () => [undefined, () => {}] },
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
      ...(items as Array<{ id: string; title: string }>).map(item =>
        jsx.jsx('button', { 'data-remove': item.id,
          onClick: () => (onDeselect as (id: string) => void)(item.id),
          children: `× ${item.title}` })),
      jsx.jsx('div', { children }),
    ] }) },
  '@/app/admin/plans/actions': { deletePlanAction: 'delete-plan', duplicatePlanAction: 'duplicate-plan',
    reorderPlanAction: 'reorder-plan', bulkSetPlanFlagsAction: 'bulk-set-plan-flags' },
};

const PlansAccordionView = loadAccordionView();

type PlanLike = { id: string; name: string; description: string; planType: string;
  maxSpiders: number | null; active: boolean; public: boolean; sortOrder: number;
  updatedAt: Date; billingOptionCount: number; enabledFeatureCount: number;
  subscriptionCount: number; billingOptions: unknown[] };

function plans(count: number): PlanLike[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `plan-${index + 1}`, name: `Plan ${index + 1}`, description: `Desc ${index + 1}`,
    planType: 'STANDARD', maxSpiders: null, active: true, public: true, sortOrder: index,
    updatedAt: new Date(0), billingOptionCount: 0, enabledFeatureCount: 0,
    subscriptionCount: 0, billingOptions: [],
  }));
}

const base = { plans: plans(3), total: 3, search: '', page: 1, openId: '',
  selectedItems: [] as Array<{ id: string; title: string }>,
  onToggleSelected: (_id: string) => {}, trayCollapsed: false, onToggleTrayCollapsed: () => {} };

const render = (overrides: Partial<typeof base> = {}) =>
  PlansAccordionView({ ...base, ...overrides });

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    checkboxes: all.filter(item => item.type === 'input' && item.props.type === 'checkbox'),
  };
}

test('checkboxes toggle selection independently of the row accordion toggle', () => {
  const toggled: string[] = [];
  const tree = render({ onToggleSelected: (id: string) => { toggled.push(id); } });
  const { checkboxes, links } = elementsOf(tree);
  assert.equal(checkboxes.length, 3);
  assert.ok(checkboxes.every(box => box.props.checked === false));
  // Checkbox clicks must not trigger the row accordion: separate controls.
  (checkboxes[1].props.onChange as (id: string) => void)('plan-2');
  assert.deepEqual(toggled, ['plan-2']);
  const rowToggles = links.filter(link => /open=plan-\d+/.test(String(link.props.href)));
  assert.equal(rowToggles.length, 3);
});

test('checked state comes from the selection set, so off-page selections persist', () => {
  // plan-9 is not on this page: its checkbox does not exist here, but the tray
  // still lists it — selection is owned by the parent and never pruned by
  // pagination or search.
  const tree = render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' },
    { id: 'plan-9', title: 'Plan 9 (page 5)' }] });
  const { checkboxes } = elementsOf(tree);
  assert.deepEqual(checkboxes.map(box => box.props.checked), [true, false, false]);
  assert.equal(textOf(tree).includes('× Plan 9 (page 5)'), true);
});

test('the counter shows selected-of-total when anything is selected, else the total', () => {
  const none = textOf(render());
  assert.equal(none.includes('3 plans'), true);
  assert.equal(none.includes('of 3 selected'), false);
  const some = textOf(render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' }] }));
  assert.equal(some.includes('1 of 3 selected'), true);
  const all = textOf(render({ selectedItems: plans(3).map(plan => ({ id: plan.id, title: plan.name })) }));
  assert.equal(all.includes('3 of 3 selected'), true);
});

test('the tray carries the four bulk actions scoped to the full selection, no bulk delete', () => {
  const tree = render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' },
    { id: 'plan-2', title: 'Plan 2' }] });
  const body = textOf(tree);
  for (const label of ['Activate', 'Deactivate', 'Publish', 'Unpublish'])
    assert.equal(body.includes(label), true, `${label} missing`);
  assert.equal(body.includes('Delete'), false, 'bulk delete must not exist');
  // Every bulk form submits every selected id plus the field/value pair.
  const forms = elements(tree).filter(item => item.type === 'form' &&
    (item.props.action as string) === 'bulk-set-plan-flags');
  assert.equal(forms.length, 4);
  for (const form of forms) {
    const children = elements(form);
    const ids = children.filter(item => item.type === 'input' && item.props.name === 'planId')
      .map(item => item.props.value);
    assert.deepEqual(ids.sort(), ['plan-1', 'plan-2']);
  }
  const activate = forms.find(form => text(form).includes('Activate'));
  assert.deepEqual(elements(activate!).filter(item => item.type === 'input' &&
    item.props.name !== 'planId').map(item => ({ name: item.props.name, value: item.props.value })),
    [{ name: 'field', value: 'active' }, { name: 'value', value: 'true' }]);
  const unpublish = forms.find(form => text(form).includes('Unpublish'));
  assert.deepEqual(elements(unpublish!).filter(item => item.type === 'input' &&
    item.props.name !== 'planId').map(item => ({ name: item.props.name, value: item.props.value })),
    [{ name: 'field', value: 'public' }, { name: 'value', value: 'false' }]);
});

test('bulk actions submit with themed buttons and the tray can collapse', () => {
  let toggledCollapsed = false;
  const tree = render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' }],
    onToggleTrayCollapsed: () => { toggledCollapsed = true; } });
  const trayToggle = elementsOf(tree).buttons.find(button => text(button).includes('Selected (1)'));
  (trayToggle?.props.onClick as () => void)?.();
  assert.equal(toggledCollapsed, true);
  const activate = elements(tree).find(item => item.type === 'button' &&
    text(item) === 'Activate');
  assert.equal(activate?.props['data-variant'], 'soft');
  assert.equal(activate?.props['data-size'], 'sm');
});

test('accordion expansion, detail cards, and collapse toggle keep working with selection', () => {
  const tree = render({ openId: 'plan-1',
    selectedItems: [{ id: 'plan-1', title: 'Plan 1' }] });
  const body = textOf(tree);
  assert.equal((body.match(/Identity/g) ?? []).length, 1);
  assert.equal(body.includes('0 of 34'), true);
  const editLink = elementsOf(tree).links.find(link => link.props.href === '/admin/plans/plan-1/edit');
  assert.ok(editLink, 'edit link missing');
  assert.equal(String(editLink.props.className).includes('variant-primary'), true);
  const collapse = elementsOf(tree).links.find(link => link.props.href === '/admin/plans?page=1');
  assert.ok(collapse, 'collapse toggle missing');
});
