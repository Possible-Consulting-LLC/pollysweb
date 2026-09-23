import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { maintenanceFailure } from './admin/maintenance-policy';
import { contextChangedFailure } from './mutation-failure';

type Element = { type: string; props: Record<string, unknown> & { children?: unknown } };
function elements(node: unknown): Element[] {
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as Element;
  return [item, ...(Array.isArray(item.props.children) ? item.props.children : [item.props.children]).flatMap(elements)];
}
function fixture() {
  let stateIndex = 0, refIndex = 0;
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const effects: Array<() => void> = [];
  const tasks: Promise<unknown>[] = [];
  let pending = false;
  let resets = 0;
  let receivedSubmitter: unknown;
  const values = new Map([['name', 'Unsaved keeper'], ['notes', 'Unsaved note']]);
  const nativeForm = { values, reset: () => { resets++; values.clear(); } };
  const submitter = { name: 'provider', value: 'google' };
  class SubmittedData extends FormData {
    constructor(form: typeof nativeForm, button: unknown) { super(); for (const [key, value] of form.values) this.set(key, value); receivedSubmitter = button; }
  }
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': jsx,
    react: {
      useState: (initial: unknown) => { const slot = stateIndex++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value: unknown) => { states[slot] = value; }]; },
      useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
      useEffect: (effect: () => void) => { effects.push(effect); },
      useTransition: () => [pending, (work: () => Promise<unknown>) => { tasks.push(work()); }],
    },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../components/mutation-form.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, FormData: SubmittedData, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const render = (props: Record<string, unknown>) => { stateIndex = 0; refIndex = 0; const tree = (exports as { MutationForm(props: unknown): Element }).MutationForm(props); while (effects.length) effects.shift()!(); return tree; };
  async function submit(tree: Element) {
    const form = elements(tree).find(element => element.type === 'form')!;
    let prevented = false;
    const event = { currentTarget: nativeForm, nativeEvent: { submitter }, get defaultPrevented() { return prevented; }, preventDefault: () => { prevented = true; } };
    assert.equal(typeof form.props.onSubmit, 'function', 'form must intercept submission to retain rejected input');
    (form.props.onSubmit as (event: unknown) => void)(event);
    if (!prevented) nativeForm.reset();
    await Promise.all(tasks.splice(0));
    return prevented;
  }
  return { render, submit, values, resets: () => resets, pending: () => { pending = true; }, submitter, receivedSubmitter: () => receivedSubmitter };
}

test('typed context failure stays inline and leaves submitted fields untouched', async () => {
  const f = fixture();
  const props = { action: async (form: FormData) => { assert.equal(form.get('notes'), 'Unsaved note'); return contextChangedFailure(); }, children: 'fields' };
  assert.equal(await f.submit(f.render(props)), true);
  assert.equal(f.resets(), 0);
  assert.equal(f.values.get('name'), 'Unsaved keeper');
  const alerts = elements(f.render(props)).filter(element => element.props.role === 'alert');
  assert.ok(alerts.some(element => String(element.props.children).includes('reload')));
  assert.ok(alerts.some(element => String(element.props.children).includes('Return to admin')));
  assert.equal(f.receivedSubmitter(), f.submitter);
});
test('successful promise action keeps the normal reset behavior', async () => {
  const f = fixture();
  await f.submit(f.render({ action: async () => ({ success: true }), children: 'fields' }));
  assert.equal(f.resets(), 1);
});
test('useActionState dispatch does not reset before its eventual failed result', async () => {
  const f = fixture();
  const action = () => undefined;
  await f.submit(f.render({ action, children: 'fields' }));
  assert.equal(f.resets(), 0);
  f.render({ action, result: contextChangedFailure(), children: 'fields' });
  assert.equal(f.resets(), 0);
  f.render({ action, result: { success: 'Saved' }, children: 'fields' });
  assert.equal(f.resets(), 1);
});
test('pending submissions stay disabled and custom validation can cancel before action', async () => {
  const f = fixture(); let calls = 0;
  const action = async () => { calls++; };
  const form = f.render({ action, onSubmit: (event: { preventDefault(): void }) => event.preventDefault(), children: 'fields' });
  await f.submit(form); assert.equal(calls, 0);
  f.pending(); const pending = f.render({ action, children: 'fields' });
  assert.equal(elements(pending).find(element => element.type === 'form')!.props['aria-busy'], true);
  assert.ok(elements(pending).some(element => element.type === 'fieldset' && element.props.disabled));
  assert.notEqual(pending.props.noValidate, true);
  await f.submit(pending); assert.equal(calls, 0);
});

test('form layout classes still apply directly to the original fields', () => {
  const f = fixture();
  const field = jsx.jsx('label', { children: 'Keeper name' });
  const tree = f.render({ action: async () => {}, className: 'space-y-4', children: field });
  const form = elements(tree).find(element => element.type === 'form')!;
  assert.equal(form.props.className, 'space-y-4');
  assert.ok((form.props.children as unknown[]).includes(field));
});

test('typed maintenance failure preserves dirty form values and displays an inline alert', async () => {
  const f = fixture();
  const props = { action: async () => maintenanceFailure(), children: 'fields' };
  await f.submit(f.render(props));
  assert.equal(f.resets(), 0);
  assert.equal(f.values.get('name'), 'Unsaved keeper');
  assert.equal(f.values.get('notes'), 'Unsaved note');
  assert.ok(elements(f.render(props)).some(element => element.props.role === 'alert' && String(element.props.children).includes('maintenance')));
});
