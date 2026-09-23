import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('maintenance controls show environment, local deadline, independent announcement preview and distinct confirmations', () => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../../components/admin/maintenance-controls.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const deps: Record<string, unknown> = {
    react: React, 'react/jsx-runtime': jsx, 'next/navigation': { useRouter: () => ({ refresh: () => {} }) },
    '@/components/mutation-form': { MutationForm: 'form' }, '@/components/mutation-context': { MutationContextInput: 'input' },
    '@/components/admin/confirm-action': { ConfirmAction: ({ label, confirmation }: { label: string; confirmation: string }) => jsx.jsx('button', { 'data-confirmation': confirmation, children: label }) },
    '@/app/actions/admin-maintenance': { setAnnouncementAction: async () => ({ success: true }), setMaintenanceAction: async () => ({ success: true }) },
    '@/lib/site-status-channel': { siteStatusChannel: { subscribe: () => () => {} } },
  };
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const Controls = exports.MaintenanceControls as (props: Record<string, unknown>) => ReturnType<typeof jsx.jsx>;
  const render = (mode: string, deadline: string | null, enabled: boolean, announcement: string) => renderToStaticMarkup(jsx.jsx(Controls, { state: { version: 4, mode, deadline, announcementEnabled: enabled, announcement }, environment: 'Staging', timezone: 'America/Los_Angeles' }));
  const open = render('open', null, true, 'Updates tonight');
  assert.match(open, /Staging/);
  assert.match(open, /Updates tonight/);
  assert.match(open, /Preview/);
  assert.match(open, /START MAINTENANCE/);
  const countdown = render('countdown', '2026-09-22T12:01:00.000Z', false, 'draft');
  assert.match(countdown, /America\/Los_Angeles/);
  assert.match(countdown, /CANCEL MAINTENANCE/);
  assert.doesNotMatch(countdown, /data-confirmation="REOPEN SITE"/);
});

test('live cutoff changes cancel to reopen without discarding a dirty announcement', () => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../../components/admin/maintenance-controls.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const states: unknown[] = []; let slot = 0;
  const effects: Array<() => void> = [];
  let notify: ((status: Record<string, unknown>) => void) | undefined;
  function Confirmation() { return null; }
  const deps: Record<string, unknown> = {
    react: { useState: (initial: unknown) => { const index = slot++; if (!(index in states)) states[index] = initial; return [states[index], (value: unknown) => { states[index] = value; }]; }, useEffect: (effect: () => void) => effects.push(effect) },
    'react/jsx-runtime': jsx, 'next/navigation': { useRouter: () => ({ refresh: () => {} }) },
    '@/components/mutation-form': { MutationForm: 'form' }, '@/components/mutation-context': { MutationContextInput: 'input' },
    '@/components/admin/confirm-action': { ConfirmAction: Confirmation },
    '@/app/actions/admin-maintenance': { setAnnouncementAction: async () => ({}), setMaintenanceAction: async () => ({}) },
    '@/lib/site-status-channel': { siteStatusChannel: { subscribe: (listener: typeof notify) => { notify = listener; return () => {}; } } },
  };
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const Controls = exports.MaintenanceControls as (props: Record<string, unknown>) => ReturnType<typeof jsx.jsx>;
  const props = { state: { version: 4, mode: 'countdown', deadline: '2026-09-22T12:01:00.000Z', announcementEnabled: true, announcement: 'Saved message' }, environment: 'Staging', timezone: 'UTC' };
  const all = (node: unknown): Array<{ type: unknown; props: Record<string, unknown> }> => {
    if (!node || typeof node !== 'object' || !('props' in node)) return [];
    const element = node as { type: unknown; props: Record<string, unknown> };
    return [element, ...[element.props.children].flat(Infinity).flatMap(all)];
  };
  const render = () => { slot = 0; return all(Controls(props)); };
  let tree = render(); effects.splice(0).forEach(effect => effect());
  assert.equal(tree.find(item => item.type === Confirmation)?.props.confirmation, 'CANCEL MAINTENANCE');
  const textarea = tree.find(item => item.type === 'textarea')!;
  (textarea.props.onChange as (event: unknown) => void)({ target: { value: 'Unsaved announcement' } });
  notify!({ mode: 'active', deadline: props.state.deadline, serverTime: '2026-09-22T12:01:01.000Z', announcementEnabled: true, announcement: 'Saved message' });
  tree = render();
  assert.equal(tree.find(item => item.type === Confirmation)?.props.confirmation, 'REOPEN SITE');
  assert.equal(tree.find(item => item.type === 'textarea')?.props.value, 'Unsaved announcement');
});
