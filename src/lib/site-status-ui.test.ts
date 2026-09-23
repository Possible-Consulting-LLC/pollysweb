import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as dom from './site-status-dom';
import * as privateStatus from './site-status-private';
import * as channel from './site-status-channel';
import type { ReactElement } from 'react';

function recoveryAction(events: string[]) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../app/actions/admin-test-session.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === '@/lib/admin/test-session-store') return { stopTestSession: async (...args: unknown[]) => { assert.equal(args.length, 0); events.push('actor-bound-stop'); } };
    if (name === 'next/cache') return { revalidatePath: (path: string) => events.push(`revalidate:${path}`) };
    if (name === 'next/navigation') return { redirect: (path: string) => { events.push(`redirect:${path}`); throw Error('redirect'); } };
    if (['@/lib/admin/actor', '@/lib/mutation-boundary'].includes(name)) return {};
    throw Error(name);
  } });
  return exports.stopTestSessionAction as () => Promise<void>;
}

function components(stopTestSessionAction = async () => {}) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../components/layout/site-status.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react/jsx-runtime') return jsx;
    if (name === 'react') {
      const states = [{ status: { mode: 'active', announcementEnabled: false, announcement: '' }, receivedAtMs: 1 }, false, 1, false, true];
      return { useEffect: () => {}, useRef: () => ({ current: null }), useState: () => [states.shift(), () => {}] };
    }
    if (name === 'next/navigation') return { usePathname: () => '/home' };
    if (name === '@/lib/site-status-model') return { protectedSitePath: () => true, siteStatusView: () => ({ mode: 'active', seconds: 0 }) };
    if (name === '@/app/actions/admin-test-session') return { stopTestSessionAction };
    if (name === '@/lib/site-status-dom') return dom;
    if (name === '@/lib/site-status-private') return privateStatus;
    if (name === '@/lib/site-status-channel') return channel;
    throw Error(name);
  } });
  return exports as Record<string, (props: Record<string, unknown>) => ReturnType<typeof jsx.jsx>>;
}
const presentation = () => components().SiteStatusPresentation;

function elements(tree: ReactElement): ReactElement<Record<string, unknown>>[] {
  const node = tree as ReactElement<Record<string, unknown>>;
  return [node, ...[node.props.children].flat().filter((child): child is ReactElement => Boolean(child && typeof child === 'object' && 'props' in child)).flatMap(elements)];
}

test('expired or revoked Test-as exposes actor-bound Return inside the nondismissable active modal', async () => {
  const events: string[] = [];
  const action = recoveryAction(events);
  const api = components(action);
  // Already-open protected page, with the private context validator's expired/revoked state.
  const wrapper = api.SiteStatus({ bypass: true, canHaveBypass: true });
  const child = elements(wrapper).find(node => node.type === api.SiteStatusPresentation)!;
  assert.ok(child, 'live status must render its presentation');
  const rendered = api.SiteStatusPresentation(child.props);
  const dialog = elements(rendered).find(node => node.type === 'dialog')!;
  assert.ok(dialog, 'context loss keeps maintenance blocking');
  const form = elements(dialog).find(node => node.type === 'form')!;
  assert.ok(form, 'recovery must be inside the modal so it is reachable');
  assert.equal(form.props.action, action);
  const html = renderToStaticMarkup(rendered);
  assert.match(html, /Return to admin/);
  assert.match(html, /leave this page/i); assert.match(html, /discard.*unsaved/i);
  assert.doesNotMatch(html, />Save</);
  let prevented = false;
  (dialog.props.onCancel as (event: unknown) => void)({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  await assert.rejects((form.props.action as () => Promise<void>)(), /redirect/);
  assert.deepEqual(events, ['actor-bound-stop', 'revalidate:/', 'redirect:/admin/demos']);
});

test('independent announcement stays visible without a maintenance deadline', () => {
  const render = presentation();
  const html = renderToStaticMarkup(render({ status: { mode: 'open', announcementEnabled: true, announcement: 'Updates tonight' }, seconds: null, bypass: false, protectedPage: false }));
  assert.match(html, /Updates tonight/);
  assert.doesNotMatch(html, /Please save your work/);
  assert.doesNotMatch(html, /dialog/);
});

test('persistent save warning is announced once while changing seconds stay out of live region', () => {
  const render = presentation();
  const html = renderToStaticMarkup(render({ status: { mode: 'countdown', announcementEnabled: false, announcement: '' }, seconds: 42, bypass: false, protectedPage: true }));
  assert.match(html, /Please save your work\. Maintenance begins shortly\./);
  assert.match(html, /42 seconds/);
  assert.match(html, /aria-hidden="true"[^>]*>42 seconds/);
});

test('active ordinary app page gets a blocking modal while super admin sees a bypass banner', () => {
  const render = presentation();
  const ordinary = renderToStaticMarkup(render({ status: { mode: 'active', announcementEnabled: false, announcement: '' }, seconds: 0, bypass: false, protectedPage: true }));
  assert.match(ordinary, /<dialog/);
  assert.match(ordinary, /Your unsaved entries are still here/);
  const admin = renderToStaticMarkup(render({ status: { mode: 'active', announcementEnabled: false, announcement: '' }, seconds: 0, bypass: true, protectedPage: true }));
  assert.doesNotMatch(admin, /<dialog/);
  assert.match(admin, /super administrator/);
  const staticPage = renderToStaticMarkup(render({ status: { mode: 'active', announcementEnabled: false, announcement: '' }, seconds: 0, bypass: false, protectedPage: false }));
  assert.doesNotMatch(staticPage, /<dialog/);
});
