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
  return exports as {
    PlansAccordionView: (props: Record<string, unknown>) => unknown;
    PlansAccordion: (props: Record<string, unknown>) => unknown;
  };
}

let pushed: string[] = [];
let lastLiveSearch: Record<string, unknown> | null = null;
let lastNarrowSource: unknown = null;

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
    useState: (initial: unknown) =>
      [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
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
    reorderPlanAction: 'reorder-plan', bulkSetPlanFlagsAction: 'bulk-set-plan-flags' },
};

const { PlansAccordionView, PlansAccordion } = loadAccordionView();

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
  onSearchSubmit: (_search: string) => {},
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
  const editLink = elementsOf(tree).links.find(link => link.props.href === '/admin/plans/plan-1/edit');
  assert.ok(editLink, 'edit link missing');
  assert.equal(String(editLink.props.className).includes('variant-primary'), true);
  const collapse = elementsOf(tree).links.find(link => link.props.href === '/admin/plans?page=1');
  assert.ok(collapse, 'collapse toggle missing');
});

// --- Task 7: live search toolbar + mockup visual parity ---

function readSource(): string {
  return readFileSync(new URL('./plans-accordion.tsx', import.meta.url), 'utf8');
}

test('the toolbar hosts the mockup search input wired to the plans narrowing endpoint', () => {
  render({ selectedItems: [{ id: 'plan-1', title: 'Plan 1' }] });
  assert.ok(lastLiveSearch, 'search input missing from the toolbar');
  assert.equal(lastLiveSearch!.id, 'plans-search');
  assert.equal(lastLiveSearch!.value, '', 'the input shows the live narrowing text');
  assert.equal(lastLiveSearch!.placeholder, 'Search plans by name…');
  assert.equal(lastLiveSearch!.onEnter !== undefined, true,
    'Enter is the explicit full-page fallback');
  // No suggestion dropdown machinery exists by construction.
  assert.doesNotMatch(readSource(), /mode="popup"|role="combobox"|renderSuggestions/);
});

test('typing narrows the rendered list in place; a narrowed pick forwards full display data', () => {
  const picked: Array<Record<string, unknown>> = [];
  const tree = render({ onPick: (item: Record<string, unknown>) => { picked.push(item); },
    narrowing: liveNarrowing({ rows: [{ id: 'plan-9', title: 'Plan 9', subtitle: 'STANDARD' }],
      total: 12, page: 1 }) });
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
  assert.deepEqual(picked, [{ id: 'plan-9', title: 'Plan 9', subtitle: 'STANDARD' }],
    'the full suggestion is forwarded — tray chips never fall back to a raw id');
});

test('an empty narrowed set echoes the query; clearing restores the committed view', () => {
  const empty = textOf(render({ narrowing: liveNarrowing({ rows: [], total: 0 }) }));
  assert.match(empty, /Nothing matches “\s*term\s*”\./);
  const committed = textOf(render());
  assert.match(committed, /Plan 1/, 'the committed page returns');
});

test('the shell wires the narrowing endpoint; the fallback submit navigates the URL search', () => {
  pushed = [];
  lastNarrowSource = null;
  const tree = PlansAccordion({ plans: plans(2), total: 2, search: '', page: 1,
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
