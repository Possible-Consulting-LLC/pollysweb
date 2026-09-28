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
  const item = node as Element & { type?: unknown };
  if (typeof item.type === 'function') return text((item.type as (props: unknown) => unknown)(item.props));
  return text(item.props.children);
}

function textOf(tree: unknown): string {
  return text(tree).replace(/\s+/g, ' ').trim();
}

const cn = (...parts: unknown[]) => parts.filter(Boolean).join(' ');

const buttonStub = {
  Button: ({ variant, size, className, ...props }: Record<string, unknown>) =>
    jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', className, ...props }),
  buttonVariants: ({ variant, size }: { variant?: string; size?: string } = {}) =>
    `variant-${variant ?? 'primary'} size-${size ?? 'md'}`,
};
const listSharedExports = loadModule('./list-shared.ts', {});

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

let lastInput: Record<string, unknown> | null = null;
const pushed: string[] = [];

const deps: Record<string, unknown> = {
  react: {
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useReducer: (reducer: unknown, initial: unknown) => [initial, () => {}],
  },
  'react/jsx-runtime': jsx,
  'lucide-react': { ChevronDown: (props: Record<string, unknown>) =>
    jsx.jsx('span', { 'data-chevron': true, ...props }) },
  'next/navigation': { useRouter: () => ({ push: (href: string) => { pushed.push(href); } }) },
  'next/link': { default: ({ href, children, className, ...rest }: Record<string, unknown>) =>
    jsx.jsx('a', { href, className, ...rest, children }) },
  '@/components/admin/live-search': {
    narrowViaEndpoint: (entity: string, pageSize: number) => `endpoint:${entity}:${pageSize}`,
    useNarrowing: () => narrowingState,
    LiveSearchInput: (props: Record<string, unknown>) => {
      lastInput = props;
      return jsx.jsx('input', { 'data-live-search-input': props.id, value: props.value });
    },
    NarrowPager: (props: Record<string, unknown>) => jsx.jsx('nav',
      { 'data-narrow-pager': true, 'data-page': props.page, 'data-total': props.total }),
  },
  '@/lib/utils': { cn },
  '@/components/admin/list-shared': listSharedExports,
  '@/components/ui/button': buttonStub,
  '@/components/mutation-form': { MutationForm: ({ children, ...props }: Record<string, unknown>) =>
    jsx.jsx('form', { ...props, children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/app/admin/subscriptions/actions': {
    endSubscriptionAction: 'end-action',
    editSubscriptionAction: 'edit-action',
  },
};

/** The canned narrowing state; tests flip `narrowed` and swap rows/total. */
const narrowingState: Record<string, unknown> = {
  text: '', query: '', active: false, narrowed: false, rows: [], total: 0,
  page: 1, loading: false,
  onType: (_text: string) => {}, onPageChange: (_page: number) => {}, onEscape: () => {},
};

const listModule = loadModule('./subscriptions-list.tsx', deps);
const SubscriptionsList = listModule.SubscriptionsList as (props: Record<string, unknown>) => unknown;
const SubscriptionsListView = listModule.SubscriptionsListView as (props: Record<string, unknown>) => unknown;

type ListRow = { id: string; userId: string; planId: string; planBillingOptionId: string;
  status: string; startedAt: string; renewsAt: string | null; expiresAt: string | null;
  userName: string | null; userEmail: string | null; planName: string | null;
  optionInterval: string | null; optionPriceCents: number | null;
  source: 'subscription' | 'tier'; tierKey: string | null;
  planOptions: Array<{ id: string; interval: string; basePriceCents: number; active: boolean }> };

const row = (overrides: Partial<ListRow> = {}): ListRow => ({
  id: 'sub-1', userId: 'u-1', planId: 'p-1', planBillingOptionId: 'o-1', status: 'ACTIVE',
  startedAt: '2026-08-01T00:00:00.000Z', renewsAt: '2026-09-01T00:00:00.000Z', expiresAt: null,
  userName: 'Marta Keeper', userEmail: 'marta@example.com', planName: 'Pro',
  optionInterval: 'MONTHLY', optionPriceCents: 499,
  source: 'subscription', tierKey: null,
  planOptions: [{ id: 'o-1', interval: 'MONTHLY', basePriceCents: 499, active: true },
    { id: 'o-2', interval: 'ANNUAL', basePriceCents: 4999, active: true }],
  ...overrides });

/** A resolver-derived tier row (Task 11): display-only, no stored fields. */
const tierRow = (overrides: Partial<ListRow> = {}): ListRow => ({
  ...row({ id: 'tier:u-9', userId: 'u-9', planId: 'p-legacy', planBillingOptionId: '',
    status: 'LEGACY', startedAt: '1970-01-01T00:00:00.000Z', renewsAt: null, expiresAt: null,
    userName: 'Free Fiona', userEmail: 'fiona@example.com', planName: 'Free – Legacy',
    optionInterval: null, optionPriceCents: null, source: 'tier', tierKey: 'free',
    planOptions: [] }),
  ...overrides });

const base = {
  rows: [row(), { ...row(), id: 'sub-2', status: 'PAST_DUE', userName: 'Dan O.',
    userEmail: 'dan@example.com', planName: 'Basic', optionInterval: 'ANNUAL',
    optionPriceCents: 1999, startedAt: '2026-07-30T00:00:00.000Z', renewsAt: null,
    expiresAt: '2026-09-28T00:00:00.000Z' }],
  total: 2, search: '', page: 1, pageSize: 20, lastPage: 1,
  wizardParams: {} as Record<string, string>,
};

const viewBase = {
  ...base,
  expandedId: '', onToggleExpand: (_id: string) => {},
  editingId: '', onStartEdit: (_id: string) => {}, onCancelEdit: () => {},
};

const render = (overrides: Partial<typeof base> = {}) => {
  lastInput = null;
  Object.assign(narrowingState, { text: '', query: '', active: false, narrowed: false,
    rows: [], total: 0, page: 1, loading: false });
  return SubscriptionsList({ ...base, ...overrides }) as unknown;
};

const renderView = (overrides: Partial<typeof viewBase> = {}) => {
  lastInput = null;
  Object.assign(narrowingState, { text: '', query: '', active: false, narrowed: false,
    rows: [], total: 0, page: 1, loading: false });
  return SubscriptionsListView({ ...viewBase, ...overrides }) as unknown;
};

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    rows: all.filter(item => item.props['data-subscription-row']),
    links: all.filter(item => item.type === 'a'),
    buttons: all.filter(item => item.type === 'button'),
    forms: all.filter(item => item.type === 'form'),
  };
}

test('the committed view renders collapsed rows: keeper, plan, badge, dates — no actions yet', () => {
  const tree = renderView();
  const rendered = textOf(tree);
  assert.match(rendered, /Marta Keeper/);
  assert.match(rendered, /marta@example\.com/);
  assert.match(rendered, /Pro · Monthly — \$4\.99/);
  assert.match(rendered, /Basic · Annual — \$19\.99/);
  assert.match(rendered, /Active/);
  assert.match(rendered, /Past due/);
  assert.match(rendered, /since 2026-08-01 · renews 2026-09-01/);
  assert.match(rendered, /since 2026-07-30 · ends 2026-09-28/);
  // Collapsed rows carry no actions: everything lives behind the expand.
  assert.equal(elementsOf(tree).links.find(link => textOf(link) === 'Reassign'), undefined);
  assert.equal(elementsOf(tree).forms.find(form => form.props.action === 'end-action'), undefined);
  // Each row is a labeled expand toggle.
  const toggles = elementsOf(tree).buttons.filter(item => item.props['aria-expanded'] !== undefined);
  assert.deepEqual(toggles.map(item => item.props['aria-expanded']), [false, false]);
  assert.match(String(toggles[0].props.className), /hover:bg-\[var\(--hover\)\]/,
    'the mockup hover tint rides the expand toggle');
});

test('expanding a row reveals the detail card with Edit, Reassign, and End', () => {
  const tree = renderView({ expandedId: 'sub-1' });
  const rendered = textOf(tree);
  assert.match(rendered, /Marta Keeper/, 'the expanded row keeps its summary');
  const reassign = elementsOf(tree).links.find(link => textOf(link) === 'Reassign');
  assert.equal(reassign?.props.href, '/admin/subscriptions?wizard=open&step=2&user=u-1');
  const endForm = elementsOf(tree).forms.find(form => form.props.action === 'end-action');
  assert.ok(endForm, 'end mutation form missing');
  const hidden = elements(endForm).find(item => item.type === 'input' &&
    item.props.name === 'subscriptionId');
  assert.equal(hidden?.props.value, 'sub-1');
  const edit = elementsOf(tree).buttons.find(item => textOf(item) === 'Edit');
  assert.ok(edit, 'the Edit affordance is on the detail card');
  // Collapsed rows stay actionless.
  const collapsed = elementsOf(renderView()).forms;
  assert.equal(collapsed.find(form => form.props.action === 'end-action'), undefined);
});

test('Edit opens the in-place form: billing option + effective date, supersede on save', () => {
  const tree = renderView({ expandedId: 'sub-1', editingId: 'sub-1' });
  const editForm = elementsOf(tree).forms.find(form => form.props.action === 'edit-action');
  assert.ok(editForm, 'in-place edit form missing');
  const hidden = elements(editForm).find(item => item.type === 'input' &&
    item.props.name === 'subscriptionId');
  assert.equal(hidden?.props.value, 'sub-1');
  const select = elements(editForm).find(item => item.type === 'select');
  assert.ok(select, 'billing option select missing');
  const options = elements(select).filter(item => item.type === 'option');
  assert.deepEqual(options.map(option => option.props.value), ['o-1', 'o-2'],
    'the row\'s plan\'s active options are the choices');
  assert.equal(select.props.defaultValue, 'o-1', 'the current option is preselected');
  const date = elements(editForm).find(item => item.type === 'input' &&
    item.props.name === 'effectiveAt');
  assert.equal(date?.props.type, 'date', 'the effective date input matches the wizard\'s');
  assert.match(textOf(tree), /supersedes/i, 'the supersede semantics are stated');
  // Cancel affordance.
  assert.ok(elementsOf(tree).buttons.find(item => textOf(item) === 'Cancel'));
});

test('a plan without active options offers no Edit (nothing to switch to)', () => {
  const tree = renderView({ expandedId: 'sub-2', rows: [row(), { ...row(), id: 'sub-2',
    planOptions: [] }] });
  assert.equal(elementsOf(tree).buttons.find(item => textOf(item) === 'Edit'), undefined);
  const expanded = textOf(tree);
  assert.match(expanded, /no active billing options/i);
});

test('tier-derived rows render the gold-dashed Legacy — derived badge, expandable, with only Convert', () => {
  // Collapsed: the badge and the expand toggle; NO stored-row actions.
  const collapsed = renderView({ rows: [tierRow()] });
  const collapsedText = textOf(collapsed);
  assert.match(collapsedText, /Free Fiona/);
  assert.match(collapsedText, /Free – Legacy/);
  assert.match(collapsedText, /Legacy — derived/);
  const rows = elementsOf(collapsed).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].props['data-legacy-derived'], 'true', 'the virtual row is marked');
  // Task 13: virtual rows expand — the toggle is the ONLY button collapsed.
  const toggles = elementsOf(collapsed).buttons.filter(item =>
    item.props['aria-expanded'] !== undefined);
  assert.deepEqual(toggles.map(item => item.props['aria-expanded']), [false]);
  assert.equal(elementsOf(collapsed).links.find(link => textOf(link) === 'Reassign'), undefined);
  assert.equal(elementsOf(collapsed).forms.find(form => form.props.action === 'end-action'), undefined);
  assert.equal(elementsOf(collapsed).forms.find(form => form.props.action === 'edit-action'), undefined);
  // The badge is gold-dashed via theme tokens.
  const badge = elements(collapsed).find(item => item.type === 'span' &&
    String(item.props.className ?? '').includes('border-[var(--gold)]'));
  assert.ok(badge, 'the badge grounds on the gold token');
  assert.match(String(badge!.props.className), /border-dashed/);
  // No dates line for a derived row (epoch sentinel never renders).
  assert.doesNotMatch(collapsedText, /since 1970/);

  // Expanded: a VIEW-ONLY detail card (keeper, tier, mapped legacy plan — no
  // dates) with exactly ONE action — Convert to real subscription (the audited
  // wizard, keeper preselected via the Reassign deep-link seeding).
  const tree = renderView({ rows: [tierRow()], expandedId: 'tier:u-9' });
  const rendered = textOf(tree);
  assert.match(rendered, /Free Fiona/);
  assert.match(rendered, /fiona@example\.com/);
  assert.match(rendered, /Free/);
  assert.match(rendered, /Free – Legacy/);
  assert.doesNotMatch(rendered, /since 1970/, 'no dates on a derived detail card');
  assert.equal(elementsOf(tree).forms.find(form => form.props.action === 'end-action'), undefined,
    'no End on a virtual row');
  assert.equal(elementsOf(tree).forms.find(form => form.props.action === 'edit-action'), undefined,
    'no Edit on a virtual row');
  assert.equal(elementsOf(tree).links.find(link => textOf(link) === 'Reassign'), undefined,
    'no Reassign on a virtual row');
  const convert = elementsOf(tree).links.find(link =>
    textOf(link) === 'Convert to real subscription');
  assert.ok(convert, 'Convert is the virtual row\'s single action');
  assert.equal(convert?.props.href, '/admin/subscriptions?wizard=open&step=2&user=u-9');
});

test('the virtual row\'s Convert deep link carries the list search and page along', () => {
  const tree = renderView({ rows: [tierRow()], expandedId: 'tier:u-9',
    search: 'legacy', page: 2 });
  const convert = elementsOf(tree).links.find(link =>
    textOf(link) === 'Convert to real subscription');
  assert.equal(convert?.props.href,
    '/admin/subscriptions?search=legacy&page=2&wizard=open&step=2&user=u-9');
});

test('the toolbar pairs the search input with a truthful effective-count chip', () => {
  const tree = render();
  const chip = elements(tree).find(item => item.props['data-testid'] === 'effective-count');
  assert.ok(chip, 'effective count chip missing');
  assert.equal(textOf(chip), '2 effective', 'idle: the committed total');
  // While narrowed matches are in, the chip is the live match count.
  Object.assign(narrowingState, { narrowed: true, active: true, query: 'ada', total: 41 });
  const liveChip = elements(SubscriptionsList({ ...base,
    wizardParams: {} })).find(item => item.props['data-testid'] === 'effective-count');
  assert.equal(textOf(liveChip!), '41 effective', 'narrowing: the live match count');
});

test('S13d: the search input hides when the list holds less than a page; the chip and a committed search\'s Clear stay', () => {
  const tree = render();
  elements(tree); // resolve the stubs — the live-search stub records on render
  assert.equal(lastInput, null, 'no search input below one page of rows');
  assert.ok(elements(tree).find(item => item.props['data-testid'] === 'effective-count'),
    'the effective-count chip stays');
  // Hiding only stops rendering: a committed URL search keeps its Clear
  // affordance (the search itself is never cleared by the rule).
  const searched = render({ search: 'ada' });
  elements(searched);
  assert.equal(lastInput, null);
  assert.ok(elements(searched).some(item => item.type === 'a' && textOf(item) === 'Clear'),
    'the committed search keeps its Clear affordance');
});

test('typing narrows the rendered list in place: matches replace the committed rows', () => {
  Object.assign(narrowingState, { narrowed: true, active: true, query: 'ada',
    rows: [{ id: 'sub-9', title: 'Ada N.', subtitle: 'Pro · MONTHLY' }], total: 41, page: 1 });
  const tree = SubscriptionsList({ ...base, wizardParams: {} }) as unknown;
  const rows = elementsOf(tree).rows.map(item => item.props['data-subscription-row']);
  assert.deepEqual(rows, ['sub-9'], 'matched rows span all rows, not the committed page');
  const pager = elements(tree).find(item => item.props['data-narrow-pager']);
  assert.ok(pager, 'matches are paged');
  assert.equal(pager.props['data-total'], 41);
  // Narrowed rows are display-only; the explicit Enter fallback restores the
  // full actioned view.
  const narrowSection = elements(tree).find(item => item.props['data-testid'] === 'narrowed-subscriptions');
  assert.ok(narrowSection, 'narrowed preview section missing');
});

test('an empty narrowed set echoes the query; clearing restores the committed view', () => {
  Object.assign(narrowingState, { narrowed: true, active: true, query: 'zzz',
    rows: [], total: 0 });
  const echo = textOf(SubscriptionsList({ ...base, wizardParams: {} }));
  assert.match(echo, /Nothing matches “\s*zzz\s*”\./);
  const committed = textOf(render());
  assert.match(committed, /Marta Keeper/, 'the committed view returns');
});

test('Enter is the explicit fallback: a soft push of the URL-param search', () => {
  // S13d: pinned on an above-page list (a smaller list hides the input).
  const tree = render({ total: 45 });
  elements(tree); // resolve the stubs
  assert.ok(lastInput, 'search input missing');
  (lastInput!.onEnter as (text: string) => void)('nova');
  assert.deepEqual(pushed, ['/admin/subscriptions?search=nova']);
});

test('rows are freestanding elements and badges are theme-token driven', () => {
  const tree = renderView();
  const rows = elements(tree).filter(item => item.props['data-subscription-row']);
  assert.equal(rows.length, 2);
  for (const rowEl of rows) {
    const cls = String(rowEl.props.className);
    assert.equal(cls.split(' ').includes('card'), false, 'rows are freestanding, not card-enclosed');
  }
  const source = readFileSync(new URL('./subscriptions-list.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:emerald|sky|amber|teal|indigo)-\d00/,
    'status badges must come from theme tokens');
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex colors either');
});
