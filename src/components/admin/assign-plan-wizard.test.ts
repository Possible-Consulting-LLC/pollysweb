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

// The real shared SelectionList runs (single mode is the point of the wizard);
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

const deps: Record<string, unknown> = {
  // Hook stubs: only the thin client wrapper uses hooks; tests drive the
  // hook-free view, exactly like the plans accordion tests.
  react: {
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useActionState: () => [undefined, () => {}, false],
  },
  'react/jsx-runtime': jsx,
  'next/navigation': { useRouter: () => ({ push: () => {} }) },
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
  },
  'next/link': { default: ({ href, children, className, ...rest }: Record<string, unknown>) =>
    jsx.jsx('a', { href, className, ...rest, children }) },
  '@/lib/utils': { cn },
  '@/components/admin/selection-list': selectionList,
  '@/components/admin/selection-tray': selectionTray,
  '@/components/admin/list-shared': listSharedExports,
  '@/components/ui/card': { cardClassName: 'card' },
  '@/components/ui/button': buttonStub,
  '@/components/mutation-form': { MutationForm: ({ action, children, ...props }: Record<string, unknown>) =>
    jsx.jsx('form', { ...props, 'data-action': String(action), children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/app/admin/subscriptions/actions': { assignSubscriptionAction: 'assign-action' },
};

const wizardModule = loadModule('./assign-plan-wizard.tsx', deps);
const AssignPlanWizardView = wizardModule.AssignPlanWizardView as
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
    { id: 'p-1', title: 'Pro', subtitle: 'Standard · 2 active billing options' },
    { id: 'p-2', title: 'Basic', subtitle: 'Standard · 2 active billing options' },
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
const selectedUser = { id: 'u-1', name: 'Marta Keeper', email: 'marta@example.com' };

const base: Partial<AssignPlanWizardViewProps> = {
  step: 1, listSearch: '', listPage: 1,
  selectedUser: null, selectedPlan: null, selectedOptionId: '',
  userPicker: baseUserPicker, planPicker: basePlanPicker,
  userNarrowing: userNarrowingState() as unknown as AssignPlanWizardViewProps['userNarrowing'],
  planNarrowing: planNarrowingState() as unknown as AssignPlanWizardViewProps['planNarrowing'],
  effectiveAt: '', onEffectiveAtChange: () => {},
  navigate: () => {}, navigateSearch: () => {},
  assignDispatch: () => {}, assignResult: undefined,
  assignPending: false,
};

const render = (overrides: Partial<AssignPlanWizardViewProps> = {}) => {
  lastLiveSearch = [];
  const nav: string[] = [];
  const navSearch: string[] = [];
  const dispatched: FormData[] = [];
  const tree = AssignPlanWizardView({ ...base, ...overrides,
    navigate: (href: string) => { nav.push(href); },
    navigateSearch: (href: string) => { navSearch.push(href); },
    assignDispatch: (form: FormData) => { dispatched.push(form); } }) as unknown;
  // Resolving the tree invokes the function-component stubs (the live search
  // hook) so tests can drive it.
  elements(tree);
  return { tree, nav, navSearch, dispatched,
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
  assert.equal(wizardHref(list, { step: 2, user: 'u-1' }),
    '/admin/subscriptions?wizard=open&step=2&user=u-1');
  assert.equal(wizardHref({ search: 'x', page: 3 }, { step: 1 }),
    '/admin/subscriptions?search=x&page=3&wizard=open&step=1');
  assert.equal(wizardHref(list, { step: 3, user: 'u-1', plan: 'p-1', option: 'o-1',
    usearch: 'ma', upage: 2, psearch: 'pro', ppage: 2 }),
    '/admin/subscriptions?wizard=open&step=3&user=u-1&plan=p-1&option=o-1&usearch=ma&upage=2&psearch=pro&ppage=2');
});

// --- Step 1: user ---

test('step 1 lists keepers through the single-mode SelectionList', () => {
  const { tree, buttons } = render();
  assert.equal(elements(tree).some((item) => item.props.role === 'checkbox'), false);
  assert.match(textOf(tree), /Marta Keeper/);
  assert.match(textOf(tree), /marta@example\.com/);
  assert.ok(buttons().find((item) => textOf(item) === 'Continue to plan'), 'continue affordance missing');
});

test('picker rows carry the leading initials avatar (mockup row anatomy)', () => {
  const { tree } = render();
  const marta = elements(tree).find((item) => item.props['aria-label'] === 'Select Marta Keeper');
  const avatar = elements(marta!).find((item) => item.props['data-row-avatar']);
  assert.ok(avatar, 'committed picker rows lack the initials avatar');
  assert.equal(avatar?.props['data-row-avatar'], 'MK');
  assert.equal(String(avatar.props.className).includes('bg-[var(--lavender)]'), true);
  // Narrowed (live) rows derive their initials locally — the suggest endpoint
  // does not carry a leading glyph.
  const live = render({ ...base, userNarrowing: userNarrowingState({
    narrowed: true, active: true, query: 'nova',
    rows: [{ id: 'u-9', title: 'Nova Q. Keeper', subtitle: 'nova@example.com' }],
    total: 1, page: 1 }) });
  const nova = elements(live.tree).find((item) => item.props['aria-label'] === 'Select Nova Q. Keeper');
  const liveAvatar = elements(nova!).find((item) => item.props['data-row-avatar']);
  assert.equal(liveAvatar?.props['data-row-avatar'], 'NQ', 'narrowed rows lack the initials avatar');
});

test('picker rows render the meta badge slot: Valid on keepers, Selected in the focused view', () => {
  const { tree } = render();
  const badges = elements(tree).filter((item) => item.props['data-row-badge']);
  assert.deepEqual(badges.map((item) => item.props['data-row-badge']), ['Valid', 'Valid'],
    'every selectable keeper row carries the Valid badge');
  // The focused view (selection held) shows the gold Selected badge.
  const focused = render({ selectedUser });
  const selected = elements(focused.tree)
    .find((item) => item.props['data-row-badge'] === 'Selected');
  assert.ok(selected, 'focused view missing the Selected badge');
  assert.equal(String(selected.props.className).includes('bg-[var(--gold)]'), true);
});

test('deleting keepers are greyed and unselectable (mockup disabled rows)', () => {
  const { nav, tree } = render({ userPicker: { ...baseUserPicker, rows: [
    { id: 'u-1', title: 'Marta Keeper', subtitle: 'marta@example.com' },
    { id: 'u-9', title: 'Old Acct', subtitle: 'deleting@example.com',
      disabled: true, badgeLabel: 'deleting' },
  ] } });
  const old = elements(tree).find((item) => item.props['aria-label'] === 'Select Old Acct');
  assert.ok(old, 'deleting row missing');
  assert.equal(old?.props.disabled, true, 'deleting rows must be unselectable');
  assert.equal(String(old?.props.className).includes('cursor-not-allowed'), true,
    'deleting rows are greyed out');
  const badge = elements(old!).find((item) => item.props['data-row-badge'] === 'deleting');
  assert.ok(badge, 'deleting rows carry their status badge');
  (old!.props.onClick as () => void)();
  assert.deepEqual(nav, [], 'a disabled row must never navigate');
});

test('picking a keeper auto-advances straight to step 2 (no confirmation click)', () => {
  const { nav, byLabel } = render();
  (byLabel('Select Marta Keeper')!.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=2&user=u-1']);
  const paged = render({ userPicker: { ...baseUserPicker, search: 'ma', page: 2 } });
  (paged.byLabel('Select Marta Keeper')!.props.onClick as () => void)();
  assert.deepEqual(paged.nav,
    ['/admin/subscriptions?wizard=open&step=2&user=u-1&usearch=ma&upage=2']);
});

test('keeper search resets to page 1 and pagination preserves the search', () => {
  // S13d: the input contract is pinned on an above-page picker (a smaller
  // picker hides the input entirely — see the S13d test).
  const { navSearch, nav, tree } = render({ userPicker: { ...baseUserPicker, total: 45 } });
  // The picker's search input is the narrowing input; its explicit fallback
  // (Enter) is the URL-param search — typed text and a reset to page 1.
  assert.ok(live(), 'keeper search missing');
  (live()!.onEnter as (text: string) => void)('ma');
  // Dropping upage returns the picker to page 1.
  assert.deepEqual(navSearch, ['/admin/subscriptions?wizard=open&step=1&usearch=ma']);
  const pager = render({ userPicker: { ...baseUserPicker, search: 'ma', page: 2,
    total: 45, rows: Array.from({ length: 20 }, (_, index) =>
      ({ id: `u-${index + 1}`, title: `Keeper ${index + 1}` })) } });
  (pager.byLabel('Next page')!.props.onClick as () => void)();
  assert.deepEqual(pager.nav, ['/admin/subscriptions?wizard=open&step=1&usearch=ma&upage=3']);
  void nav;
  void tree;
});

test('a selected keeper folds the list into the focused view with a change affordance', () => {
  const { tree, nav } = render({ selectedUser });
  const rendered = textOf(tree);
  assert.match(rendered, /Marta Keeper/);
  assert.match(rendered, /marta@example\.com/);
  assert.doesNotMatch(rendered, /Dan O\./);
  const change = elements(tree).find((item) => item.type === 'button' && textOf(item) === 'Change');
  assert.ok(change, 'focused-view change affordance missing');
  (change.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=1']);
  // Continue advances to the plan step with the keeper carried along.
  const continueLink = elements(tree).find((item) => item.type === 'a' && textOf(item) === 'Continue to plan');
  assert.equal(continueLink?.props.href, '/admin/subscriptions?wizard=open&step=2&user=u-1');
});

test('changing the keeper restores the picker view the user came from', () => {
  const { tree, nav } = render({ selectedUser,
    userPicker: { ...baseUserPicker, search: 'ma', page: 2 } });
  const changeButton = elements(tree).find((item) => item.type === 'button' && textOf(item) === 'Change');
  (changeButton!.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=1&usearch=ma&upage=2']);
});

// --- Step 2: plan + context bar ---

test('step 2 shows the keeper context bar and the active plan list', () => {
  const { tree, nav, byLabel } = render({ step: 2, selectedUser });
  const rendered = textOf(tree);
  assert.match(rendered, /Assigning to/);
  assert.match(rendered, /Marta Keeper/);
  assert.match(rendered, /marta@example\.com/);
  assert.match(rendered, /Pro/);
  const change = byLabel('Change keeper');
  assert.ok(change, 'context bar change affordance missing');
  (change.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=1']);
  (byLabel('Select Pro')!.props.onClick as () => void)();
  assert.deepEqual(nav.slice(1),
    ['/admin/subscriptions?wizard=open&step=3&user=u-1&plan=p-1'],
    'picking a plan advances straight to the options step');
});

test('picking a plan clears a stale option and lands on step 3', () => {
  const { nav, byLabel } = render({ step: 2, selectedUser, selectedOptionId: 'o-monthly' });
  (byLabel('Select Pro')!.props.onClick as () => void)();
  const href = nav[0];
  assert.ok(href.includes('step=3'), href);
  assert.ok(href.includes('plan=p-1'), href);
  assert.equal(href.includes('option='), false, 'stale option must be cleared');
  const { navSearch } = render({ step: 2, selectedUser,
    planPicker: { ...basePlanPicker, total: 45 } });
  assert.ok(live(), 'plan search missing');
  (live()!.onEnter as (text: string) => void)('pro');
  assert.deepEqual(navSearch,
    ['/admin/subscriptions?wizard=open&step=2&user=u-1&psearch=pro']);
});

test('a selected plan folds the plan list; back returns to the keeper step', () => {
  const { tree, nav, links } = render({ step: 2, selectedUser, selectedPlan: planWithTwoOptions });
  const rendered = textOf(tree);
  assert.match(rendered, /Pro/);
  assert.doesNotMatch(rendered, /Basic/);
  // The plan focused view's Change (not the context bar's, which carries an
  // aria-label) unfolds the plan list again.
  const change = elements(tree).find((item) => item.type === 'button' &&
    textOf(item) === 'Change' && !item.props['aria-label']);
  (change!.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=2&user=u-1']);
  const back = links().find((item) => textOf(item) === 'Back to user');
  assert.equal(back?.props.href, '/admin/subscriptions?wizard=open&step=1&user=u-1');
});

// --- Step 3: options, summary, assign ---

const step3: Partial<AssignPlanWizardViewProps> = {
  step: 3, selectedUser, selectedPlan: planWithTwoOptions, selectedOptionId: '',
  effectiveAt: '', onEffectiveAtChange: () => {}, assignResult: undefined,
};

test('step 3 lists only the chosen plan\'s active billing options', () => {
  const { tree } = render(step3);
  const rendered = textOf(tree);
  assert.match(rendered, /Monthly — \$4\.99/);
  assert.match(rendered, /Annual — \$49\.99/);
  assert.doesNotMatch(rendered, /\$9\.99/, 'inactive option must not render');
  assert.doesNotMatch(rendered, /o-dead/);
});

test('picking an option folds the option list and updates the live summary', () => {
  const selected = render({ ...step3, selectedOptionId: 'o-monthly' });
  const rendered = textOf(selected.tree);
  assert.match(rendered, /Monthly — \$4\.99/);
  assert.doesNotMatch(rendered, /Annual — \$49\.99/);
  assert.match(rendered, /Assigning: Pro \(Monthly — \$4\.99\)/);
  assert.match(rendered, /To: Marta Keeper \(marta@example\.com\)/);
  assert.match(rendered, /Effective: today/);
  assert.match(rendered, /row-locked/);
  const change = elements(selected.tree).find((item) => item.type === 'button' &&
    textOf(item) === 'Change' && !item.props['aria-label']);
  (change!.props.onClick as () => void)();
  assert.deepEqual(selected.nav, ['/admin/subscriptions?wizard=open&step=3&user=u-1&plan=p-1']);
  const unfolded = render(step3);
  (unfolded.byLabel('Select Annual — $49.99')!.props.onClick as () => void)();
  assert.deepEqual(unfolded.nav,
    ['/admin/subscriptions?wizard=open&step=3&user=u-1&plan=p-1&option=o-annual']);
});

test('the assign form carries the selection as hidden inputs and gates the submit', () => {
  const gated = render(step3);
  const form = elements(gated.tree).find((item) => item.type === 'form');
  assert.ok(form, 'assign form missing');
  const hidden = elements(form).filter((item) => item.type === 'input');
  // MutationContextInput is stubbed to null here; the wizard's own fields are
  // what carry the selection.
  assert.deepEqual(hidden.map((item) => ({ name: item.props.name, value: item.props.value })), [
    { name: 'userQuery', value: 'u-1' },
    { name: 'planId', value: 'p-1' },
    { name: 'planBillingOptionId', value: '' },
    { name: 'effectiveAt', value: '' },
  ]);
  const submit = gated.buttons().find((item) => textOf(item) === 'Assign plan');
  assert.equal(submit?.props.disabled, true);
  const ready = render({ ...step3, selectedOptionId: 'o-monthly' });
  const readySubmit = ready.buttons().find((item) => textOf(item) === 'Assign plan');
  assert.equal(readySubmit?.props.disabled, false);
  const readyForm = elements(ready.tree).find((item) => item.type === 'form');
  assert.deepEqual(elements(readyForm).filter((item) => item.type === 'input')
    .map((item) => ({ name: item.props.name as string, value: item.props.value }))
    .filter((item) => item.name === 'planBillingOptionId'),
    [{ name: 'planBillingOptionId', value: 'o-monthly' }]);
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
  lastLiveSearch = [];
  const { effectiveAt: _e, onEffectiveAtChange: _o, navigate: _n, navigateSearch: _s,
    assignDispatch: _d, assignResult: _r, assignPending: _p, ...wrapperProps } = {
    ...base, step: 3, selectedUser, selectedPlan: planWithTwoOptions,
    selectedOptionId: 'o-monthly' } as AssignPlanWizardViewProps;
  const tree = (wizardModule.AssignPlanWizard as (props: Record<string, unknown>) => unknown)
    (wrapperProps) as unknown;
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
    '/admin/subscriptions?search=x&page=2&wizard=open&step=2&user=u-1&plan=p-1');
  const cancel = buttons().find((item) => textOf(item) === 'Cancel');
  assert.ok(cancel, 'cancel affordance missing');
  (cancel.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?search=x&page=2']);
});

test('a failed assign renders the error and keeps the wizard open', () => {
  const { tree } = render({ ...step3, selectedOptionId: 'o-monthly',
    assignResult: { error: 'Choose an active billing option.' } });
  const rendered = textOf(tree);
  assert.match(rendered, /Choose an active billing option\./);
  assert.match(rendered, /Assigning: Pro/);
});

test('a successful assign folds the wizard away', () => {
  const { tree } = render({ ...step3, selectedOptionId: 'o-monthly',
    assignResult: { success: true } });
  assert.equal(textOf(tree), '');
});

test('the step chips mark the current step', () => {
  const { tree } = render(step3);
  const chips = elements(tree).filter((item) => item.props['aria-current'] === 'step');
  assert.equal(chips.length, 1);
  assert.match(textOf(chips[0]), /3 · Options/);
  assert.match(textOf(tree), /1 · User/);
  assert.match(textOf(tree), /2 · Plan/);
});

// --- Task 8 fix round 1: headless narrowing in the pickers ---

type InputProps = Record<string, unknown> & {
  id?: string; value?: string; placeholder?: string;
  onEnter?: (text: string) => void;
};

const live = (): InputProps => lastLiveSearch.at(-1) as InputProps;

test('step 1 search is a plain narrowing input wired to the users endpoint', () => {
  // S13d: pinned on an above-page picker (a smaller picker hides the input).
  render({ userPicker: { ...baseUserPicker, total: 45 } });
  const props = live();
  assert.ok(props, 'live search missing');
  assert.equal(props.id, 'wizard-user-search');
  assert.equal(props.value, '');
  assert.equal(props.onEnter !== undefined, true,
    'Enter is the explicit full-page fallback');
});

test('typing live-renders matched keepers in place with a truthful live count', () => {
  const { nav, navSearch, tree } = render(base);
  // Idle: the committed picker page renders with the committed total.
  assert.match(textOf(tree), /2 keepers/);
  assert.match(textOf(tree), /Marta Keeper/);
  // Narrowed matches land: they replace the committed page in place.
  const live = render({ ...base, userNarrowing: userNarrowingState({
    narrowed: true, active: true, query: 'nova',
    rows: [{ id: 'u-9', title: 'Nova Keeper', subtitle: 'nova@example.com' }],
    total: 1, page: 1, loading: false }) });
  const rows = elements(live.tree).filter((item) =>
    item.props['aria-label'] === 'Select Nova Keeper');
  assert.equal(rows.length, 1, 'matched keepers render as clickable rows in place');
  assert.equal(String(rows[0].props.className).includes('hover:bg-[var(--hover)]'), true);
  const chip = elements(live.tree).find((item) => item.props['data-testid'] === 'picker-count');
  assert.equal(textOf(chip!), '1 keeper', 'the counter reflects the live match count');
  assert.match(textOf(live.tree), /Nova Keeper/, 'matches render in place');
  (rows[0].props.onClick as () => void)();
  assert.deepEqual(live.nav, ['/admin/subscriptions?wizard=open&step=2&user=u-9'],
    'picking a narrowed keeper auto-advances to the plan step, nothing else navigates');
  assert.deepEqual(navSearch, [], 'browsing never navigates');
  void nav;
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

test('the picker toolbar carries the gold count chip beside the search input', () => {
  render(base);
  const chip = elements(render().tree).find((item) => item.props['data-testid'] === 'picker-count');
  assert.ok(chip, 'toolbar counter chip missing');
  assert.equal(String(chip.props.className).includes('bg-[var(--gold)]'), true);
  assert.equal(textOf(chip), '2 keepers', 'the chip shows the committed total when idle');
});

test('S13d: the picker search input hides when the picker holds less than a page; the counter stays', () => {
  // The base pickers hold 2 rows against a pageSize of 20 — the real wizard
  // shape (~4 plans, ~12 keepers): no search box on either step.
  const step1 = render(base);
  assert.equal(lastLiveSearch.length, 0, 'no keeper search input below one page');
  assert.ok(elements(step1.tree).some((item) => item.props['data-testid'] === 'picker-count'),
    'the count chip stays');
  const step2 = render({ ...base, step: 2 });
  assert.equal(lastLiveSearch.length, 0, 'no plan search input below one page');
  assert.ok(elements(step2.tree).some((item) => item.props['data-testid'] === 'picker-count'),
    'the count chip stays');
  // Step 3's billing options are a couple of rows at most: the same rule
  // keeps the options list search-free (the whole toolbar folds away in
  // single mode).
  const step3 = render({ ...base, step: 3, selectedUser,
    selectedPlan: planWithTwoOptions });
  assert.equal(lastLiveSearch.length, 0);
  assert.equal(elements(step3.tree).some((item) => item.props['data-testid'] === 'list-toolbar'), false,
    'no search toolbar on the options step');
});

test('step 2 plan search narrows in place and picking selects the plan', () => {
  const { nav, tree } = render({ ...base, step: 2, planNarrowing: planNarrowingState({
    narrowed: true, active: true, query: 'pro',
    rows: [{ id: 'p-9', title: 'Pro', subtitle: 'STANDARD' }], total: 3, page: 1 }) });
  const chip = elements(tree).find((item) => item.props['data-testid'] === 'picker-count');
  assert.equal(textOf(chip!), '3 plans', 'the plan counter is truthful during narrowing');
  const row = elements(tree).find((item) => item.props['aria-label'] === 'Select Pro');
  assert.ok(row, 'matched plan row missing');
  (row.props.onClick as () => void)();
  assert.deepEqual(nav, ['/admin/subscriptions?wizard=open&step=3&plan=p-9'],
    'picking a narrowed plan advances straight to the options step');
});