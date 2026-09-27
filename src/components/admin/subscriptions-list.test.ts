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
  '@/app/admin/subscriptions/actions': { endSubscriptionAction: 'end-action' },
};

/** The canned narrowing state; tests flip `narrowed` and swap rows/total. */
const narrowingState: Record<string, unknown> = {
  text: '', query: '', active: false, narrowed: false, rows: [], total: 0,
  page: 1, loading: false,
  onType: (_text: string) => {}, onPageChange: (_page: number) => {}, onEscape: () => {},
};

const listModule = loadModule('./subscriptions-list.tsx', deps);
const SubscriptionsList = listModule.SubscriptionsList as (props: Record<string, unknown>) => unknown;

type ListRow = { id: string; userId: string; planId: string; planBillingOptionId: string;
  status: string; startedAt: string; renewsAt: string | null; expiresAt: string | null;
  userName: string | null; userEmail: string | null; planName: string | null;
  optionInterval: string | null; optionPriceCents: number | null };

const row = (overrides: Partial<ListRow> = {}): ListRow => ({
  id: 'sub-1', userId: 'u-1', planId: 'p-1', planBillingOptionId: 'o-1', status: 'ACTIVE',
  startedAt: '2026-08-01T00:00:00.000Z', renewsAt: '2026-09-01T00:00:00.000Z', expiresAt: null,
  userName: 'Marta Keeper', userEmail: 'marta@example.com', planName: 'Pro',
  optionInterval: 'MONTHLY', optionPriceCents: 499, ...overrides });

const base = {
  rows: [row(), { ...row(), id: 'sub-2', status: 'PAST_DUE', userName: 'Dan O.',
    userEmail: 'dan@example.com', planName: 'Basic', optionInterval: 'ANNUAL',
    optionPriceCents: 1999, startedAt: '2026-07-30T00:00:00.000Z', renewsAt: null,
    expiresAt: '2026-09-28T00:00:00.000Z' }],
  total: 2, search: '', page: 1, pageSize: 20, lastPage: 1,
  wizardParams: {} as Record<string, string>,
};

const render = (overrides: Partial<typeof base> = {}) => {
  lastInput = null;
  Object.assign(narrowingState, { text: '', query: '', active: false, narrowed: false,
    rows: [], total: 0, page: 1, loading: false });
  return SubscriptionsList({ ...base, ...overrides }) as unknown;
};

function elementsOf(tree: unknown) {
  const all = elements(tree);
  return {
    rows: all.filter(item => item.props['data-subscription-row']),
    links: all.filter(item => item.type === 'a'),
    forms: all.filter(item => item.type === 'form'),
  };
}

test('the committed view renders full rows: keeper, plan, badge, dates, Reassign, and End', () => {
  const tree = render();
  const rendered = textOf(tree);
  assert.match(rendered, /Marta Keeper/);
  assert.match(rendered, /marta@example\.com/);
  assert.match(rendered, /Pro · Monthly — \$4\.99/);
  assert.match(rendered, /Basic · Annual — \$19\.99/);
  assert.match(rendered, /Active/);
  assert.match(rendered, /Past due/);
  assert.match(rendered, /since 2026-08-01 · renews 2026-09-01/);
  assert.match(rendered, /since 2026-07-30 · ends 2026-09-28/);
  const reassign = elementsOf(tree).links.find(link => textOf(link) === 'Reassign');
  assert.equal(reassign?.props.href, '/admin/subscriptions?wizard=open&step=2&user=u-1');
  const endForm = elementsOf(tree).forms.find(form => form.props.action === 'end-action');
  assert.ok(endForm, 'end mutation form missing');
  const hidden = elements(endForm).find(item => item.type === 'input' &&
    item.props.name === 'subscriptionId');
  assert.equal(hidden?.props.value, 'sub-1');
  assert.match(textOf(tree), /End/);
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

test('rows are freestanding hover-tinted elements and badges are theme-token driven', () => {
  const tree = render();
  const rows = elements(tree).filter(item => item.props['data-subscription-row']);
  assert.equal(rows.length, 2);
  for (const rowEl of rows) {
    const cls = String(rowEl.props.className);
    assert.equal(cls.split(' ').includes('card'), false, 'rows are freestanding, not card-enclosed');
    assert.equal(cls.includes('hover:bg-[var(--hover)]'), true, 'mockup hover tint');
  }
  const source = readFileSync(new URL('./subscriptions-list.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:emerald|sky|amber|teal|indigo)-\d00/,
    'status badges must come from theme tokens');
});
