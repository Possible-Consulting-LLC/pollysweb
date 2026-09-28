import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

/** Renders the server page through the repo's transpile-and-run pattern so the
 * read batching can be pinned without a Next.js runtime. */
function loadOperationsPage(deps: Record<string, unknown>) {
  const code = ts.transpileModule(
    readFileSync(new URL('../../app/admin/operations/page.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react/jsx-runtime') return jsx;
    assert.ok(name in deps, `unexpected dependency ${name}`);
    return deps[name];
  } });
  return exports.default as (input: { searchParams: Promise<Record<string, string>> }) => Promise<unknown>;
}

const baseDeps: Record<string, unknown> = {
  'next/link': { default: ({ href, children, className }: { href: string; children?: unknown; className?: string }) =>
    jsx.jsx('a', { href, className, children }) },
  'next/navigation': { redirect: (url: string) => { throw new Error(url); } },
  '@/components/mutation-form': { MutationForm: ({ children, ...props }: Record<string, unknown>) => jsx.jsx('form', { ...props, children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/app/actions/admin-demo': { recoverDemoCheckoutAction: 'recover-demo-checkout' },
  '@/app/actions/admin-accounts': { completeFacebookDeletionAction: 'complete-facebook-deletion' },
  '@/components/ui/card': { Card: ({ children, ...props }: Record<string, unknown>) => jsx.jsx('div', { ...props, children }) },
};

test('operations page starts the actor check, operations list and date formatter concurrently', async () => {
  const order: string[] = [];
  let releaseActor: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseActor = resolve; });
  const deps = {
    ...baseDeps,
    '@/lib/admin/actor': { requireAdminActor: async () => { order.push('actor:start'); await gate;
      return { id: 'actor', role: 'admin' }; } },
    '@/lib/admin/accounts': { listAdminOperations: async () => { order.push('operations:start');
      return { facebookRequests: [], checkoutIntents: [], billingFailures: [] }; } },
    '@/lib/admin/reporting': { getAdminDateFormatter: async () => { order.push('formatter:start');
      return { dates: { format: () => 'date' }, timezone: 'UTC', fallback: false }; } },
  };
  const page = loadOperationsPage(deps);
  const pending = page({ searchParams: Promise.resolve({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(order.includes('operations:start'), 'operations list starts while the actor preamble is in flight');
  assert.ok(order.includes('formatter:start'), 'date formatter starts while the actor preamble is in flight');
  releaseActor();
  await pending;
});

test('operations page still fails closed with the actor denial', async () => {
  class AdminAccessError extends Error {}
  const deny = () => { throw new AdminAccessError(); };
  const deps = {
    ...baseDeps,
    '@/lib/admin/actor': { requireAdminActor: async () => deny() },
    '@/lib/admin/accounts': { listAdminOperations: async () => deny() },
    '@/lib/admin/reporting': { getAdminDateFormatter: async () => deny() },
  };
  const page = loadOperationsPage(deps);
  await assert.rejects(page({ searchParams: Promise.resolve({}) }), AdminAccessError);
});
