import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

/** Renders the server page through the repo's transpile-and-run pattern so the
 * read batching can be pinned without a Next.js runtime. */
function loadAccountsPage(deps: Record<string, unknown>) {
  const code = ts.transpileModule(
    readFileSync(new URL('../../app/admin/accounts/page.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, { exports, URLSearchParams, require: (name: string) => {
    if (name === 'react/jsx-runtime') return jsx;
    assert.ok(name in deps, `unexpected dependency ${name}`);
    return deps[name];
  } });
  return exports.default as (input: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => Promise<unknown>;
}

const baseDeps: Record<string, unknown> = {
  'next/link': { default: ({ href, children, className }: { href: string; children?: unknown; className?: string }) =>
    jsx.jsx('a', { href, className, children }) },
  '@/components/ui/card': { Card: ({ children, ...props }: Record<string, unknown>) => jsx.jsx('div', { ...props, children }) },
};

test('accounts page starts the account search and the date formatter concurrently', async () => {
  const order: string[] = [];
  let releaseSearch: () => void = () => {};
  const gate = new Promise<void>(resolve => { releaseSearch = resolve; });
  const deps = {
    ...baseDeps,
    '@/lib/admin/accounts': { searchAccounts: async () => { order.push('search:start'); await gate;
      return { items: [], nextCursor: null }; } },
    '@/lib/admin/reporting': { getAdminDateFormatter: async () => { order.push('formatter:start');
      return { dates: { format: () => 'date' }, timezone: 'UTC', fallback: false }; } },
  };
  const page = loadAccountsPage(deps);
  const pending = page({ searchParams: Promise.resolve({}) });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(order.includes('formatter:start'), 'date formatter starts while the account search is in flight');
  releaseSearch();
  await pending;
});

test('accounts page still fails closed when both reads deny', async () => {
  class AdminAccessError extends Error {}
  const deny = () => { throw new AdminAccessError(); };
  const deps = {
    ...baseDeps,
    '@/lib/admin/accounts': { searchAccounts: async () => deny() },
    '@/lib/admin/reporting': { getAdminDateFormatter: async () => deny() },
  };
  const page = loadAccountsPage(deps);
  await assert.rejects(page({ searchParams: Promise.resolve({}) }), AdminAccessError);
});
