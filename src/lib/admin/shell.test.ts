import * as maintenancePolicy from './maintenance-policy';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
function load(path: string, dependencies: Record<string, unknown>) {
  dependencies['@/lib/admin/maintenance-policy'] ??= maintenancePolicy;
  dependencies['@/lib/admin/test-session'] ??= { TestContextError: class TestContextError extends Error {} };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, process: { env: {} }, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
test('direct admin layout access rejects ordinary users before fetching or rendering data', async () => {
  class Denied extends Error {}
  let dataRead = false;
  const api = load('../../app/admin/layout.tsx', {
    'react/jsx-runtime': jsx, 'next/link': {}, 'next/navigation': { notFound: () => { throw new Error('404'); } },
    '@/lib/admin/actor': { AdminAccessError: Denied, requireAdminActor: async () => { throw new Denied(); } },
    '@/lib/admin/presentation': {}, '@/lib/db': { prisma: { user: { findUnique: async () => { dataRead = true; } } } },
    '@/components/admin/nav': {},
    '@/components/mutation-form': {}, '@/components/mutation-context': {}, '@/components/ui/datetime-field': {}, './actions': {},
  }) as { default(input: { children: string }): Promise<unknown> };
  await assert.rejects(api.default({ children: 'private data' }), /404/);
  assert.equal(dataRead, false);
});
test('direct admin layout access safely hides admin routes during Test-as', async () => {
  class DeniedTestContext extends Error {}
  let dataRead = false;
  const api = load('../../app/admin/layout.tsx', {
    'react/jsx-runtime': jsx, 'next/link': {}, 'next/navigation': { notFound: () => { throw new Error('404'); } },
    '@/lib/admin/actor': { AdminAccessError: class extends Error {}, requireAdminActor: async () => { throw new DeniedTestContext(); } },
    '@/lib/admin/test-session': { TestContextError: DeniedTestContext },
    '@/lib/admin/presentation': {}, '@/lib/db': { prisma: { user: { findUnique: async () => { dataRead = true; } } } },
    '@/components/admin/nav': {},
    '@/components/mutation-form': {}, '@/components/mutation-context': {}, '@/components/ui/datetime-field': {}, './actions': {},
  }) as { default(input: { children: string }): Promise<unknown> };
  await assert.rejects(api.default({ children: 'private data' }), /404/);
  assert.equal(dataRead, false);
});
type Element = { type: string; props: Record<string, unknown> & { children?: string | Element | (string | Element)[] } };
function elements(node: Element): Element[] {
  const children = Array.isArray(node.props.children) ? node.props.children.flat(Infinity) : [node.props.children];
  return [node, ...children.filter(child => child && typeof child === 'object' && 'props' in child).flatMap(child => elements(child as Element))];
}
test('confirmation opens as labelled modal, focuses Cancel, keeps submit disabled until exact text and restores trigger on Escape', () => {
  const events: string[] = []; let refIndex = 0;
  const refs: Array<{ current: unknown }> = [{ current: { showModal: () => events.push('show'), close: () => events.push('close') } },
    { current: { focus: () => events.push('cancel focus') } }, { current: { focus: () => events.push('trigger focus') } }, { current: 'DELETE' }];
  const Button = 'button';
  const api = load('../../components/admin/confirm-action.tsx', {
    '@/components/mutation-context': { MutationContextInput: 'input' },
    'react/jsx-runtime': jsx, react: { useId: () => 'confirm-test', useRef: () => refs[refIndex++], useEffect: () => {},
      useState: (initial: unknown) => [initial, () => {}], useTransition: () => [false, () => {}] },
    '@/components/ui/button': { Button },
  }) as { ConfirmAction(input: unknown): Element };
  const tree = elements(api.ConfirmAction({ label: 'Delete', description: 'Permanent deletion', confirmation: 'DELETE', action: async () => ({}) }));
  const dialog = tree.find(node => node.type === 'dialog')!;
  assert.equal(dialog.props['aria-labelledby'], 'confirm-test-title');
  const trigger = tree.find(node => node.props.onClick && node.props.children === 'Delete')!;
  (trigger.props.onClick as () => void)();
  assert.deepEqual(events, ['show', 'cancel focus']);
  assert.equal(tree.find(node => node.props.type === 'submit')!.props.disabled, true);
  let prevented = false;
  (dialog.props.onCancel as (event: unknown) => void)({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  (dialog.props.onClose as () => void)();
  assert.equal(events.at(-1), 'trigger focus');
});
test('confirmation includes the current settings version in its submitted form', () => {
  const api = load('../../components/admin/confirm-action.tsx', {
    '@/components/mutation-context': { MutationContextInput: 'input' }, 'react/jsx-runtime': jsx,
    react: { useId: () => 'control', useRef: () => ({ current: null }), useState: (initial: unknown) => [initial, () => {}], useTransition: () => [false, () => {}], useEffect: () => {} },
    '@/components/ui/button': { Button: 'button' },
  }) as { ConfirmAction(input: unknown): Element };
  const tree = elements(api.ConfirmAction({ label: 'Start', description: 'One minute', confirmation: 'START MAINTENANCE', fields: { version: 7 }, action: async () => ({}) }));
  assert.ok(tree.some(node => node.type === 'input' && node.props.name === 'version' && node.props.value === 7));
});
test('an open cancel dialog closes and returns focus when live mode requires a reopen phrase', () => {
  const events: string[] = []; let refIndex = 0;
  const refs = [
    { current: { open: false, showModal() { this.open = true; events.push('show'); }, close() { this.open = false; events.push('close'); } } },
    { current: { focus: () => events.push('cancel focus') } },
    { current: { focus: () => events.push('trigger focus') } },
    { current: 'CANCEL MAINTENANCE' },
  ];
  const effects: Array<() => void> = [];
  const api = load('../../components/admin/confirm-action.tsx', {
    '@/components/mutation-context': { MutationContextInput: 'input' }, 'react/jsx-runtime': jsx,
    react: { useId: () => 'control', useRef: () => refs[refIndex++], useState: (initial: unknown) => [initial, () => {}], useTransition: () => [false, () => {}], useEffect: (effect: () => void) => effects.push(effect) },
    '@/components/ui/button': { Button: 'button' },
  }) as { ConfirmAction(input: unknown): Element };
  const render = (confirmation: string) => { refIndex = 0; return elements(api.ConfirmAction({ label: 'Change maintenance', description: 'Change mode', confirmation, action: async () => ({}) })); };
  const first = render('CANCEL MAINTENANCE'); effects.splice(0).forEach(effect => effect());
  (first.find(node => node.props.onClick && node.props.children === 'Change maintenance')!.props.onClick as () => void)();
  render('REOPEN SITE'); effects.splice(0).forEach(effect => effect());
  assert.deepEqual(events, ['show', 'cancel focus', 'close', 'trigger focus']);
});
test('cleanup validates exact confirmation before touching authorization or database', async () => {
  let called = false;
  const api = load('../../app/admin/audit/actions.ts', {
    '@/lib/mutation-boundary': { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    '@/lib/admin/actor': { withAdminControl: async () => { called = true; } }, '@/lib/admin/audit': {},
    '@/lib/rate-limit': {}, 'next/cache': {},
  }) as { cleanupAuditAction(form: FormData): Promise<{ error?: string }> };
  const form = new FormData(); form.set('confirmation', 'yes');
  assert.ok((await api.cleanupAuditAction(form)).error);
  assert.equal(called, false);
});
test('maintenance page requires super admin before reading state and passes the admin timezone', async () => {
  let read = false;
  const denied = load('../../app/admin/maintenance/page.tsx', {
    'react/jsx-runtime': jsx, '@/lib/admin/actor': { requireAdminActor: async () => { throw Error('denied'); } },
    '@/lib/admin/maintenance-state': { readMaintenanceState: async () => { read = true; } },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/admin/reporting': {}, '@/lib/admin/presentation': {}, '@/components/admin/maintenance-controls': {},
  }) as { default(): Promise<Element> };
  await assert.rejects(denied.default(), /denied/); assert.equal(read, false);
  const allowed = load('../../app/admin/maintenance/page.tsx', {
    'react/jsx-runtime': jsx, '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'owner' }) },
    '@/lib/admin/maintenance-state': { readMaintenanceState: async () => ({ version: 3, deadline: null, announcementEnabled: false, announcement: '' }) },
    '@/lib/admin/maintenance-policy': maintenancePolicy,
    '@/lib/admin/reporting': { getAdminReportingPreferences: async () => ({ timezone: 'America/Los_Angeles' }) },
    '@/lib/admin/presentation': { adminEnvironment: () => 'Staging' },
    '@/components/admin/maintenance-controls': { MaintenanceControls: 'controls' },
  }) as { default(): Promise<Element> };
  const tree = elements(await allowed.default());
  assert.ok(tree.some(node => node.type === 'controls' && node.props.timezone === 'America/Los_Angeles' && node.props.environment === 'Staging'));
});
