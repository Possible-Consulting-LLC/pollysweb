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

/** Values crossing the vm realm carry a foreign prototype; normalize before
 * structural comparison. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

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
  return exports as {
    PlansAccordionView: (props: Record<string, unknown>) => unknown;
    PlansAccordion: (props: Record<string, unknown>) => unknown;
    formatUpdatedAt: (date: Date, now?: Date) => string;
    priceSummary: (options: Array<{ interval: string; basePriceCents: number; active: boolean }>) => string;
    narrowingWithRefresh: (narrowing: Record<string, unknown>,
      refresh: Record<string, unknown> | null) => Record<string, unknown>;
    narrowedPlanView: (row: Record<string, unknown>) => Record<string, unknown>;
  };
}

let pushed: string[] = [];
let lastLiveSearch: Record<string, unknown> | null = null;
let lastNarrowSource: unknown = null;
/** S13c: capture the ids-endpoint fetches (click-only) and the selection-map
 * setters, so the shell's merge/clear behavior is directly assertable. */
let idFetches: Array<{ entity: string; query: string }> = [];
let stateSetterCalls: unknown[] = [];

/** The canned narrowing state the view receives; tests flip `narrowed` and
 * swap `rows`/`total` to exercise the live replacement paths. */
const narrowingState: Record<string, unknown> = {
  text: '', query: '', active: false, narrowed: false, rows: [], total: 0,
  page: 1, loading: false,
  onType: (_text: string) => {}, onPageChange: (_page: number) => {}, onEscape: () => {},
};

const listSharedExports = (() => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL('./list-shared.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, URLSearchParams });
  return exports;
})();

const deps: Record<string, unknown> = {
  // The client wrapper's hooks are stubbed; only the hook-free view is exercised
  // (plus the shell's fallback wiring, which needs a working initial state).
  react: {
    useState: (initial: unknown) => {
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [value, (next: unknown) => { stateSetterCalls.push(next); }];
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useReducer: (reducer: unknown, initial: unknown) => [initial, () => {}],
  },
  'next/navigation': { useRouter: () => ({ push: (href: string) => { pushed.push(href); } }) },
  '@/components/admin/live-search': {
    narrowViaEndpoint: (entity: string, pageSize: number) => {
      lastNarrowSource = `endpoint:${entity}:${pageSize}`;
      return lastNarrowSource;
    },
    fetchSelectableRows: (entity: string, query: string) => {
      idFetches.push({ entity, query });
      return Promise.resolve([{ id: 'plan-1', title: 'Plan 1', subtitle: 'STANDARD' }]);
    },
    useNarrowing: () => narrowingState,
    LiveSearchInput: (props: Record<string, unknown>) => {
      lastLiveSearch = props;
      return jsx.jsx('input', { 'data-live-search-input': props.id, value: props.value });
    },
    NarrowPager: (props: Record<string, unknown>) => jsx.jsx('nav',
      { 'data-narrow-pager': true, 'data-page': props.page, 'data-total': props.total }),
  },
  '@/components/admin/list-shared': listSharedExports,
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
    reorderPlanAction: 'reorder-plan', bulkSetPlanFlagsAction: 'bulk-set-plan-flags',
    updatePlanAction: 'update-plan' },
};

const { PlansAccordionView, PlansAccordion, formatUpdatedAt, priceSummary,
  narrowingWithRefresh, narrowedPlanView } = loadAccordionView();

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

const base = { plans: plans(3), total: 3, search: '', page: 1, pageSize: 20, openId: '',
  selectedItems: [] as Array<{ id: string; title: string }>,
  onToggleSelected: (_id: string) => {},
  onPick: (_item: { id: string; title: string; subtitle?: string }) => {},
  trayCollapsed: false, onToggleTrayCollapsed: () => {},
  onSelectAll: undefined as (() => void) | undefined,
  onSelectNone: undefined as (() => void) | undefined,
  onClearSearch: undefined as (() => void) | undefined,
  onSearchSubmit: (_search: string) => {},
  narrowedOpenId: '', onNarrowedOpenToggle: (_id: string) => {},
  editingId: '', onStartEdit: (_id: string) => {}, onCancelEdit: () => {},
  onSaveEdit: 'save-plan-edit' as unknown as (form: FormData) => Promise<{ error?: string }>,
  narrowing: narrowingState as Record<string, unknown> };

const render = (overrides: Partial<typeof base> = {}) => {
  lastLiveSearch = null;
  const tree = PlansAccordionView({ ...base, ...overrides });
  elements(tree); // resolve the live-search stub for prop assertions
  return tree;
};

/** A live narrowing state for the view: matches for the typed text are in. */
const liveNarrowing = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ ...narrowingState, narrowed: true, active: true, query: 'term', ...over });

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

test('the counter stays in the mockup format and is truthful during narrowing', () => {
  const none = textOf(render());
  assert.equal(none.includes('0 of 3 selected'), true);
  assert.equal(none.includes('matching the search'), false,
    'the counter never morphs into a match-count text');
  const some = textOf(render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' }] }));
  assert.equal(some.includes('1 of 3 selected'), true);
  const all = textOf(render({ selectedItems: plans(3).map(plan => ({ id: plan.id, title: plan.name })) }));
  assert.equal(all.includes('3 of 3 selected'), true);
  // While narrowed matches are in, the denominator is the live match total.
  const live = textOf(render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' }],
    narrowing: liveNarrowing({ total: 9 }) }));
  assert.equal(live.includes('1 of 9 selected'), true,
    'the counter reflects the narrowed set while typing');
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
  const collapse = elementsOf(tree).links.find(link => link.props.href === '/admin/plans?page=1');
  assert.ok(collapse, 'collapse toggle missing');
});

// --- S13b: Edit lives in the detail card (in-place editor, no navigation) ---

test('S13b: the read-only detail card carries a primary Edit affordance that starts the in-place editor', () => {
  const started: string[] = [];
  const tree = render({ openId: 'plan-1', onStartEdit: (id: string) => { started.push(id); } });
  const edit = elementsOf(tree).buttons.find(button => text(button) === 'Edit');
  assert.ok(edit, 'the Edit affordance is missing from the detail card');
  assert.equal(edit!.props['data-variant'], 'primary');
  assert.equal(edit!.props['data-size'], 'sm', 'mockup btn-sm');
  (edit!.props.onClick as () => void)();
  assert.deepEqual(started, ['plan-1']);
  // The builder page is reached from the EDIT FLOW now, not the read-only card.
  assert.equal(elementsOf(tree).links.some(link =>
    String(link.props.href).endsWith('/edit')), false,
    'the read-only card no longer links straight to the builder');
});

test('S13b: Edit turns the card into the in-place editor — plan fields, Save/Cancel, no navigation', () => {
  const cancelled: boolean[] = [];
  const tree = render({ openId: 'plan-1', editingId: 'plan-1',
    onCancelEdit: () => { cancelled.push(true); } });
  const body = textOf(tree);
  assert.equal(body.includes('Edit plan'), true, 'the editor card is titled Edit plan');
  assert.equal(body.includes('Identity'), false, 'the read-only cards are replaced in edit mode');
  assert.equal(body.includes('Billing options'), false);
  const form = elements(tree).find(item => item.type === 'form' &&
    item.props.action === 'save-plan-edit');
  assert.ok(form, 'the editor submits through the wrapped update action');
  const fields = elements(form!).filter(item =>
    ['input', 'select', 'textarea'].includes(item.type))
    .map(item => ({ tag: item.type, name: item.props.name, type: item.props.type,
      value: item.props.value, defaultValue: item.props.defaultValue,
      defaultChecked: item.props.defaultChecked }));
  const byName = (name: string) => fields.find(field => field.name === name);
  assert.deepEqual(byName('planId'), { tag: 'input', name: 'planId', type: 'hidden',
    value: 'plan-1', defaultValue: undefined, defaultChecked: undefined });
  assert.equal(byName('name')!.defaultValue, 'Plan 1');
  assert.equal(byName('name')!.defaultValue !== undefined, true, 'fields are prefilled');
  assert.deepEqual(byName('description'), { tag: 'textarea', name: 'description', type: undefined,
    value: undefined, defaultValue: 'Desc 1', defaultChecked: undefined });
  assert.equal(byName('planType')!.tag, 'select');
  assert.equal(byName('maxSpiders')!.type, 'number', 'empty = unlimited via a number field');
  assert.equal(byName('maxSpiders')!.defaultValue, '', 'unlimited plans prefill empty');
  assert.equal(byName('active')!.defaultChecked, true);
  assert.equal(byName('public')!.defaultChecked, true);
  // The stable identity (planId) is the only hidden field; the plan id is never editable.
  assert.equal(fields.every(field => field.name !== 'id'), true);
  const cancel = elementsOf(tree).buttons.find(button => text(button) === 'Cancel');
  assert.ok(cancel, 'Cancel affordance missing');
  assert.equal(cancel!.props['data-variant'], 'soft');
  (cancel!.props.onClick as () => void)();
  assert.deepEqual(cancelled, [true]);
  const save = elementsOf(tree).buttons.find(button => text(button) === 'Save changes');
  assert.ok(save, 'Save affordance missing');
  assert.equal(save!.props['data-variant'], 'primary');
});

test('S13b: the edit flow offers the Full editor link to the plan-builder page', () => {
  const tree = render({ openId: 'plan-1', editingId: 'plan-1' });
  const fullEditor = elementsOf(tree).links.find(link =>
    link.props.href === '/admin/plans/plan-1/edit');
  assert.ok(fullEditor, 'the Full editor link is missing from the edit flow');
  assert.match(textOf(fullEditor!), /full editor/);
  assert.match(textOf(tree), /feature matrix, billing options, and pricing preview/,
    'the mockup rule text stays accessible around the link');
  // In-place editing does not replace the builder: no in-place matrix editor here.
  assert.equal(elements(tree).some(item => item.props['data-testid'] === 'feature-matrix'), false);
});

// --- Task 7: live search toolbar + mockup visual parity ---

function readSource(): string {
  return readFileSync(new URL('./plans-accordion.tsx', import.meta.url), 'utf8');
}

test('the toolbar hosts the mockup search input wired to the plans narrowing endpoint', () => {
  // S13d: the input contract is pinned on an above-page catalog (a smaller
  // catalog hides the input entirely — see the S13d test).
  render({ total: 24, selectedItems: [{ id: 'plan-1', title: 'Plan 1' }] });
  assert.ok(lastLiveSearch, 'search input missing from the toolbar');
  assert.equal(lastLiveSearch!.id, 'plans-search');
  assert.equal(lastLiveSearch!.value, '', 'the input shows the live narrowing text');
  assert.equal(lastLiveSearch!.placeholder, 'Search plans by name…');
  assert.equal(lastLiveSearch!.onEnter !== undefined, true,
    'Enter is the explicit full-page fallback');
  // No suggestion dropdown machinery exists by construction.
  assert.doesNotMatch(readSource(), /mode="popup"|role="combobox"|renderSuggestions/);
});

test('FINALE F3: a committed search keeps an in-place Clear; the idle toolbar has none', () => {
  // Present only when a committed URL-owned search exists.
  let cleared = false;
  const withSearch = render({ search: 'Feed', onClearSearch: () => { cleared = true; } });
  const clear = elements(withSearch).find((item) => item.props['data-testid'] === 'clear-search');
  assert.ok(clear, 'the committed search keeps its Clear affordance');
  assert.equal(textOf(clear), 'Clear');
  (clear!.props.onClick as () => void)();
  assert.equal(cleared, true, 'the Clear affordance fires the host callback');
  // No committed search → no Clear (the real catalog is below one page, so
  // this is ALSO the below-page case: input hidden, Clear still offered).
  const idle = render({ onClearSearch: () => {} });
  assert.equal(elements(idle).some((item) => item.props['data-testid'] === 'clear-search'), false,
    'an idle toolbar renders no Clear');
  // While the view is narrowed by live typing, the Clear hides.
  const narrowed = render({ search: 'Feed', narrowing: liveNarrowing(), onClearSearch: () => {} });
  assert.equal(elements(narrowed).some((item) => item.props['data-testid'] === 'clear-search'), false,
    'no Clear while a live narrowing query owns the view');
});

test('FINALE F3: the shell wires Clear to a soft navigation that drops the committed search', () => {
  pushed = [];
  const tree = PlansAccordion({ plans: plans(2), total: 4, search: 'Feed', page: 1,
    pageSize: 20, openId: '' });
  elements(tree);
  const clear = elements(tree).find((item) => item.props['data-testid'] === 'clear-search');
  assert.ok(clear, 'the shell renders the Clear affordance for a committed search');
  (clear!.props.onClick as () => void)();
  assert.deepEqual(pushed, ['/admin/plans?page=1'],
    'Clear soft-navigates to the unsearched first page (the surface\'s canonical listHref)');
});

test('S13d: the plans search input hides when the catalog holds less than a page (real catalog ~4 < 20)', () => {
  render();
  assert.equal(lastLiveSearch, null, 'no search input below one page of plans');
  const tree = render({ onSelectAll: () => {}, onSelectNone: () => {} });
  assert.ok(elements(tree).some((item) => item.props['data-testid'] === 'selected-count'),
    'the counter stays');
  assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'select-all'), true,
    'the S13c pair stays visible');
});

/** A rich narrowed plan row — the committed PlanSummary shape the narrowing
 * endpoint serves (S13). */
const narrowedPlanRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'plan-9', title: 'Plan 9', subtitle: 'STANDARD', name: 'Plan 9', description: 'Desc 9',
  planType: 'STANDARD', maxSpiders: null, active: true, public: true, sortOrder: 0,
  updatedAt: new Date(0).toISOString(), billingOptions: [], billingOptionCount: 0,
  enabledFeatureCount: 0, subscriptionCount: 0, ...over });

test('typing narrows the rendered list in place; a narrowed pick forwards full display data', () => {
  const picked: Array<Record<string, unknown>> = [];
  const tree = render({ onPick: (item: Record<string, unknown>) => { picked.push(item); },
    narrowing: liveNarrowing({ rows: [narrowedPlanRow()], total: 12, page: 1 }) });
  const narrowed = elements(tree).find(item => item.props['data-testid'] === 'narrowed-plans');
  assert.ok(narrowed, 'narrowed list missing');
  const rows = elements(narrowed).filter(item => item.props['data-row-id']);
  assert.deepEqual(rows.map(row => row.props['data-row-id']), ['plan-9'],
    'matched rows span all rows, not the committed page');
  assert.ok(elements(tree).find(item => item.props['data-narrow-pager']), 'matches are paged');
  const box = elements(narrowed).find(item => item.type === 'input' &&
    item.props['aria-label'] === 'Select Plan 9');
  assert.ok(box, 'narrowed row checkbox missing');
  (box.props.onChange as () => void)();
  assert.deepEqual(plain(picked), [{ id: 'plan-9', title: 'Plan 9', subtitle: 'STANDARD' }],
    'the full suggestion is forwarded — tray chips never fall back to a raw id');
});

// --- S13: narrowed rows are full citizens (rich rows, client-side expand) ---

test('S13: narrowed rows render through the committed row renderer — same anatomy, badges, prices', () => {
  const tree = render({ narrowing: liveNarrowing({ rows: [narrowedPlanRow({
    billingOptions: [{ interval: 'MONTHLY', basePriceCents: 199, active: true }],
    enabledFeatureCount: 8, subscriptionCount: 3 })], total: 12 }) });
  const narrowed = elements(tree).find(item => item.props['data-testid'] === 'narrowed-plans');
  const row = elements(narrowed).find(item => item.props['data-row-id'] === 'plan-9');
  const body = textOf(row);
  assert.equal(body.includes('Plan 9'), true);
  assert.equal(body.includes('Desc 9'), true, 'the committed description line');
  assert.equal(body.includes('$1.99/mo'), true, 'the committed price-summary line');
  assert.equal(body.includes('Unlimited'), true);
  assert.equal(body.includes('8 features · 3 subscriber'), true, 'the committed usage line');
  assert.equal(body.includes('Active'), true, 'committed badge cluster');
  assert.equal(body.includes('Public'), true);
  assert.equal(body.includes('Standard'), true, 'type badge (human label)');
  // Same renderer, same hover anatomy (the tint rides the row's header strip).
  assert.equal(elements(row!).some(item =>
    String(item.props.className ?? '').includes('hover:bg-[var(--hover)]')), true);
});

test('S13: clicking a narrowed row expands it client-side — the URL stays on the committed search', () => {
  const toggledOpen: string[] = [];
  const tree = render({ onNarrowedOpenToggle: (id: string) => { toggledOpen.push(id); },
    narrowing: liveNarrowing({ rows: [narrowedPlanRow()], total: 12 }) });
  const row = elements(tree).find(item => item.props['data-row-id'] === 'plan-9');
  const expand = elements(row).find(item => item.type === 'button' &&
    item.props['aria-expanded'] !== undefined);
  assert.ok(expand, 'a narrowed row must expand via a client-side toggle');
  assert.equal(expand!.props['aria-expanded'], false);
  (expand!.props.onClick as () => void)();
  assert.deepEqual(toggledOpen, ['plan-9']);
  // No navigation anywhere in the narrowed view: no open= links at all.
  assert.equal(elements(tree).filter(item => item.type === 'a' &&
    String(item.props.href ?? '').includes('open=')).length, 0,
    'expanding a narrowed row never touches the URL');
});

test('S13: an expanded narrowed row renders the same detail card as a committed row', () => {
  const tree = render({ narrowedOpenId: 'plan-9',
    narrowing: liveNarrowing({ rows: [narrowedPlanRow({
      billingOptions: [{ interval: 'MONTHLY', basePriceCents: 199, active: true }],
      subscriptionCount: 4 })], total: 12 }) });
  const body = textOf(tree);
  assert.equal((body.match(/Identity/g) ?? []).length, 1, 'the committed detail cards render');
  assert.equal(body.includes('Effective subscriptions 4'), true);
  assert.equal(body.includes('$1.99/mo'), true, 'billing options render from the narrowed row');
  assert.equal(body.includes('Edit'), true, 'the detail is a full citizen — Edit included');
});

test('S13: an expanded narrowed row opens the same in-place editor (S13b holds while narrowed)', () => {
  const tree = render({ narrowedOpenId: 'plan-9', editingId: 'plan-9',
    narrowing: liveNarrowing({ rows: [narrowedPlanRow({ name: 'Plan 9' })], total: 12 }) });
  const body = textOf(tree);
  assert.equal(body.includes('Edit plan'), true);
  const form = elements(tree).find(item => item.type === 'form' &&
    item.props.action === 'save-plan-edit');
  assert.ok(form, 'the narrowed editor submits through the same wrapped action');
  assert.equal(elements(form!).some(item => item.type === 'input' &&
    item.props.name === 'planId' && item.props.value === 'plan-9'), true);
});

test('S13: narrowedPlanView maps the wire shape onto the committed PlanSummary (one code path)', () => {
  const view = narrowedPlanView(narrowedPlanRow({
    updatedAt: '2026-09-27T10:00:00.000Z',
    billingOptions: [{ interval: 'ANNUAL', basePriceCents: 1999, active: false }],
    billingOptionCount: 1, enabledFeatureCount: 5, subscriptionCount: 2,
    maxSpiders: 7, public: false }) as Record<string, unknown>);
  assert.equal(view.name, 'Plan 9');
  assert.equal((view.updatedAt as Date).toISOString(), '2026-09-27T10:00:00.000Z',
    'updatedAt is re-hydrated into a Date for the renderer');
  assert.equal(view.maxSpiders, 7);
  assert.equal(view.public, false);
  assert.deepEqual(view.billingOptions, [{ interval: 'ANNUAL', basePriceCents: 1999, active: false }]);
  assert.equal(view.enabledFeatureCount, 5);
  assert.equal(view.subscriptionCount, 2);
});

// --- S13 refresh mechanics: fresh narrowed rows after an in-place save ---

test('S13 refresh: a successful save overlays fresh narrowed rows only for the same query+page', () => {
  const narrowed = { ...narrowingState, narrowed: true, active: true, query: 'term',
    rows: [narrowedPlanRow()], total: 12, page: 1 };
  const fresh = { query: 'term', page: 1, rows: [narrowedPlanRow({ title: 'Renamed' })], total: 12 };
  const merged = narrowingWithRefresh(narrowed as Record<string, unknown>, fresh);
  assert.equal((merged.rows as Array<{ title: string }>)[0].title, 'Renamed',
    'the fresh rows replace the cached narrowed rows after a save');
  assert.equal(merged.total, 12);
  // Not narrowed (committed view): untouched — revalidatePath refreshes it.
  assert.equal(narrowingWithRefresh(narrowingState as Record<string, unknown>, fresh),
    narrowingState);
  // A different page or query (the user typed/paged since): the overlay is void.
  const pageTwo = { ...narrowed, page: 2 };
  assert.equal(narrowingWithRefresh(pageTwo as Record<string, unknown>, fresh), pageTwo,
    'stale-overlay guard: page moved on');
  const otherQuery = { ...narrowed, query: 'termx' };
  assert.equal(narrowingWithRefresh(otherQuery as Record<string, unknown>, fresh), otherQuery,
    'stale-overlay guard: query moved on');
  assert.equal(narrowingWithRefresh(narrowed as Record<string, unknown>, null), narrowed,
    'no refresh yet → the narrowing state passes through');
});

test('an empty narrowed set echoes the query; clearing restores the committed view', () => {
  const empty = textOf(render({ narrowing: liveNarrowing({ rows: [], total: 0 }) }));
  assert.match(empty, /Nothing matches “\s*term\s*”\./);
  const committed = textOf(render());
  assert.match(committed, /Plan 1/, 'the committed page returns');
});

// --- Fix round 1b: the island is the single owner of the empty states ---

test('committed-empty and narrowed-empty each render exactly one message', () => {
  const committedEmpty = textOf(render({ plans: [], search: '' }));
  assert.equal((committedEmpty.match(/No plans yet\./g) ?? []).length, 1,
    'exactly one committed empty message');
  const committedSearchEmpty = textOf(render({ plans: [], search: 'molt' }));
  assert.equal((committedSearchEmpty.match(/Nothing matches/g) ?? []).length, 1,
    'exactly one committed search-empty message');
  const narrowedEmpty = textOf(render({ narrowing: liveNarrowing({ rows: [], total: 0 }) }));
  assert.equal((narrowedEmpty.match(/Nothing matches/g) ?? []).length, 1,
    'exactly one narrowed empty message');
});

test('the shell wires the narrowing endpoint; the fallback submit navigates the URL search', () => {
  pushed = [];
  lastNarrowSource = null;
  const tree = PlansAccordion({ plans: plans(2), total: 24, search: '', page: 1,
    pageSize: 20, openId: '' });
  elements(tree);
  assert.equal(lastNarrowSource, 'endpoint:plans:20');
  assert.ok(lastLiveSearch, 'view not resolved through the shell');
  (lastLiveSearch!.onEnter as (text: string) => void)('term');
  assert.deepEqual(pushed, ['/admin/plans?search=term&page=1'],
    'fallback resets page and open plan exactly like the old GET form');
});

test('the counter chip is gold, lives in the toolbar, and counts selected of total', () => {
  const none = render();
  const chip = elements(none).find((item) => item.props['data-testid'] === 'selected-count');
  assert.ok(chip, 'counter chip missing');
  assert.equal(String(chip.props.className).includes('bg-[var(--gold)]'), true);
  assert.equal(textOf(chip).includes('0 of 3 selected'), true);
  const some = render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' }] });
  const someChip = elements(some).find((item) => item.props['data-testid'] === 'selected-count');
  assert.equal(textOf(someChip!).includes('1 of 3 selected'), true);
});

test('plan rows are freestanding hover-tinted rows — no card enclosure', () => {
  const tree = render();
  const rows = elements(tree).filter((item) => item.props['data-row-id']);
  assert.equal(rows.length, 3);
  for (const row of rows)
    assert.equal(String(row.props.className).includes('card'), false,
      'no cardClassName on the row container');
  const hoverRows = elements(tree).filter((item) =>
    String(item.props.className ?? '').includes('hover:bg-[var(--hover)]'));
  assert.equal(hoverRows.length, 3, 'each row carries the mockup hover tint');
});

test('the open accordion row becomes a plum-bordered card; closed rows stay freestanding', () => {
  const tree = render({ openId: 'plan-1' });
  const rows = elements(tree).filter((item) => item.props['data-row-id']);
  const open = rows.find((row) => row.props['data-row-id'] === 'plan-1');
  const closed = rows.find((row) => row.props['data-row-id'] === 'plan-2');
  assert.equal(String(open!.props.className).includes('border-[var(--plum)]'), true);
  assert.equal(String(open!.props.className).includes('bg-[var(--card)]'), true);
  assert.equal(String(closed!.props.className).includes('border-transparent'), true);
});

test('badges are theme-token driven — no hardcoded palette literals', () => {
  assert.doesNotMatch(readSource(), /(?:emerald|sky|amber|teal|indigo)-\d00/);
});

test('detail cards are soft-bordered labeled kv grids at mockup density', () => {
  const tree = render({ openId: 'plan-1' });
  const cards = elements(tree).filter((item) => item.props['data-detail-card']);
  assert.equal(cards.length, 3);
  for (const card of cards) {
    const cls = String(card.props.className);
    assert.equal(cls.split(' ').includes('card'), false, 'no cardClassName');
    assert.equal(cls.includes('border-[var(--hover)]'), true);
    assert.equal(cls.includes('bg-[var(--background)]'), true);
  }
  const grids = elements(tree).filter((item) => item.type === 'dl' && item.props['data-kv-grid']);
  assert.equal(grids.length, 3, 'each detail card renders a labeled kv grid');
});

// --- Fix round 2, chunk P: mockup presentation parity (P1, P2, P4, P5) ---

const planWithPrices = (overrides: Partial<PlanLike> = {}): PlanLike => ({
  ...plans(1)[0], ...overrides,
});

test('P1: each row meta line carries a price summary from active billing options', () => {
  const priced = planWithPrices({ billingOptions: [
    { interval: 'MONTHLY', basePriceCents: 199, active: true },
    { interval: 'ANNUAL', basePriceCents: 1999, active: true },
  ] });
  const body = textOf(render({ plans: [priced] }));
  assert.equal(body.includes('Unlimited · $1.99/mo · $19.99/yr'), true,
    'the mockup meta shows spoods · prices');
  // Inactive-only options still summarize (draft rows in the mockup show a price).
  const draft = planWithPrices({ active: false, billingOptions: [
    { interval: 'MONTHLY', basePriceCents: 999, active: false },
  ] });
  assert.equal(textOf(render({ plans: [draft] })).includes('$9.99/mo (inactive)'), true);
});

test('P1: zero-price and option-less rows stay truthful ($0 and n/a)', () => {
  const free = planWithPrices({ billingOptions: [
    { interval: 'MONTHLY', basePriceCents: 0, active: true },
  ] });
  assert.equal(textOf(render({ plans: [free] })).includes('$0'), true);
  const bare = planWithPrices({ billingOptions: [] });
  const body = textOf(render({ plans: [bare] }));
  assert.equal(body.includes('· n/a'), true, 'no billing options render as n/a');
});

test('P1: priceSummary picks active options per interval in mockup format', () => {
  assert.equal(priceSummary([
    { interval: 'MONTHLY', basePriceCents: 199, active: true },
    { interval: 'ANNUAL', basePriceCents: 1999, active: true },
  ]), '$1.99/mo · $19.99/yr');
  assert.equal(priceSummary([{ interval: 'MONTHLY', basePriceCents: 0, active: true }]), '$0');
  assert.equal(priceSummary([
    { interval: 'MONTHLY', basePriceCents: 999, active: false },
  ]), '$9.99/mo (inactive)');
  assert.equal(priceSummary([]), 'n/a');
});

test('P2: every extra detail action is kept and restyled into the mockup language', () => {
  const tree = render({ openId: 'plan-1' });
  const buttons = elementsOf(tree).buttons;
  const variants: Record<string, { variant: string; size: string }> = {};
  for (const button of buttons) variants[text(button)] =
    { variant: String(button.props['data-variant']), size: String(button.props['data-size']) };
  // Mockup: Edit is the btn-primary btn-sm in-place affordance; the kept extra
  // actions sit beside it as soft sm buttons. The builder lives in the edit
  // flow's Full editor link (S13b).
  const edit = buttons.find(button => text(button) === 'Edit');
  assert.ok(edit, 'in-place Edit affordance missing');
  assert.deepEqual(variants['Edit'], { variant: 'primary', size: 'sm' });
  assert.deepEqual(variants['Duplicate'], { variant: 'soft', size: 'sm' });
  assert.deepEqual(variants['Delete or deactivate'], { variant: 'soft', size: 'sm' },
    'delete/deactivate keeps its function and drops the danger styling');
  assert.ok(Object.keys(variants).some(label => label.startsWith('Move ')),
    'reorder actions remain present');
  const move = Object.keys(variants).find(label => label.startsWith('Move '))!;
  assert.deepEqual(variants[move], { variant: 'soft', size: 'sm' });
});

test('P4: the committed footer carries the mockup "Sorted by display order" note', () => {
  const tree = render();
  assert.equal(textOf(tree).includes('Sorted by display order'), true,
    'mockup footer note missing');
});

test('P5: last-updated renders human dates, not ISO slices', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
  const body = textOf(render({ plans: [planWithPrices({ updatedAt: twoHoursAgo })] }));
  assert.equal(body.includes('updated 2h ago'), true, 'row meta uses relative dates');
  assert.match(body, /2h ago/);
  assert.equal(body.includes('updated 1970-01-01'), false, 'no ISO date in the row meta');
  const open = textOf(render({ openId: 'plan-1',
    plans: [planWithPrices({ updatedAt: twoHoursAgo })] }));
  assert.equal((open.match(/Last updated 2h ago/g) ?? []).length, 1,
    'the detail card Last updated row is a human date too');
});

test('P5: formatUpdatedAt is relative within a week, a short date beyond', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  assert.equal(formatUpdatedAt(new Date(now.getTime() - 30_000), now), 'just now');
  assert.equal(formatUpdatedAt(new Date(now.getTime() - 5 * 60_000), now), '5m ago');
  assert.equal(formatUpdatedAt(new Date(now.getTime() - 2 * 3_600_000), now), '2h ago');
  assert.equal(formatUpdatedAt(new Date(now.getTime() - 3 * 86_400_000), now), '3d ago');
  assert.equal(formatUpdatedAt(new Date('2026-09-12T10:00:00Z'), now), 'Sep 12',
    'older than a week falls back to a short human date');
  assert.equal(formatUpdatedAt(new Date(now.getTime() + 86_400_000), now), 'just now',
    'clock skew / future dates stay sensible, never "negative ago"');
});

// --- S13c: select all / select none -----------------------------------------

test('S13c: the toolbar hosts Select all / Select none between the search input and the gold counter', () => {
  // S13d: pinned on an above-page catalog (a smaller one hides the input —
  // the pair itself stays, which the S13d test pins).
  const tree = render({ total: 24, onSelectAll: () => {}, onSelectNone: () => {} });
  const toolbar = elements(tree).find(item => item.props['data-testid'] === 'plans-toolbar');
  assert.ok(toolbar, 'plans toolbar missing');
  const kids = ((Array.isArray(toolbar!.props.children)
    ? toolbar!.props.children : [toolbar!.props.children]) as Element[])
    // The optional clearSlot (FINALE F3) may occupy a child position; absent,
    // the position is nullish and carries no element.
    .filter(kid => kid != null);
  // The pair's search/counter kinds: the stubs are function components, so the
    // label decides — the search slot resolves to empty text.
  const kinds = kids.map(kid => {
    const label = text(kid);
    if (label === 'Select all' || label === 'Select none') return 'select';
    if (kid.props['data-testid'] === 'selected-count') return 'counter';
    return 'search';
  });
  assert.deepEqual(JSON.parse(JSON.stringify(kinds)), ['search', 'select', 'select', 'counter'],
    'the pair sits between the search input and the counter (mockup #7)');
  const all = kids.find(kid => text(kid) === 'Select all')!;
  const none = kids.find(kid => text(kid) === 'Select none')!;
  // The mockup's .btn-soft mini equivalent: compact soft token-styled buttons
  // (the Button stub is a function component — variant rides the raw props).
  assert.equal(String(all.props['data-variant'] ?? all.props.variant), 'soft');
  assert.equal(String(all.props['data-size'] ?? all.props.size), 'sm');
  assert.equal(String(none.props['data-variant'] ?? none.props.variant), 'soft');
  assert.equal(String(none.props['data-size'] ?? none.props.size), 'sm');
});

test('S13c: without handlers the pair does not render', () => {
  const tree = render();
  assert.equal(elements(tree).some(item => item.type === 'button' && text(item) === 'Select all'), false);
  assert.equal(elements(tree).some(item => item.type === 'button' && text(item) === 'Select none'), false);
});

test('S13c: Select all fetches the ids endpoint at the active query and merges full display data', async () => {
  idFetches = []; stateSetterCalls = [];
  narrowingState.narrowed = false; narrowingState.query = '';
  const tree = PlansAccordion({ plans: plans(2), total: 3, search: 'bas', page: 1,
    pageSize: 20, openId: '' });
  const all = elements(tree).find(item => item.type === 'button' && text(item) === 'Select all');
  assert.ok(all, 'the shell must wire Select all');
  await (all!.props.onClick as () => Promise<void>)();
  assert.deepEqual(idFetches, [{ entity: 'plans', query: 'bas' }],
    'the committed search scopes Select all; one fetch on click, never per keystroke');
  // The functional updater merges every fetched row with display data —
  // select-all flows through the same selection map as manual picks.
  const updater = stateSetterCalls[0] as
    (previous: Map<string, { title: string; subtitle: string }>) =>
      Map<string, { title: string; subtitle: string }>;
  const merged = updater(new Map([['plan-9', { title: 'Kept', subtitle: 'STANDARD' }]]));
  assert.equal(merged.get('plan-9')!.title, 'Kept', 'existing picks survive');
  assert.deepEqual(plain(merged.get('plan-1')), { title: 'Plan 1', subtitle: 'STANDARD' },
    'tray chips carry title/subtitle, never a bare id');
});

test('S13c: Select none clears the whole selection map', () => {
  stateSetterCalls = [];
  const tree = PlansAccordion({ plans: plans(2), total: 3, search: '', page: 1,
    pageSize: 20, openId: '' });
  const none = elements(tree).find(item => item.type === 'button' && text(item) === 'Select none');
  assert.ok(none, 'the shell must wire Select none');
  (none!.props.onClick as () => void)();
  assert.equal(stateSetterCalls.length, 1);
  assert.equal((stateSetterCalls[0] as Map<string, unknown>).size, 0,
    'Select none empties the tray; the counter returns to 0 of M');
});
