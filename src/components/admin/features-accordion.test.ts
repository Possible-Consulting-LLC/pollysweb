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
    FeaturesAccordion: (props: Record<string, unknown>) => unknown;
    accordionReducer: (state: AccordionState, action: AccordionAction) => AccordionState;
    narrowedFeatureView: (row: Record<string, unknown>) => Record<string, unknown>;
    selectableSelectionItems: (rows: Array<{ id: string; title: string; subtitle: string }>) =>
      Array<{ key: string; title: string; subtitle: string }>;
    narrowingWithRefresh: (narrowing: Record<string, unknown>,
      refresh: Record<string, unknown> | null) => Record<string, unknown>;
  };
}

type AccordionState = { selection: Map<string, { title: string; subtitle: string }>; trayCollapsed: boolean };
type AccordionAction =
  | { type: 'toggle'; key: string; title: string; subtitle: string }
  | { type: 'merge'; items: Array<{ key: string; title: string; subtitle: string }> }
  | { type: 'clearSelection' }
  | { type: 'toggleTrayCollapsed' };

let pushed: string[] = [];
let lastLiveSearch: Record<string, unknown> | null = null;
let lastNarrowSource: unknown = null;
/** S13c: capture the ids-endpoint fetches (click-only) and serve a fixture. */
let idFetches: Array<{ entity: string; query: string }> = [];
let selectableFixture: Array<{ id: string; title: string; subtitle: string }> = [];

/** The canned narrowing state the view receives; tests flip `narrowed` and
 * swap `rows`/`total` to exercise the live replacement paths. */
const narrowingState: Record<string, unknown> = {
  text: '', query: '', active: false, narrowed: false, rows: [], total: 0,
  page: 1, loading: false,
  onType: (_text: string) => {}, onPageChange: (_page: number) => {}, onEscape: () => {},
};

const deps: Record<string, unknown> = {
  react: {
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useReducer: (reducer: unknown, initial: unknown) => [initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  },
  'next/navigation': { useRouter: () => ({ push: (href: string) => { pushed.push(href); } }) },
  '@/components/admin/live-search': {
    narrowViaEndpoint: (entity: string, pageSize: number) => {
      lastLiveSearch = null;
      lastNarrowSource = `endpoint:${entity}:${pageSize}`;
      return lastNarrowSource;
    },
    fetchSelectableRows: (entity: string, query: string) => {
      idFetches.push({ entity, query });
      return Promise.resolve(selectableFixture.map(row => ({ ...row })));
    },
    useNarrowing: () => narrowingState,
    LiveSearchInput: (props: Record<string, unknown>) => {
      lastLiveSearch = props;
      return jsx.jsx('input', { 'data-live-search-input': props.id, value: props.value });
    },
    NarrowPager: (props: Record<string, unknown>) => jsx.jsx('nav',
      { 'data-narrow-pager': true, 'data-page': props.page, 'data-total': props.total }),
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
  // The narrowed view derives the orphan flag from the code registry at render
  // time; the stub mirrors the fixtures: feature.key-* registered, anything
  // else (e.g. legacy.bulk_import) orphaned.
  '@/lib/features/registry': {
    isRegisteredFeatureKey: (key: string) => key.startsWith('feature.key-'),
  },
};

const { FeaturesAccordionView, FeaturesAccordion, accordionReducer,
  narrowedFeatureView, narrowingWithRefresh, selectableSelectionItems } = loadFeaturesAccordion();

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

const base = { features: features(3), total: 34, search: '', page: 1, pageSize: 20,
  openKey: '',
  selectedItems: [] as Array<{ id: string; title: string; subtitle?: string }>,
  onToggleSelected: (_key: string) => {},
  onPick: (_item: { id: string; title: string; subtitle?: string }) => {},
  trayCollapsed: false, onToggleTrayCollapsed: () => {},
  onSelectAll: undefined as (() => void) | undefined,
  onSelectNone: undefined as (() => void) | undefined,
  onSearchSubmit: (_search: string) => {},
  narrowedOpenId: '', onNarrowedOpenToggle: (_key: string) => {},
  editingKey: '', onStartEdit: (_key: string) => {}, onCancelEdit: () => {},
  onSaveEdit: 'save-feature-metadata-edit' as unknown as
    (form: FormData) => Promise<{ error?: string }>,
  narrowing: narrowingState as Record<string, unknown> };

const render = (overrides: Partial<typeof base> = {}) => {
  lastLiveSearch = null;
  const tree = FeaturesAccordionView({ ...base, ...overrides });
  elements(tree); // resolve the live-search stub for prop assertions
  return tree;
};

/** A live narrowing state for the view: matches for the typed text are in. */
const liveNarrowing = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ ...narrowingState, narrowed: true, active: true, query: 'feed', ...over });

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

test('the counter is always visible, always in the mockup format, and truthful during narrowing', () => {
  const none = textOf(render());
  assert.equal(none.includes('0 of 34 selected'), true);
  const some = render({ selectedItems: [
    { id: 'feature.key-1', title: 'Feature 1', subtitle: 'feature.key-1' },
    { id: 'feature.key-9', title: 'Old import', subtitle: 'legacy.bulk_import' }] });
  const body = textOf(some);
  assert.equal(body.includes('2 of 34 selected'), true);
  assert.equal(body.includes('matching the search'), false,
    'the counter never morphs into a match-count text');
  assert.equal(body.includes('× Old import'), true);
  // Chips carry the key so identically named rows stay distinguishable.
  assert.equal(elements(some).some(item => item.props['data-remove'] === 'feature.key-9'), true);
  // While narrowed matches are in, the denominator is the live match total.
  const live = textOf(render({ selectedItems: [
    { id: 'feature.key-1', title: 'Feature 1', subtitle: 'feature.key-1' }],
    narrowing: liveNarrowing({ total: 7 }) }));
  assert.equal(live.includes('1 of 7 selected'), true,
    'the counter reflects the narrowed set while typing');
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
  assert.equal(body.includes('feature.key-1'), true);
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
  // Per-feature actions: the release toggle is present in the expanded detail;
  // the metadata editor is BEHIND the Edit affordance (S13b).
  const release = elements(tree).filter(item => item.type === 'form' &&
    item.props.action === 'set-feature-release');
  assert.equal(release.length, 1);
  assert.deepEqual(elements(release[0]).filter(item => item.type === 'input')
    .map(item => ({ name: item.props.name, value: item.props.value })),
    [{ name: 'key', value: 'feature.key-1' }, { name: 'active', value: 'false' }]);
  assert.equal(elements(tree).some(item => item.type === 'form' &&
    item.props.action === 'save-feature-metadata-edit'), false,
    'the metadata editor stays behind the Edit affordance in the read-only view');
  assert.equal(elements(tree).some(item => item.type === 'input' && item.props.name === 'name'),
    false, 'no always-visible metadata fields anymore');
});

test('S13b: Edit metadata turns the feature card into the in-place editor — key never editable', () => {
  const started: string[] = [];
  const cancelled: boolean[] = [];
  const tree = render({ openKey: 'feature.key-1',
    onStartEdit: (key: string) => { started.push(key); },
    editingKey: 'feature.key-1', onCancelEdit: () => { cancelled.push(true); } });
  // Read-only: the Edit affordance starts the editor.
  const readTree = render({ openKey: 'feature.key-1',
    onStartEdit: (key: string) => { started.push(key); } });
  const edit = elementsOf(readTree).buttons.find(button => text(button) === 'Edit metadata');
  assert.ok(edit, 'Edit metadata affordance missing from the detail card');
  assert.equal(edit!.props['data-variant'], 'soft', 'mockup drow: soft sm');
  assert.equal(edit!.props['data-size'], 'sm');
  (edit!.props.onClick as () => void)();
  assert.deepEqual(started, ['feature.key-1']);
  // Editor mode: the fields replace the read-only card.
  const body = textOf(tree);
  assert.equal(body.includes('Edit metadata'), true, 'the editor card is titled Edit metadata');
  assert.equal(body.includes('Release state'), false, 'the read-only kv card is replaced');
  const form = elements(tree).find(item => item.type === 'form' &&
    item.props.action === 'save-feature-metadata-edit');
  assert.ok(form, 'the editor submits through the wrapped metadata action');
  const keyInput = elements(form!).find(item => item.type === 'input' && item.props.name === 'key');
  assert.equal(keyInput!.props.type, 'hidden', 'the stable key is submitted, never edited');
  assert.equal(keyInput!.props.value, 'feature.key-1');
  const editable = elements(form!).filter(item =>
    (item.type === 'input' && item.props.type !== 'hidden') ||
    item.type === 'textarea').map(item => item.props.name);
  assert.deepEqual(editable.sort(), ['category', 'description', 'name'],
    'name/category/description are the only editable fields');
  assert.equal(elements(form!).some(item => item.type === 'input' &&
    item.props.name === 'name' && item.props.defaultValue === 'Feature 1'), true,
    'fields are prefilled');
  const cancel = elementsOf(tree).buttons.find(button => text(button) === 'Cancel');
  assert.ok(cancel, 'Cancel affordance missing');
  (cancel!.props.onClick as () => void)();
  assert.deepEqual(cancelled, [true]);
  const save = elementsOf(tree).buttons.find(button => text(button) === 'Save metadata');
  assert.ok(save, 'Save affordance missing');
  assert.equal(save!.props['data-variant'], 'primary');
  assert.match(textOf(tree), /The stable key \( feature\.key-1 \) cannot be renamed/,
    'the mockup rule text accompanies the editor');
});

test('orphaned feature detail is greyed, explained, and inert (including the edit affordance)', () => {
  const started: string[] = [];
  const tree = render({ features: [...features(2), orphanRow], openKey: 'legacy.bulk_import',
    onStartEdit: (key: string) => { started.push(key); } });
  const fieldsets = elements(tree).filter(item => item.type === 'fieldset');
  assert.equal(fieldsets.length, 1);
  assert.equal(fieldsets[0].props.disabled, true);
  const body = textOf(tree);
  assert.equal(body.includes('no longer in the code registry'), true);
  // Inert release form still targets the row's current state but sits in the disabled fieldset.
  const release = elements(fieldsets[0]).filter(item => item.type === 'form' &&
    item.props.action === 'set-feature-release');
  assert.equal(release.length, 1);
  // The edit affordance renders inside the same disabled fieldset: an orphaned
  // feature can never enter in-place editing.
  const edit = elements(fieldsets[0]).find(item => item.type === 'button' &&
    text(item) === 'Edit metadata');
  assert.ok(edit, 'the inert Edit affordance is rendered for orphans');
  // The inertness guarantee is structural, exactly like the release form's:
  // the affordance lives inside the disabled fieldset, so no unlocked edit
  // path exists for an orphan (the harness cannot simulate fieldset blocking).
  assert.deepEqual(started, [], 'no edit start fired outside the locked path');
  assert.equal(elements(tree).some(item => item.type === 'form' &&
    item.props.action === 'save-feature-metadata-edit'), false,
    'no editor renders for an orphan');
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

// --- Task 8 fix round 1: headless narrowing (no dropdown anywhere) ---

function readSource(): string {
  return readFileSync(new URL('./features-accordion.tsx', import.meta.url), 'utf8');
}

test('the toolbar hosts the mockup search input wired to the features narrowing endpoint', () => {
  render({ selectedItems: [
    { id: 'feature.key-1', title: 'Feature 1', subtitle: 'feature.key-1' }] });
  assert.ok(lastLiveSearch, 'search input missing from the toolbar');
  assert.equal(lastLiveSearch!.id, 'features-search');
  assert.equal(lastLiveSearch!.value, '', 'the input shows the live narrowing text');
  assert.equal(lastLiveSearch!.onEnter !== undefined, true,
    'Enter is the explicit full-page fallback');
  assert.equal(lastLiveSearch!.placeholder, 'Search features…');
  // The shell wires the narrowing source (pinned in the shell test below).
  // No suggestion dropdown machinery exists by construction.
  assert.doesNotMatch(readSource(), /mode="popup"|role="combobox"|renderSuggestions/);
});

test('S13d: the search input hides when the catalog holds less than a page; counter and select pair stay', () => {
  render({ total: 5 });
  assert.equal(lastLiveSearch, null, 'no search input below one page of features');
  const tree = render({ total: 5, onSelectAll: () => {}, onSelectNone: () => {} });
  assert.ok(elements(tree).some((item) => item.props['data-testid'] === 'selected-count'),
    'the counter stays');
  assert.equal(elements(tree).some((item) => item.props['data-testid'] === 'select-all'), true,
    'the S13c pair stays visible');
});

test('the shell wires the narrowing search to the features endpoint at the page size', () => {
  lastNarrowSource = null;
  const tree = FeaturesAccordion({ features: features(2), total: 34, search: '', page: 1,
    pageSize: 20, openKey: '' });
  elements(tree);
  assert.equal(lastNarrowSource, 'endpoint:features:20');
});

test('typing narrows the rendered list in place: matches replace the committed page with a pager', () => {
  const tree = render({ narrowing: liveNarrowing({
    rows: [narrowedFeatureRow(),
      narrowedFeatureRow({ id: 'feature.key-3', title: 'Feature 3', subtitle: 'feature.key-3',
        featureId: 'feature-3', key: 'feature.key-3', name: 'Feature 3',
        description: 'Desc 3', category: 'spoods' })],
    total: 41, page: 2 }) });
  const narrowed = elements(tree).find(item => item.props['data-testid'] === 'narrowed-features');
  assert.ok(narrowed, 'narrowed list missing');
  const rows = elements(narrowed).filter(item => item.props['data-row-id']);
  assert.deepEqual(rows.map(row => row.props['data-row-id']), ['feature.key-2', 'feature.key-3'],
    'matched rows (all rows, not the committed page) render in place');
  assert.equal(elements(tree).filter(item => item.props['data-group-header']).length, 0,
    'the committed grouped view is replaced');
  const pager = elements(tree).find(item => item.props['data-narrow-pager']);
  assert.ok(pager, 'matches are paged');
  assert.equal(pager.props['data-total'], 41);
});

test('a narrowed pick forwards the full suggestion {id, title, subtitle} — never a bare key', () => {
  const picked: Array<Record<string, unknown>> = [];
  const tree = render({ onPick: (item: Record<string, unknown>) => { picked.push(item); },
    narrowing: liveNarrowing({ rows: [narrowedFeatureRow()], total: 1, page: 1 }) });
  const box = elements(tree).find(item => item.type === 'input' &&
    item.props['aria-label'] === 'Select Feature 2');
  assert.ok(box, 'narrowed row checkbox missing');
  (box.props.onChange as () => void)();
  assert.deepEqual(plain(picked), [{ id: 'feature.key-2', title: 'Feature 2',
    subtitle: 'feature.key-2' }]);
});

test('an empty narrowed set echoes the query; clearing restores the committed view', () => {
  const empty = textOf(render({ narrowing: liveNarrowing({ rows: [], total: 0 }) }));
  assert.match(empty, /Nothing matches “\s*feed\s*”\./);
  const committed = textOf(render());
  assert.match(committed, /Feature 1/, 'the committed page returns');
});

test('the fallback submit navigates the full-page URL search', () => {
  pushed = [];
  const tree = FeaturesAccordion({ features: features(2), total: 34, search: '', page: 1,
    pageSize: 20, openKey: '' });
  elements(tree);
  assert.ok(lastLiveSearch, 'view not resolved through the shell');
  (lastLiveSearch!.onEnter as (text: string) => void)('feed');
  assert.deepEqual(pushed, ['/admin/features?search=feed&page=1']);
});

test('the counter chip is gold and always in the toolbar (unified selected-count testid)', () => {
  const none = render();
  const chip = elements(none).find((item) => item.props['data-testid'] === 'selected-count');
  assert.ok(chip, 'counter chip missing');
  assert.equal(String(chip.props.className).includes('bg-[var(--gold)]'), true);
  assert.equal(textOf(chip).includes('0 of 34 selected'), true);
});

test('feature rows are freestanding hover rows with the mono key subtitle — no card enclosure', () => {
  const tree = render({ features: features(2) });
  const rows = elements(tree).filter((item) => item.props['data-row-id']);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const cls = String(row.props.className);
    assert.equal(cls.split(' ').includes('card'), false, 'no cardClassName on the row container');
  }
  // The key rides the row as its subtitle (mockup's mono .s line) — the row
  // body carries it, so the old key badge is gone from the badges cluster.
  assert.equal(textOf(rows[0]).includes('feature.key-1'), true);
});

test('badges are theme-token driven — no hardcoded palette literals', () => {
  assert.doesNotMatch(readSource(), /(?:emerald|sky|amber|teal|indigo)-\d00/);
});

test('the expanded detail is a single mockup card: soft-bordered, one labeled kv grid', () => {
  const tree = render({ openKey: 'feature.key-1' });
  const cards = elements(tree).filter((item) => item.props['data-detail-card']);
  assert.equal(cards.length, 1, 'one Detail card, not three titled cards');
  assert.equal(textOf(cards[0]).includes('Detail'), true, 'the card is titled Detail');
  const cls = String(cards[0].props.className);
  assert.equal(cls.split(' ').includes('card'), false);
  assert.equal(cls.includes('border-[var(--hover)]'), true);
  assert.equal(cls.includes('bg-[var(--background)]'), true);
  const grids = elements(tree).filter((item) => item.type === 'dl' && item.props['data-kv-grid']);
  assert.equal(grids.length, 1);
  const labels = elements(grids[0]).filter((item) => item.type === 'dt').map((dt) => textOf(dt));
  assert.deepEqual(labels, ['Key', 'Description', 'Category', 'Release state', 'Plan assignments', 'Plans'],
    'all information rows survive the consolidation into the single card');
  assert.equal(textOf(grids[0]).includes('Released (available to plans)'), true,
    'the release-state row speaks the mockup wording');
  assert.equal(textOf(tree).includes('2 of 3 plans'), true);
  assert.equal(textOf(tree).includes('Free, Basic'), true);
});

// --- Fix round 2: F1 category badge, F2 wording + orphan key-line suffix ---

test('every committed row carries the mockup category badge (tinted pill)', () => {
  const tree = render({ features: features(3) });
  const rows = elements(tree).filter((item) => item.props['data-row-id']);
  assert.equal(rows.length, 3);
  const expected = ['Care', 'Care', 'Spoods'];
  rows.forEach((row, index) => {
    const badge = elements(row).find((item) => item.type === 'span' &&
      String(item.props.className).includes('bg-[var(--lavender)]'));
    assert.ok(badge, `category badge missing on row ${row.props['data-row-id']}`);
    assert.equal(textOf(badge), expected[index]);
  });
});

test('unreleased rows say Coming soon; orphan rows mark the key line, not a badge', () => {
  const tree = render({ features: [...features(2), orphanRow] });
  const body = textOf(tree);
  assert.equal(body.includes('Coming soon'), true, 'mockup wording for unreleased rows');
  assert.equal(body.includes('Not released'), false);
  const orphan = elements(tree).find((item) => item.props['data-row-id'] === 'legacy.bulk_import');
  assert.ok(orphan, 'orphan row missing');
  assert.equal(textOf(orphan).includes('legacy.bulk_import — orphaned'), true,
    'the orphan marker rides the key line as a suffix (key — orphaned)');
  assert.equal(elements(orphan).some((item) => item.type === 'span' &&
    textOf(item) === 'Orphaned'), false, 'no separate Orphaned badge');
});

test('the committed footer carries the mockup note: Grouped by category · sorted by key', () => {
  const tree = render({ features: features(2) });
  const nav = elements(tree).find((item) => item.type === 'nav' &&
    item.props['aria-label'] === 'Features pagination');
  assert.ok(nav, 'committed pager nav missing');
  assert.equal(textOf(nav).includes('Grouped by category · sorted by key'), true);
});

// --- Fix round 1b: the orphan lock holds in the narrowed features view ---

/** Rich narrowed feature rows (S13): the committed FeatureRowView shape the
 * narrowing endpoint serves, carried on the suggestion row (id IS the key). */
const narrowedFeatureRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'feature.key-2', title: 'Feature 2', subtitle: 'feature.key-2',
  featureId: 'feature-2', key: 'feature.key-2', name: 'Feature 2',
  description: 'Desc 2', category: 'care', active: true, orphan: false,
  assignedPlans: ['Free'], totalPlans: 3, ...over });

const narrowedRows = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  liveNarrowing({ rows: [
    narrowedFeatureRow({ id: 'legacy.bulk_import', title: 'Old import',
      subtitle: 'legacy.bulk_import', featureId: 'feature-9', key: 'legacy.bulk_import',
      name: 'Old import', description: 'Legacy description', category: 'legacy',
      active: true, orphan: true, assignedPlans: [] }),
    narrowedFeatureRow(),
  ], total: 2, ...over });

test('a narrowed orphan row renders greyed, inert, and marked — picking it is a no-op', () => {
  const picked: Array<Record<string, unknown>> = [];
  const tree = render({ onPick: (item: Record<string, unknown>) => { picked.push(item); },
    narrowing: narrowedRows() });
  const narrowed = elements(tree).find(item => item.props['data-testid'] === 'narrowed-features');
  assert.ok(narrowed, 'narrowed list missing');
  const rows = elements(narrowed).filter(item => item.props['data-row-id']);
  assert.deepEqual(rows.map(row => row.props['data-row-id']),
    ['legacy.bulk_import', 'feature.key-2'],
    'the orphan stays VISIBLE in the narrowed list (mockup-exact), never filtered out');
  assert.equal(String(rows[0].props.className).includes('opacity-70'), true,
    'the orphan row is greyed like a committed orphan row');
  assert.equal(String(rows[1].props.className).includes('opacity-70'), false);
  const boxes = elements(narrowed).filter(item => item.type === 'input' &&
    item.props.type === 'checkbox');
  assert.equal(boxes[0].props.disabled, true, 'the orphan checkbox is disabled');
  (boxes[0].props.onChange as () => void)();
  assert.deepEqual(picked, [],
    'even a forced pick on an orphaned narrowed row never reaches the selection map');
  assert.ok(!boxes[1].props.disabled, 'registered rows stay selectable');
  (boxes[1].props.onChange as () => void)();
  assert.deepEqual(plain(picked), [{ id: 'feature.key-2', title: 'Feature 2',
    subtitle: 'feature.key-2' }]);
  assert.equal(textOf(narrowed).includes('legacy.bulk_import — orphaned'), true,
    'the orphan marker is a key-line suffix in the narrowed view too (round 1b badge replaced)');
  assert.equal(elements(narrowed).some((item) => item.type === 'span' &&
    textOf(item) === 'Orphaned'), false, 'no separate Orphaned badge in the narrowed view');
});

test('an orphaned narrowed pick never appears in the bulk Release/Unrelease form inputs', () => {
  const picked: Array<Record<string, unknown>> = [];
  const tree = render({ onPick: (item: Record<string, unknown>) => { picked.push(item); },
    selectedItems: [{ id: 'feature.key-1', title: 'Feature 1', subtitle: 'feature.key-1' }],
    narrowing: narrowedRows() });
  const narrowed = elements(tree).find(item => item.props['data-testid'] === 'narrowed-features');
  const orphanBox = elements(narrowed).find(item => item.type === 'input' &&
    item.props.type === 'checkbox' && item.props['aria-label'] === 'Select Old import');
  assert.equal(orphanBox?.props.disabled, true);
  assert.ok(orphanBox, 'orphan narrowed checkbox missing');
  (orphanBox.props.onChange as () => void)();
  const bulkForms = elementsOf(tree).forms.filter(form =>
    form.props.action === 'bulk-set-feature-release');
  for (const form of bulkForms) {
    const keys = elements(form).filter(item => item.type === 'input' && item.props.name === 'key')
      .map(item => String(item.props.value));
    assert.deepEqual(keys, ['feature.key-1'],
      'the bulk forms submit exactly the selection map — no orphan ever enters it');
  }
});

test('counter semantics agree across views: orphaned rows count in the total in both', () => {
  // Committed: the denominator is the server total prop, orphans included —
  // the committed view never filters orphans out of the count.
  const committed = textOf(render({ features: [...features(2), orphanRow], total: 34 }));
  assert.equal(committed.includes('0 of 34 selected'), true,
    'committed denominator includes orphan rows');
  // Narrowed: the denominator is the server match total, orphans included —
  // the narrowed view must not subtract the rows it greys out.
  const narrowed = textOf(render({ narrowing: narrowedRows() }));
  assert.equal(narrowed.includes('0 of 2 selected'), true,
    'narrowed denominator includes orphan rows (same semantics as the committed view)');
});

// --- Fix round 1b: the island is the single owner of the empty states ---

test('committed-empty and narrowed-empty each render exactly one message', () => {
  const committedEmpty = textOf(render({ features: [], search: '' }));
  assert.equal((committedEmpty.match(/No features in the database yet\./g) ?? []).length, 1,
    'exactly one committed empty message');
  const committedSearchEmpty = textOf(render({ features: [], search: 'molt' }));
  assert.equal((committedSearchEmpty.match(/Nothing matches/g) ?? []).length, 1,
    'exactly one committed search-empty message');
  const narrowedEmpty = textOf(render({ narrowing: liveNarrowing({ rows: [], total: 0 }) }));
  assert.equal((narrowedEmpty.match(/Nothing matches/g) ?? []).length, 1,
    'exactly one narrowed empty message');
});

// --- S13: narrowed rows are full citizens (rich rows, client-side expand) ---

test('S13: narrowed rows render through the committed row renderer — key line, badges, assignments', () => {
  const tree = render({ narrowing: narrowedRows() });
  const narrowed = elements(tree).find(item => item.props['data-testid'] === 'narrowed-features');
  const row = elements(narrowed).find(item => item.props['data-row-id'] === 'feature.key-2');
  const body = textOf(row);
  assert.equal(body.includes('Feature 2'), true);
  assert.equal(body.includes('feature.key-2'), true, 'the committed mono key line');
  assert.equal(body.includes('Care'), true, 'the committed category badge');
  assert.equal(body.includes('Released'), true, 'the committed release badge');
  // Same renderer, same hover anatomy (the tint rides the row's header strip).
  assert.equal(elements(row!).some(item =>
    String(item.props.className ?? '').includes('hover:bg-[var(--hover)]')), true);
});

test('S13: clicking a narrowed row expands it client-side — the URL stays on the committed search', () => {
  const toggledOpen: string[] = [];
  const tree = render({ onNarrowedOpenToggle: (key: string) => { toggledOpen.push(key); },
    narrowing: narrowedRows() });
  const row = elements(tree).find(item => item.props['data-row-id'] === 'feature.key-2');
  const expand = elements(row).find(item => item.type === 'button' &&
    item.props['aria-expanded'] !== undefined);
  assert.ok(expand, 'a narrowed row must expand via a client-side toggle');
  assert.equal(expand!.props['aria-expanded'], false);
  (expand!.props.onClick as () => void)();
  assert.deepEqual(toggledOpen, ['feature.key-2']);
  // No navigation anywhere in the narrowed view: no open= links at all.
  assert.equal(elements(tree).filter(item => item.type === 'a' &&
    String(item.props.href ?? '').includes('open=')).length, 0,
    'expanding a narrowed row never touches the URL');
});

test('S13: an expanded narrowed row renders the same Detail card as a committed row', () => {
  const tree = render({ narrowedOpenId: 'feature.key-2', narrowing: narrowedRows() });
  const body = textOf(tree);
  assert.equal((body.match(/Detail/g) ?? []).length, 1, 'the single committed Detail card');
  assert.equal(body.includes('Plan assignments'), true);
  assert.equal(body.includes('1 of 3 plans'), true, 'assignment counts ride the narrowed row');
  assert.equal(body.includes('Free'), true, 'assigned plan names render');
  assert.equal(body.includes('Released (available to plans)'), true,
    'the release-state row speaks the committed wording');
  assert.equal(body.includes('Edit metadata'), true, 'the detail is a full citizen — Edit included');
});

test('S13: a narrowed orphan expands to the same locked card — inert fieldset, no editor', () => {
  const tree = render({ narrowedOpenId: 'legacy.bulk_import', narrowing: narrowedRows() });
  const fieldsets = elements(tree).filter(item => item.type === 'fieldset');
  assert.equal(fieldsets.length, 1);
  assert.equal(fieldsets[0].props.disabled, true, 'the orphan lock holds in the narrowed detail');
  assert.equal(elements(tree).some(item => item.type === 'form' &&
    item.props.action === 'save-feature-metadata-edit'), false,
    'no editor renders for an orphaned narrowed row');
  assert.match(textOf(tree), /no longer in the code registry/,
    'the orphan explanation rides the narrowed detail too');
});

test('S13: an expanded narrowed row opens the same in-place metadata editor', () => {
  const tree = render({ narrowedOpenId: 'feature.key-2', editingKey: 'feature.key-2',
    narrowing: narrowedRows() });
  const form = elements(tree).find(item => item.type === 'form' &&
    item.props.action === 'save-feature-metadata-edit');
  assert.ok(form, 'the narrowed editor submits through the same wrapped action');
  const keyInput = elements(form!).find(item => item.type === 'input' && item.props.name === 'key');
  assert.equal(keyInput!.props.value, 'feature.key-2');
  assert.equal(elements(form!).some(item => item.type === 'input' &&
    item.props.name === 'name' && item.props.defaultValue === 'Feature 2'), true,
    'the editor prefills from the narrowed row');
});

test('S13: narrowedFeatureView maps the wire shape onto the committed FeatureRowView', () => {
  const view = narrowedFeatureView(narrowedFeatureRow({
    orphan: true, assignedPlans: ['Basic', 'Free'], totalPlans: 9 }) as Record<string, unknown>);
  assert.equal(view.id, 'feature-2', 'the mapped id is the database feature id');
  assert.equal(view.key, 'feature.key-2');
  assert.equal(view.name, 'Feature 2');
  assert.equal(view.description, 'Desc 2');
  assert.equal(view.category, 'care');
  assert.equal(view.active, true);
  // The orphan lock stays a RENDER-TIME registry check (3163399): the client's
  // own code decides, the service's flag is informational only.
  assert.equal(view.orphan, false, 'the render-time registry check wins');
  assert.deepEqual(view.assignedPlans, ['Basic', 'Free']);
  assert.equal(view.totalPlans, 9);
});

// --- S13 refresh mechanics: fresh narrowed rows after an in-place save ---

test('S13 refresh: a successful save overlays fresh narrowed rows only for the same query+page', () => {
  const narrowed = { ...narrowingState, narrowed: true, active: true, query: 'feed',
    rows: [narrowedFeatureRow()], total: 2, page: 1 };
  const fresh = { query: 'feed', page: 1,
    rows: [narrowedFeatureRow({ title: 'Renamed' })], total: 2 };
  const merged = narrowingWithRefresh(narrowed as Record<string, unknown>, fresh);
  assert.equal((merged.rows as Array<{ title: string }>)[0].title, 'Renamed',
    'the fresh rows replace the cached narrowed rows after a save');
  assert.equal(merged.total, 2);
  // Not narrowed (committed view): untouched — revalidatePath refreshes it.
  assert.equal(narrowingWithRefresh(narrowingState as Record<string, unknown>, fresh),
    narrowingState);
  // A different page or query (the user typed/paged since): the overlay is void.
  const pageTwo = { ...narrowed, page: 2 };
  assert.equal(narrowingWithRefresh(pageTwo as Record<string, unknown>, fresh), pageTwo,
    'stale-overlay guard: page moved on');
  const otherQuery = { ...narrowed, query: 'feedx' };
  assert.equal(narrowingWithRefresh(otherQuery as Record<string, unknown>, fresh), otherQuery,
    'stale-overlay guard: query moved on');
  assert.equal(narrowingWithRefresh(narrowed as Record<string, unknown>, null), narrowed,
    'no refresh yet → the narrowing state passes through');
});

// --- S13c: select all / select none -----------------------------------------

test('S13c: the toolbar hosts Select all / Select none between the search input and the gold counter', () => {
  const tree = render({ onSelectAll: () => {}, onSelectNone: () => {} });
  const toolbar = elements(tree).find(item => item.props['data-testid'] === 'features-toolbar');
  assert.ok(toolbar, 'features toolbar missing');
  const kids = (Array.isArray(toolbar!.props.children)
    ? toolbar!.props.children : [toolbar!.props.children]) as Element[];
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

test('S13c: Select all fetches the full matching id set from the features ids endpoint at the ACTIVE view', async () => {
  idFetches = []; selectableFixture = [];
  narrowingState.narrowed = false; narrowingState.query = '';
  const tree = FeaturesAccordion({ features: features(2), total: 34, search: 'molt',
    page: 1, pageSize: 20, openKey: '' });
  const all = elements(tree).find(item => item.type === 'button' && text(item) === 'Select all');
  assert.ok(all, 'the shell must wire Select all');
  await (all!.props.onClick as () => Promise<void>)();
  assert.deepEqual(idFetches, [{ entity: 'features', query: 'molt' }],
    'the committed search scopes Select all; one fetch on click, never per keystroke');
  // While narrowed, the ACTIVE view is the narrowed query.
  idFetches = [];
  narrowingState.narrowed = true; narrowingState.query = 'feed';
  const narrowedTree = FeaturesAccordion({ features: features(2), total: 34, search: 'molt',
    page: 1, pageSize: 20, openKey: '' });
  const allNarrowed = elements(narrowedTree)
    .find(item => item.type === 'button' && text(item) === 'Select all');
  await (allNarrowed!.props.onClick as () => Promise<void>)();
  assert.deepEqual(idFetches, [{ entity: 'features', query: 'feed' }],
    'Select all matches the narrowed view the counter is scoped to');
  narrowingState.narrowed = false; narrowingState.query = '';
});

test('S13c: selectableSelectionItems keeps only registry keys with display triples (render-time orphan check)', () => {
  const items = selectableSelectionItems([
    { id: 'feature.key-2', title: 'Feature 2', subtitle: 'feature.key-2' },
    { id: 'legacy.bulk_import', title: 'Old import', subtitle: 'legacy.bulk_import' },
  ]);
  assert.deepEqual(plain(items),
    [{ key: 'feature.key-2', title: 'Feature 2', subtitle: 'feature.key-2' }],
    'orphaned keys never join the selection — every chip carries its title');
});

test('S13c: state owner: merge adds every item with display data and never drops picks; clearSelection empties', () => {
  let state: AccordionState = { selection:
    new Map([['feature.key-1', { title: 'Feature 1', subtitle: 'feature.key-1' }]]),
    trayCollapsed: false };
  const frozen = new Map(state.selection);
  state = accordionReducer(state, { type: 'merge', items: [
    { key: 'feature.key-1', title: 'Feature 1 renamed', subtitle: 'feature.key-1' },
    { key: 'feature.key-2', title: 'Feature 2', subtitle: 'feature.key-2' }] });
  assert.equal(state.selection.size, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(state.selection.get('feature.key-2'))),
    { title: 'Feature 2', subtitle: 'feature.key-2' },
    'select-all flows through the same selection structures as manual picks');
  assert.deepEqual([...frozen.keys()], ['feature.key-1'], 'copy-on-write');
  state = accordionReducer(state, { type: 'clearSelection' });
  assert.equal(state.selection.size, 0, 'Select none empties the tray');
  assert.equal(state.trayCollapsed, false, 'only the selection clears');
});
