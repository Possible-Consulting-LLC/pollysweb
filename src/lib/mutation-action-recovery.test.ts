import * as maintenancePolicy from './admin/maintenance-policy';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as constants from './constants';
import * as session from './admin/test-session';
import * as failure from './mutation-failure';
import { mutationIdentity } from './mutation-context';

function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, console, FormData, ...globals, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports as T;
}
function actionFixture() {
  let helperCalls = 0;
  const boundary = load<typeof import('./mutation-boundary')>('./mutation-boundary.ts', {
    'server-only': {}, './admin/maintenance-policy':maintenancePolicy, './admin/maintenance-access':{guardMaintenance:async()=>{}}, './mutation-failure': failure, './mutation-context': { mutationIdentity }, './admin/test-session': session,
    './admin/test-session-store': {
      resolveRequestIdentity: async () => ({ actorId: 'actor', effectiveUserId: 'actor', testSessionId: null, contextVersion: 'b'.repeat(64) }),
      auditTestMutation: async () => {},
    },
  });
  const care = load<typeof import('../app/actions/care-events')>('../app/actions/care-events.ts', {
    '@/lib/maintenance-write':{}, '@/lib/admin/maintenance-policy':maintenancePolicy, '@/lib/mutation-boundary': boundary, '@/lib/care-celebrations': {}, zod: {}, '@/lib/history-mutations': {}, '@/lib/db': {}, '@/lib/care': {},
    '@/lib/spood-details': {}, '@/lib/interaction': {}, '@/lib/write-validation': {},
    '@/app/actions/care-shared': { getCareWriteUser: async () => { helperCalls++; assert.fail('stale context must not reach helpers'); } },
  });
  return { boundary, care, helperCalls: () => helperCalls };
}
type Element = { type: string; props: Record<string, unknown> & { children?: unknown } };
function elements(node: unknown): Element[] {
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as Element;
  return [item, ...(Array.isArray(item.props.children) ? item.props.children : [item.props.children]).flatMap(elements)];
}
function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object' || !('props' in node)) return '';
  const children = (node as Element).props.children;
  return (Array.isArray(children) ? children : [children]).map(textContent).join('');
}
function clientFixture() {
  const action = actionFixture();
  const states: unknown[] = [];
  let index = 0, refreshes = 0;
  const react = {
    useState: (initial: unknown) => { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value: unknown) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
    startTransition: (work: () => void) => work(),
  };
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': jsx, react,
    'next/navigation': { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    '@/components/mutation-context': { useMutationContext: () => 'a'.repeat(64), MutationContextInput: 'input' },
    '@/app/actions/care': { ...action.care, logEnclosureMaintenance: async () => ({ ok: true, message: 'Saved.' }) }, '@/components/ui/button': { Button: 'button' }, '@/components/ui/field': { Select: 'select', Field: 'label', Input: 'input', Textarea: 'textarea' },
    '@/lib/constants': constants, '@/components/constellation/celebrations': { celebrateCare: () => assert.fail('rejected work cannot celebrate') },
    '@/components/ui/datetime-field': { DateTimeField: 'input' }, '@/lib/utils': {}, '@/lib/upload-limits': {}, './prepared-photo-input': {}, '@/lib/prepare-photo': {},
    '@/components/spoods/molt-stage-fields': {}, '@/components/spoods/maintenance-fields': { MaintenanceFields: 'maintenance-fields' }, '@/lib/interaction': { INTERACTION_METHODS: ['walk'] },
    'lucide-react': new Proxy({}, { get: () => 'icon' }), 'next/link': 'a',
  };
  return { ...action, dependencies, states, render: <T>(work: () => T) => { index = 0; return work(); }, refreshes: () => refreshes };
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test('direct premolt action displays context guidance and keeps its edited selection', async () => {
  const f = clientFixture();
  const component = load<typeof import('../components/spoods/premolt-toggle')>('../components/spoods/premolt-toggle.tsx', f.dependencies);
  const render = () => f.render(() => component.PremoltToggle({ spiderId: 'demo-spider', status: 'Normal' }));
  let tree = render();
  const select = elements(tree).find(element => element.type === 'select')!;
  (select.props.onChange as (event: unknown) => void)({ target: { value: 'Premolt' } });
  tree = render();
  (elements(tree).find(element => element.type === 'form')!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
  await settle();
  tree = render();
  assert.equal(elements(tree).find(element => element.type === 'select')!.props.value, 'Premolt');
  assert.ok(elements(tree).some(element => element.props.role === 'alert' && String(element.props.children).includes('reload')));
  assert.equal(f.helperCalls(), 0); assert.equal(f.refreshes(), 0);
});
test('shared profile form feedback reports returned failure without refresh or private exception text', async () => {
  const f = clientFixture();
  const component = load<typeof import('../components/spoods/profile-forms')>('../components/spoods/profile-forms.tsx', f.dependencies);
  const form = new FormData(); form.set('mutationContext', 'a'.repeat(64)); form.set('notes', 'unsaved note');
  const handler = f.render(() => component.useActionFeedback());
  handler.run(() => f.care.logBodyCondition('demo-spider', form));
  await settle();
  const state = f.render(() => component.useActionFeedback());
  assert.match(state.error!, /Return to admin/); assert.equal(state.pending, false);
  assert.equal(form.get('notes'), 'unsaved note'); assert.equal(f.helperCalls(), 0); assert.equal(f.refreshes(), 0);
});
test('shared quick-log handler keeps the open panel and submitted note when context changes', async () => {
  const f = clientFixture();
  const submitted = new FormData(); submitted.set('mutationContext', 'a'.repeat(64)); submitted.set('notes', 'unsaved note');
  class SubmittedFormData { constructor() { return submitted; } }
  const component = load<typeof import('../components/spoods/quick-log')>('../components/spoods/quick-log.tsx', f.dependencies, { FormData: SubmittedFormData });
  const render = () => f.render(() => component.QuickLogButtons({ spiderId: 'demo-spider', spiderName: 'Demo' }));
  let tree = render();
  const button = elements(tree).find(element => element.type === 'button' && textContent(element) === 'Play')!;
  (button.props.onClick as () => void)();
  tree = render();
  (elements(tree).find(element => element.type === 'form')!.props.onSubmit as (event: unknown) => void)({ preventDefault() {}, currentTarget: {} });
  await settle();
  tree = render();
  assert.ok(elements(tree).some(element => element.type === 'form'));
  assert.ok(elements(tree).some(element => element.props.role === 'alert' && String(element.props.children).includes('reload')));
  assert.equal(submitted.get('notes'), 'unsaved note'); assert.equal(f.helperCalls(), 0); assert.equal(f.refreshes(), 0);
});
test('quick housekeeping explains the enclosure prerequisite without rendering a save form', () => {
  const f = clientFixture();
  const component = load<typeof import('../components/spoods/quick-log')>('../components/spoods/quick-log.tsx', f.dependencies);
  const render = () => f.render(() => component.QuickLogButtons({ spiderId: 'demo-spider', spiderName: 'Demo', hasEnclosure: false }));
  let tree = render();
  const button = elements(tree).find(element => element.type === 'button' && textContent(element) === 'Housekeeping');
  assert.ok(button, 'Housekeeping action should be available');
  (button.props.onClick as () => void)();
  tree = render();
  assert.ok(elements(tree).some(element => textContent(element).includes('Add enclosure details')));
  assert.equal(elements(tree).some(element => element.type === 'form'), false);
});
test('Start returns its typed rejection without redirect; accepted Start retains its intended redirect', async () => {
  const f = actionFixture(); let started = 0, redirects = 0;
  const actions = load<typeof import('../app/actions/admin-test-session')>('../app/actions/admin-test-session.ts', {
    '@/lib/mutation-boundary': f.boundary, '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'actor' }) },
    '@/lib/admin/test-session-store': { startTestSession: async () => { started++; } },
    'next/cache': { revalidatePath: () => {} }, 'next/navigation': { redirect: () => { redirects++; throw Error('NEXT_REDIRECT'); } },
  });
  const form = new FormData(); form.set('mutationContext', 'a'.repeat(64));
  const result = await actions.startTestSessionAction('demo', form);
  assert.ok(result && result.code === 'context_changed'); assert.equal(started, 0); assert.equal(redirects, 0);
  form.set('mutationContext', 'b'.repeat(64));
  await assert.rejects(actions.startTestSessionAction('demo', form), /NEXT_REDIRECT/);
  assert.equal(started, 1); assert.equal(redirects, 1);
});
