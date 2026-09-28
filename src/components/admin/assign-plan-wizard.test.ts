import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import type { AssignPlanWizardViewProps } from './assign-plan-wizard';

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

/** Transpile-and-run a component module against stubbed dependencies. */
function loadModule(path: string, deps: Record<string, unknown>): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(code, {
    exports,
    URLSearchParams,
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports;
}

// The real shared SelectionList runs (multi mode is now the point of step 1);
// only its own dependencies are stubbed.
const buttonStub = {
  Button: ({ variant, size, className, ...props }: Record<string, unknown>) =>
    jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', className, ...props }),
  buttonVariants: ({ variant, size }: { variant?: string; size?: string } = {}) =>
    `variant-${variant ?? 'primary'} size-${size ?? 'md'}`,
};
const listSharedExports = loadModule('./list-shared.ts', {});

const selectionTray = loadModule('./selection-tray.tsx', {
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
  '@/components/ui/card': { cardClassName: 'card' },
});
const selectionList = loadModule('./selection-list.tsx', {
  'react/jsx-runtime': jsx,
  '@/lib/utils': { cn },
  '@/components/ui/card': { cardClassName: 'card' },
  '@/components/admin/list-shared': { counterChipClass: 'goldchip',
    searchHiddenFor: listSharedExports.searchHiddenFor },
  '@/components/ui/button': buttonStub,
  '@/components/admin/selection-tray': selectionTray,
});

/** Captures for the state-owning wrapper tests (the useState stub records every
 * setter argument; navigation and the action record their calls). */
let stateSetterCalls: unknown[] = [];
let pushed: string[] = [];
let idFetches: Array<{ entity: string; query: string }> = [];
let selectableFixture: Array<{ id: string; title: string; subtitle: string }> = [];
let actionCalls: FormData[] = [];
let actionResult: { error?: string; success?: boolean } = {};

const resetCaptures = () => {
  stateSetterCalls = []; pushed = []; idFetches = []; selectableFixture = [];
  actionCalls = []; actionResult = {};
};

const deps: Record<string, unknown> = {
  // Hook stubs: the tests drive both the hook-free view AND the thin client
  // wrapper whose state owner logic (selection map, post-assign reset) is
  // pinned via the recorded setters — the plans-accordion tests' pattern.
  react: {
    useState: (initial: unknown) => {
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [value, (next: unknown) => { stateSetterCalls.push(next); }];
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useActionState: () => [undefined, () => {}, false],
  },
  'react/jsx-runtime': jsx,
  'next/navigation': { useRouter: () => ({ push: (href: string) => { pushed.push(href); } }) },
  // Live-search stub: records the picker input props; the narrowing states are
  // plain props the tests drive directly.
  '@/components/admin/live-search': {
    narrowViaEndpoint: (entity: string, pageSize: number) => `endpoint:${entity}:${pageSize}`,
    useNarrowing: () => narrowingStub,
    LiveSearchInput: (props: Record<string, unknown>) => {
      lastLiveSearch.push(props);
      return jsx.jsx('input', { 'data-live-search-input': props.id, value: props.value });
    },
    NarrowPager: (props: Record<string, unknown>) => jsx.jsx('nav',
      { 'data-narrow-pager': true, 'data-page': props.page, 'data-total': props.total }),
    fetchSelectableRows: (entity: string, query: string) => {
      idFetches.push({ entity, query });
      return Promise.resolve(selectableFixture);
    },
  },
  'next/link': { default: ({ href, children, className, ...rest }: Record<string, unknown>) =>
    jsx.jsx('a', { href, className, ...rest, children }) },
  '@/lib/utils': { cn },
  '@/components/admin/selection-list': selectionList,
  '@/components/admin/selection-tray': selectionTray,
  '@/components/admin/list-shared': listSharedExports,
  '@/components/ui/card': { cardClassName: 'card' },
  '@/components/ui/button': buttonStub,
  '@/components/mutation-form': { MutationForm: ({ action, children, ...props }: {
    action: (form: FormData) => void; children?: unknown; [key: string]: unknown }) =>
    jsx.jsx('form', { ...props, 'data-action': String(action),
      onSubmit: (event: { preventDefault(): void }) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        action(new FormData());
      }, children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/app/admin/subscriptions/actions': { assignSubscriptionAction: (form: FormData) => {
    actionCalls.push(form);
    return Promise.resolve(actionResult);
  } },
};

const wizardModule = loadModule('./assign-plan-wizard.tsx', deps);
const AssignPlanWizardView = wizardModule.AssignPlanWizardView as
  (props: Record<string, unknown>) => unknown;
const AssignPlanWizard = wizardModule.AssignPlanWizard as
  (props: Record<string, unknown>) => unknown;
const subscriptionsHref = wizardModule.subscriptionsHref as
  (list: { search: string; page: number }) => string;
const wizardHref = wizardModule.wizardHref as
  (list: { search: string; page: number }, nav: Record<string, unknown>) => string;

const list = { search: '', page: 1 };

/** Live-search stub captures (one per render); reset per test. */
let lastLiveSearch: Array<Record<string, unknown>> = [];

const narrowingStub = {
  text: '', query: '', active: false, narrowed: false, rows: [] as unknown[],
  total: 0, page: 1, loading: false,
  onType: (_text: string) => {}, onPageChange: (_page: number) => {}, onEscape: () => {},
};

const userNarrowingState = (over: Record<string, unknown> = {}): AssignPlanWizardViewProps['userNarrowing'] =>
  ({ ...narrowingStub, ...over }) as unknown as AssignPlanWizardViewProps['userNarrowing'];
const planNarrowingState = (over: Record<string, unknown> = {}): AssignPlanWizardViewProps['planNarrowing'] =>
  ({ ...narrowingStub, ...over }) as unknown as AssignPlanWizardViewProps['planNarrowing'];

const baseUserPicker = {
  rows: [
    { id: 'u-1', title: 'Marta Keeper', subtitle: 'marta@example.com' },
    { id: 'u-2', title: 'Dan O.', subtitle: 'dan@example.com' },
  ],
  total: 2, page: 1, pageSize: 20, search: '',
};
const basePlanPicker = {
  rows: [
    { id: 'p-1', title: 'Pro', subtitle: 'Standard · 2 active billing options',
      features: ['View the collection', 'Log feeding'] },
    { id: 'p-2', title: 'Basic', subtitle: 'Standard · 2 active billing options',
      features: [] },
  ],
  total: 2, page: 1, pageSize: 20, search: '',
};
const planWithTwoOptions = {
  id: 'p-1', name: 'Pro', planType: 'STANDARD',
  billingOptions: [
    { id: 'o-monthly', interval: 'MONTHLY', basePriceCents: 499, active: true },
    { id: 'o-annual', interval: 'ANNUAL', basePriceCents: 4999, active: true },
    { id: 'o-dead', interval: 'MONTHLY', basePriceCents: 999, active: false },
  ],
};
const selectedKeeper = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };
const selectedKeeper2 = { id: 'u-2', name: 'Dan O.', email: 'dan@example.com' };

const base: Partial<AssignPlanWizardViewProps> = {
  step: 1, listSearch: '', listPage: 1,
  selectedKeepers: [], selectedPlan: null, selectedOptionId: '',
  userPicker: baseUserPicker, planPicker: basePlanPicker,
  userNarrowing: userNarrowingState() as unknown as AssignPlanWizardViewProps['userNarrowing'],
  planNarrowing: planNarrowingState() as unknown as AssignPlanWizardViewProps['planNarrowing'],
  effectiveAt: '', onEffectiveAtChange: () => {},
  onToggleKeeper: () => {}, onSelectAllKeepers: () => {}, onSelectNoneKeepers: () => {},
  trayCollapsed: false, onTrayCollapsedToggle: () => {},
  navigate: () => {}, navigateSearch: () => {},
  assignDispatch: () => {}, assignResult: undefined,
  assignPending: false,
};

const render = (overrides: Partial<AssignPlanWizardViewProps> = {}) => {
  lastLiveSearch = [];
  const nav: string[] = [];
  const navSearch: string[] = [];
  const toggled: string[] = [];
  const tree = AssignPlanWizardView({ ...base, ...overrides,
    navigate: (href: string) => { nav.push(href); },
    navigateSearch: (href: string) => { navSearch.push(href); },
    onToggleKeeper: (id: string) => { toggled.push(id); },
    assignDispatch: () => {} }) as unknown;
  // Resolving the tree invokes the function-component stubs (the live search
  // hook) so tests can drive it.
  elements(tree);
  return { tree, nav, navSearch, toggled,
    buttons: () => elements(tree).filter((item) => item.type === 'button'),
    links: () => elements(tree).filter((item) => item.type === 'a'),
    inputs: () => elements(tree).filter((item) => item.type === 'input'),
    byLabel: (label: string) => elements(tree).find((item) => item.props['aria-label'] === label),
  };
};

// --- URL builders ---

test('URL builders preserve the list location and drop empty wizard params', () => {
  assert.equal(subscriptionsHref({ search: 'x', page: 1 }), '/admin/subscriptions?search=x');
  assert.equal(subscriptionsHref({ search: '', page: 2 }), '/admin/subscriptions?page=2');
  assert.equal(subscriptionsHref({ search: '', page: 1 }), '/admin/subscriptions');
  assert.equal(wizardHref(list, { step: 2 }),
    '/admin/subscriptions?wizard=open&step=2');
  assert.equal(wizardHref({ search: 'x', page: 3 }, { step: 1 }),
    '/admin/subscriptions?search=x&page=3&wizard=open&step=1');
  assert.equal(wizardHref(list, { step: 3, plan: 'p-1', option: 'o-1',
    usearch: 'ma', upage: 2, psearch: 'pro', ppage: 2 }),
    '/admin/subscriptions?wizard=open&step=3&plan=p-1&option=o-1&usearch=ma&upage=2&psearch=pro&ppage=2');
});

// --- Step 1: keepers (multi-select, Task 10) ---

test('step 1 is a multi-select keeper list: checkboxes, the gold N of M counter, and the select pair', () => {
  const { tree } = render();
  const checkboxes = elements(tree).filter((item) =>
    item.type === 'input' && item.props.type === 'checkbox');
  assert.equal(checkboxes.length, 2, 'every keeper row carries a checkbox');
  assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'select-all'), true,
    'Select all renders');
  assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'select-none'), true,
    'Select none renders');
  const counter = elements(tree).find((item) => item.props['data-testid'] === 'selected-count');
  assert.ok(counter, 'the selection counter renders');
  assert.equal(textOf(counter!), '0 of 2 selected');
  assert.equal(String(counter.props.className).includes('goldchip'), true,
    'the counter is the gold mockup chip');
});

test('keeper rows carry the initials avatar in multi mode (mockup row anatomy)', () => {
  const { tree } = render();
  const avatar = elements(tree).find((item) => item.props['data-row-avatar'] === 'MK');
  assert.ok(avatar, 'multi-mode keeper rows lack the initials avatar');
});

test('clicking a keeper row or its checkbox toggles the parent-owned selection', () => {
  const { tree, toggled } = render();
  const checkbox = elements(tree).find((item) =>
    item.props['aria-label'] === 'Toggle Marta Keeper');
  (checkbox!.props.onChange as () => void)();
  assert.deepEqual(toggled, ['u-1'], 'the checkbox toggles');
  const rowLi = elements(tree).find((item) => item.props['data-row-id'] === 'u-2');
  assert.ok(rowLi, 'row not found');
  (rowLi!.props.onClick as (event: unknown) => void)({ target: { tagName: 'DIV' } });
  assert.deepEqual(toggled, ['u-1', 'u-2'], 'the row click toggles');
});

test('selected keepers render Selected badges, the tray chips, and the counter follows', () => {
  const { tree, toggled } = render({ selectedKeepers: [selectedKeeper] });
  const counter = elements(tree).find((item) => item.props['data-testid'] === 'selected-count');
  assert.equal(textOf(counter!), '1 of 2 selected');
  const tray = elements(tree).find((item) => item.props['data-testid'] === 'selection-tray');
  assert.ok(tray, 'the tray renders while keepers are selected');
  assert.match(textOf(tray!), /Marta Keeper/);
  const checkbox = elements(tree).find((item) =>
    item.props['aria-label'] === 'Toggle Marta Keeper');
  assert.equal(checkbox?.props.checked, true);
  assert.equal(elements(tree).some((item) => item.props['data-row-badge'] === 'Selected'), true);
  // A tray chip's × removes the keeper through the same toggle handler.
  const remove = elements(tray!).find((item) =>
    item.props['aria-label'] === 'Deselect Marta Keeper');
  (remove!.props.onClick as () => void)();
  assert.deepEqual(toggled, ['u-1']);
});

test('deleting keepers are greyed and unselectable (mockup disabled rows)', () => {
  const { tree, toggled } = render({ userPicker: { ...baseUserPicker, rows: [
    { id: 'u-1', title: 'Marta Keeper', subtitle: 'marta@example.com' },
    { id: 'u-9', title: 'Old Acct', subtitle: 'deleting@example.com',
      disabled: true, badgeLabel: 'deleting' },
  ] } });
  const checkbox = elements(tree).find((item) => item.props['aria-label'] === 'Toggle Old Acct');
  assert.ok(checkbox, 'deleting row missing');
  assert.equal(checkbox?.props.disabled, true, 'deleting rows must be unselectable');
  const rowLi = elements(tree).find((item) => item.props['data-row-id'] === 'u-9');
  (rowLi!.props.onClick as (event: unknown) => void)({ target: { tagName: 'DIV' } });
  assert.deepEqual(toggled, [], 'a deleting keeper must never join the selection');
  const badge = elements(tree).find((item) => item.props['data-row-badge'] === 'deleting');
  assert.ok(badge, 'deleting rows carry their status badge');
});

test('Continue is explicit: disabled at zero keepers, live at N ≥ 1, carrying the picker location', () => {
  const disabled = render();
  const disabledButton = disabled.buttons().find((item) => textOf(item) === 'Continue ›');
  assert.ok(disabledButton, 'continue affordance missing');
  assert.equal(disabledButton?.props.disabled, true);
  const ready = render({ selectedKeepers: [selectedKeeper, selectedKeeper2],
    userPicker: { ...baseUserPicker, search: 'ma', page: 2 } });
  const link = ready.links().find((item) => textOf(item) === 'Continue ›');
  assert.equal(link?.props.href,
    '/admin/subscriptions?wizard=open&step=2&usearch=ma&upage=2');
});

test('the step 1 hint carries the batch constraints', () => {
  const { tree } = render();
  const rendered = textOf(tree);
  assert.match(rendered, /Build a list of keepers/);
  assert.match(rendered, /deleting accounts never join/);
});

test('keeper search resets to page 1 and pagination preserves the search', () => {
  // S13d: the input contract is pinned on an above-page picker (a smaller
  // picker hides the input entirely — see the S13d test).
  const { navSearch } = render({ userPicker: { ...baseUserPicker, total: 45 } });
  assert.ok(live(), 'keeper search missing');
  (live()!.onEnter as (text: string) => void)('ma');
  assert.deepEqual(navSearch, ['/admin/subscriptions?wizard=open&step=1&usearch=ma']);
  const pager = render({ userPicker: { ...baseUserPicker, search: 'ma', page: 2,
    total: 45, rows: Array.from({ length: 20 }, (_, index) =>
      ({ id: `u-${index + 1}`, title: `Keeper ${index + 1}` })) } });
  (pager.byLabel('Next page')!.props.onClick as () => void)();
  assert.deepEqual(pager.nav, ['/admin/subscriptions?wizard=open&step=1&usearch=ma&upage=3']);
});

test('typing live-renders matched keepers in place and clicking one toggles the selection', () => {
  const { tree, toggled, navSearch } = render({ ...base, userNarrowing: userNarrowingState({
    narrowed: true, active: true, query: 'nova',
    rows: [{ id: 'u-9', title: 'Nova Keeper', subtitle: 'nova@example.com' }],
    total: 1, page: 1, loading: false }) });
  const row = elements(tree).find((item) => item.props['aria-label'] === 'Toggle Nova Keeper');
  assert.ok(row, 'matched keepers render as toggleable rows in place');
  const rowLi = elements(tree).find((item) => item.props['data-row-id'] === 'u-9');
  assert.equal(String(rowLi!.props.className).includes('hover:bg-[var(--hover)]'), true);
  const counter = elements(tree).find((item) => item.props['data-testid'] === 'selected-count');
  assert.equal(textOf(counter!), '0 of 1 selected', 'the counter reflects the live match count');
  (rowLi!.props.onClick as (event: unknown) => void)({ target: { tagName: 'DIV' } });
  assert.deepEqual(toggled, ['u-9'], 'picking a narrowed keeper toggles it');
  assert.deepEqual(navSearch, [], 'browsing never navigates');
});

test('a narrowed set with no matches echoes the query', () => {
  const { tree } = render({ ...base, userNarrowing: userNarrowingState({
    narrowed: true, active: true, query: 'zzz', rows: [], total: 0 }) });
  assert.match(textOf(tree), /Nothing matches “\s*zzz\s*”\./);
});

test('Enter falls back to the URL-param search (debounced); plain typing never navigates', () => {
  const { navSearch, nav } = render({ userPicker: { ...baseUserPicker, total: 45 } });
  const props = live();
  (props.onEnter as (text: string) => void)('nova');
  assert.deepEqual(navSearch, ['/admin/subscriptions?wizard=open&step=1&usearch=nova']);
  assert.deepEqual(nav, [], 'fallback only, never a pick');
});

test('S13d: the picker search input hides when the picker holds less than a page; the pair and counter stay', () => {
  // The base picker holds 2 rows against a pageSize of 20 — the real wizard
  // shape (~12 keepers): no search box, but the select pair and the counter
  // stay (the mockup's toolbar anatomy).
  const step1 = render(base);
  assert.equal(lastLiveSearch.length, 0, 'no keeper search input below one page');
  assert.equal(elements(step1.tree).some((item) => item.props['data-testid'] === 'select-all'), true,
    'Select all stays');
  assert.equal(elements(step1.tree).some((item) =>
    item.props['data-testid'] === 'selected-count'), true, 'the counter stays');
  const step2 = render({ ...base, step: 2, selectedKeepers: [selectedKeeper] });
  assert.equal(lastLiveSearch.length, 0, 'no plan search input below one page');
  assert.ok(elements(step2.tree).some((item) => item.props['data-testid'] === 'picker-count'),
    'the plan count chip stays');
  const step3 = render({ ...base, step: 3, selectedKeepers: [selectedKeeper],
    selectedPlan: planWithTwoOptions });
  assert.equal(lastLiveSearch.length, 0);
  assert.equal(elements(step3.tree).some((item) => item.props['data-testid'] === 'list-toolbar'), false,
    'no search toolbar on the options step');
});

// --- Step 2: plan + context bar ---

test('step 2 shows the keeper context bar with the batch names and the active plan list', () => {
  const { tree, nav, byLabel } = render({ step: 2, selectedKeepers: [selectedKeeper] });
  const rendered = textOf(tree);
  assert.match(rendered, /Assigning to/);
  assert.match(rendered, /1 keeper\s*:\s*Marta Keeper/);
  assert.match(rendered, /Pro/);
  const change = byLabel('Change keepers');
  assert.ok(change, 'context bar change affordance missing');
  (change.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=1']);
  const fresh = render({ step: 2, selectedKeepers: [selectedKeeper] });
  (fresh.byLabel('Select Pro')!.props.onClick as () => void)();
  assert.deepEqual(fresh.nav.slice(-1),
    ['/admin/subscriptions?wizard=open&step=3&plan=p-1'],
    'picking a plan advances straight to the options step (U6), keeper state stays client-owned');
});

test('plan rows show their included features read-only — nothing feature-editable anywhere', () => {
  const { tree } = render({ step: 2, selectedKeepers: [selectedKeeper] });
  const rendered = textOf(tree);
  assert.match(rendered, /Included features — read-only/);
  assert.match(rendered, /View the collection, Log feeding/);
  assert.match(rendered, /No enabled features yet/, 'a plan without features renders the fallback');
  assert.equal(elements(tree).some((item) => item.type === 'form'), false,
    'no editable feature affordance exists on the plan step');
});

test('narrowed plan rows carry the feature line too', () => {
  const { tree } = render({ ...base, step: 2, selectedKeepers: [selectedKeeper],
    planNarrowing: planNarrowingState({
      narrowed: true, active: true, query: 'pro',
      rows: [{ id: 'p-9', title: 'Pro', subtitle: 'STANDARD',
        features: ['View the universe'] }], total: 3, page: 1 }) });
  const rendered = textOf(tree);
  assert.match(rendered, /Included features — read-only/);
  assert.match(rendered, /View the universe/);
});

test('picking a plan clears a stale option and lands on step 3', () => {
  const { nav, byLabel } = render({ step: 2, selectedKeepers: [selectedKeeper],
    selectedOptionId: 'o-monthly' });
  (byLabel('Select Pro')!.props.onClick as () => void)();
  const href = nav[0];
  assert.ok(href.includes('step=3'), href);
  assert.ok(href.includes('plan=p-1'), href);
  assert.equal(href.includes('option='), false, 'stale option must be cleared');
  const { navSearch } = render({ step: 2, selectedKeepers: [selectedKeeper],
    planPicker: { ...basePlanPicker, total: 45 } });
  assert.ok(live(), 'plan search missing');
  (live()!.onEnter as (text: string) => void)('pro');
  assert.deepEqual(navSearch, ['/admin/subscriptions?wizard=open&step=2&psearch=pro']);
});

test('a selected plan folds the plan list; back returns to the keeper step', () => {
  const { tree, nav, links } = render({ step: 2, selectedKeepers: [selectedKeeper],
    selectedPlan: planWithTwoOptions,
    userPicker: { ...baseUserPicker, search: 'ma', page: 2 } });
  const rendered = textOf(tree);
  assert.match(rendered, /Pro/);
  assert.doesNotMatch(rendered, /Basic/);
  // The plan focused view's Change (not the context bar's, which carries an
  // aria-label) unfolds the plan list again.
  const change = elements(tree).find((item) => item.type === 'button' &&
    textOf(item) === 'Change' && !item.props['aria-label']);
  (change!.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=2'],
    'the plan focused view restores the plan picker location');
  const back = links().find((item) => textOf(item) === 'Back to keepers');
  assert.equal(back?.props.href, '/admin/subscriptions?wizard=open&step=1&usearch=ma&upage=2');
});

// --- Step 3: options, summary, assign ---

const step3: Partial<AssignPlanWizardViewProps> = {
  step: 3, selectedKeepers: [selectedKeeper], selectedPlan: planWithTwoOptions,
  selectedOptionId: '', effectiveAt: '', onEffectiveAtChange: () => {},
  assignResult: undefined,
};

test('step 3 lists only the chosen plan\'s active billing options', () => {
  const { tree } = render(step3);
  const rendered = textOf(tree);
  assert.match(rendered, /Monthly — \$4\.99/);
  assert.match(rendered, /Annual — \$49\.99/);
  assert.doesNotMatch(rendered, /\$9\.99/, 'inactive option must not render');
  assert.doesNotMatch(rendered, /o-dead/);
});

test('picking an option folds the option list and updates the batch summary', () => {
  const selected = render({ ...step3, selectedOptionId: 'o-monthly' });
  const rendered = textOf(selected.tree);
  assert.match(rendered, /Monthly — \$4\.99/);
  assert.doesNotMatch(rendered, /Annual — \$49\.99/);
  assert.match(rendered, /Assigning: Pro \(Monthly — \$4\.99\)/);
  assert.match(rendered, /To 1 keeper\s*:\s*Marta Keeper/);
  assert.match(rendered, /Effective: today/);
  assert.match(rendered, /row locks/);
  assert.match(rendered, /all-or-nothing/);
  const change = elements(selected.tree).find((item) => item.type === 'button' &&
    textOf(item) === 'Change' && !item.props['aria-label']);
  (change!.props.onClick as () => void)();
  assert.deepEqual(selected.nav, ['/admin/subscriptions?wizard=open&step=3&plan=p-1']);
  const unfolded = render(step3);
  (unfolded.byLabel('Select Annual — $49.99')!.props.onClick as () => void)();
  assert.deepEqual(unfolded.nav,
    ['/admin/subscriptions?wizard=open&step=3&plan=p-1&option=o-annual']);
});

test('the context bar names every keeper of the batch on step 3', () => {
  const { tree } = render({ ...step3, selectedKeepers: [selectedKeeper, selectedKeeper2] });
  const context = elements(tree).find((item) => item.props['data-testid'] === 'wizard-context');
  assert.ok(context, 'context bar missing');
  assert.match(textOf(context!), /2 keepers\s*:\s*Marta Keeper, Dan O\./);
});

test('the assign form carries the batch as hidden inputs and gates the submit', () => {
  const batch = render({ ...step3, selectedKeepers: [selectedKeeper, selectedKeeper2],
    selectedOptionId: 'o-monthly' });
  const form = elements(batch.tree).find((item) => item.type === 'form');
  assert.ok(form, 'assign form missing');
  const hidden = elements(form).filter((item) => item.type === 'input');
  assert.deepEqual(hidden.map((item) => ({ name: item.props.name, value: item.props.value })), [
    { name: 'userIds', value: 'u-1,u-2' },
    { name: 'planId', value: 'p-1' },
    { name: 'planBillingOptionId', value: 'o-monthly' },
    { name: 'effectiveAt', value: '' },
  ]);
  const submit = batch.buttons().find((item) => textOf(item) === 'Assign plan');
  assert.equal(submit?.props.disabled, false);
  const gated = render(step3);
  const gatedSubmit = gated.buttons().find((item) => textOf(item) === 'Assign plan');
  assert.equal(gatedSubmit?.props.disabled, true, 'no option yet → gated');
  const emptyBatch = render({ ...step3, selectedKeepers: [], selectedOptionId: 'o-monthly' });
  assert.equal(elements(emptyBatch.tree).find((item) =>
    item.props['data-testid'] === 'wizard-context'), undefined,
    'an empty batch folds the step back to 1 (no assign form at all)');
});

test('the effective date is a controlled date field and feeds the summary', () => {
  let changed = '';
  const { inputs } = render({ ...step3,
    onEffectiveAtChange: (value: string) => { changed = value; } });
  const field = inputs().find((item) => item.props.name === 'effectiveAt');
  assert.ok(field, 'effective date field missing');
  assert.equal(field?.props.type, 'date', 'the mockup uses a type="date" field');
  (field.props.onChange as (event: unknown) => void)({ target: { value: '2026-10-01' } });
  assert.equal(changed, '2026-10-01');
  const withDate = render({ ...step3, selectedOptionId: 'o-monthly', effectiveAt: '2026-10-01' });
  assert.match(textOf(withDate.tree), /Effective: 2026-10-01/);
});

test('the client wrapper prefills the effective date with today (mockup parity)', () => {
  resetCaptures();
  const { effectiveAt: _e, onEffectiveAtChange: _o, selectedKeepers: _k,
    onToggleKeeper: _t, onSelectAllKeepers: _a, onSelectNoneKeepers: _n,
    trayCollapsed: _c, onTrayCollapsedToggle: _tc,
    navigate: _nav, navigateSearch: _s, assignDispatch: _d, assignResult: _r,
    assignPending: _p, ...wrapperProps } = {
    ...base, step: 3, selectedKeepers: [selectedKeeper], selectedPlan: planWithTwoOptions,
    selectedOptionId: 'o-monthly' } as AssignPlanWizardViewProps;
  const tree = AssignPlanWizard({ ...wrapperProps, prefilledKeepers: [selectedKeeper] }) as unknown;
  elements(tree);
  const field = elements(tree).find((item) => item.props.name === 'effectiveAt');
  assert.ok(field, 'wrapper-rendered effective date field missing');
  assert.match(String(field?.props.value), /^\d{4}-\d{2}-\d{2}$/,
    'the effective date is prefilled with today');
});

test('step 3 navigates back to the plan step and cancel folds the wizard', () => {
  const { nav, links, buttons } = render({ ...step3, selectedOptionId: 'o-monthly',
    listSearch: 'x', listPage: 2 });
  const back = links().find((item) => textOf(item) === 'Back to plan');
  assert.equal(back?.props.href,
    '/admin/subscriptions?search=x&page=2&wizard=open&step=2&plan=p-1');
  const cancel = buttons().find((item) => textOf(item) === 'Cancel');
  assert.ok(cancel, 'cancel affordance missing');
  (cancel.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?search=x&page=2']);
});

test('a failed assign renders the named error and keeps the wizard open', () => {
  const { tree } = render({ ...step3, selectedOptionId: 'o-monthly',
    assignResult: { error: "Keeper u-9's account is being deleted — remove them from the selection." } });
  const rendered = textOf(tree);
  assert.match(rendered, /being deleted — remove them from the selection\./);
  assert.match(rendered, /Assigning: Pro/);
});

test('the step chips mark the current step (1 · Keepers)', () => {
  const { tree } = render(step3);
  const chips = elements(tree).filter((item) => item.props['aria-current'] === 'step');
  assert.equal(chips.length, 1);
  assert.match(textOf(chips[0]), /3 · Options/);
  assert.match(textOf(tree), /1 · Keepers/);
  assert.match(textOf(tree), /2 · Plan/);
});

test('the step 3 hint carries the all-or-nothing constraints', () => {
  const { tree } = render(step3);
  const rendered = textOf(tree);
  assert.match(rendered, /All-or-nothing/);
  assert.match(rendered, /aborts the whole batch with a named error/);
  assert.match(rendered, /never a partial assignment/);
  assert.match(rendered, /audit reason is derived/);
});

// --- Wrapper: the keeper-selection state owner ------------------------------

const shellBase = {
  step: 1, listSearch: '', listPage: 1, selectedPlan: null, selectedOptionId: '',
  userPicker: baseUserPicker, planPicker: basePlanPicker,
  prefilledKeepers: [] as Array<{ id: string; name: string; email: string }>,
};

/** Renders the state-owning wrapper (its hooks stubbed so the initial state is
 * visible and every setter call is recorded, like the plans accordion tests). */
const renderShell = (overrides: Record<string, unknown> = {}) => {
  lastLiveSearch = [];
  resetCaptures();
  const tree = AssignPlanWizard({ ...shellBase, ...overrides }) as unknown;
  elements(tree);
  return { tree,
    buttons: () => elements(tree).filter((item) => item.type === 'button'),
    rows: () => elements(tree).filter((item) => item.props['data-row-id']),
  };
};

const isMap = (value: unknown) => Object.prototype.toString.call(value) === '[object Map]';

const selectionSetter = () => {
  const updaters = stateSetterCalls.filter((call) => typeof call === 'function');
  return updaters.at(-1) as (previous: Map<string, { name: string; email: string }>) =>
    Map<string, { name: string; email: string }>;
};

test('state owner: toggles accumulate in the keeper map, a re-toggle removes the id, paging never prunes', () => {
  const shell = renderShell();
  const row = shell.rows().find((item) => item.props['data-row-id'] === 'u-1');
  (row!.props.onClick as (event: unknown) => void)({ target: { tagName: 'DIV' } });
  const updater = selectionSetter();
  const merged = updater(new Map([['u-9', { name: 'Existing', email: 'x@example.com' }]]));
  assert.deepEqual(JSON.parse(JSON.stringify([...merged.entries()])), [
    ['u-9', { name: 'Existing', email: 'x@example.com' }],
    ['u-1', { name: 'Marta Keeper', email: 'marta@example.com' }],
  ], 'picks merge with display data — page changes cannot lose them');
  // Toggling the selected id again removes exactly that keeper.
  const rowAgain = shell.rows().find((item) => item.props['data-row-id'] === 'u-1');
  (rowAgain!.props.onClick as (event: unknown) => void)({ target: { tagName: 'DIV' } });
  const removeUpdater = selectionSetter();
  const removed = removeUpdater(new Map([['u-1', { name: 'Marta Keeper', email: 'm' }]]));
  assert.equal(removed.size, 0, 'the re-toggle removes the keeper');
});

test('S13c: Select all fetches the users ids endpoint at the active query and merges full display data', async () => {
  const shell = renderShell({ userPicker: { ...baseUserPicker, search: 'ma', total: 45 } });
  selectableFixture = [{ id: 'u-5', title: 'Tom H.', subtitle: 'tom@example.com' }];
  const all = shell.buttons().find((item) => textOf(item) === 'Select all');
  assert.ok(all, 'the shell must wire Select all');
  await (all!.props.onClick as () => Promise<void>)();
  assert.deepEqual(idFetches, [{ entity: 'users', query: 'ma' }],
    'the committed search scopes Select all; one fetch on click, never per keystroke');
  const updater = selectionSetter();
  const merged = updater(new Map([['u-9', { name: 'Kept', email: 'kept@example.com' }]]));
  assert.deepEqual(JSON.parse(JSON.stringify(merged.get('u-5'))),
    { name: 'Tom H.', email: 'tom@example.com' },
    'tray chips carry the display triple, never a bare id');
  assert.ok(merged.has('u-9'), 'existing picks survive');
});

test('S13c: Select none clears the whole keeper selection', () => {
  const shell = renderShell({ selectedKeepers: [] });
  const none = shell.buttons().find((item) => textOf(item) === 'Select none');
  assert.ok(none, 'the shell must wire Select none');
  (none!.props.onClick as () => void)();
  const cleared = stateSetterCalls.find(isMap) as Map<string, unknown>;
  assert.ok(cleared, 'the selection setter must receive a fresh map');
  assert.equal(cleared.size, 0, 'Select none empties the tray; the counter returns to 0 of M');
});

test('a Reassign deep link preselects that keeper into the tray', () => {
  const shell = renderShell({ step: 2,
    prefilledKeepers: [{ id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' }] });
  const rendered = textOf(shell.tree);
  assert.match(rendered, /Assigning to/);
  assert.match(rendered, /1 keeper\s*:\s*Marta Keeper/, 'the prefill seeds the selection map');
});

test('a successful assign clears the tray and returns to step 1 (the mockup\'s post-assign reset)', async () => {
  const shell = renderShell({ step: 3, selectedPlan: planWithTwoOptions,
    selectedOptionId: 'o-monthly',
    prefilledKeepers: [{ id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' }] });
  actionResult = { success: true };
  const assign = shell.buttons().find((item) => textOf(item) === 'Assign plan');
  assert.ok(assign, 'the assign submit missing');
  const form = elements(shell.tree).find((item) => item.type === 'form');
  (form!.props.onSubmit as (event: unknown) => void)({ preventDefault: () => {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(pushed, ['/admin/subscriptions?wizard=open&step=1'],
    'back to step 1, not folded away');
  const cleared = stateSetterCalls.find(isMap) as Map<string, unknown>;
  assert.ok(cleared, 'the tray is cleared');
  assert.equal(cleared.size, 0);
});

test('a failed assign keeps the batch and the step (no navigation, no reset)', async () => {
  const shell = renderShell({ step: 3, selectedPlan: planWithTwoOptions,
    selectedOptionId: 'o-monthly',
    prefilledKeepers: [{ id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' }] });
  actionResult = { error: 'Choose an active billing option.' };
  const assign = shell.buttons().find((item) => textOf(item) === 'Assign plan');
  const form = elements(shell.tree).find((item) => item.type === 'form');
  (form!.props.onSubmit as (event: unknown) => void)({ preventDefault: () => {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(pushed, [], 'failure never navigates');
  assert.equal(stateSetterCalls.filter((call) => isMap &&
    isMap(call) && (call as Map<string, unknown>).size === 0).length, 0,
    'failure never clears the tray');
});

type InputProps = Record<string, unknown> & {
  id?: string; value?: string; placeholder?: string;
  onEnter?: (text: string) => void;
};

const live = (): InputProps => lastLiveSearch.at(-1) as InputProps;