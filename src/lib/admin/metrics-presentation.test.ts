import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ReactElement } from 'react';
import { AdminMetricsView } from '../../components/admin/metrics';
import { reportingPeriod } from './analytics-period';
import type { AdminMetrics } from './metrics';

const now = new Date('2026-03-10T19:00:00Z');
const metrics: AdminMetrics = {
  totals: { accounts: 4, ordinaryAccounts: 3, demoAccounts: 1, activeSpoods: 3, memorializedSpoods: 1, effectiveFree: 2, effectivePro: 2, payingCustomers: 1 },
  newAccountCount: 2, activeKeeperCount: 1, perDayCounts: [{ day: '2026-03-10', registrations: 2, care: 3 }],
  careTypeCounts: [{ type: 'feeding', count: 3 }], topKeepers: [{ userId: 'keeper', name: 'A Keeper', count: 3 }],
  starCount: 1, badgeCounts: [{ id: 'streak-1', count: 1 }], generatedAt: now.toISOString(), badgesGeneratedAt: now.toISOString(),
};

test('overview renders accessible daily table and chart, explicit scope, partial date, and badge as-of time', () => {
  const html = renderToStaticMarkup(createElement(AdminMetricsView, { metrics, period: reportingPeriod('America/Los_Angeles', 7, now), includeDemo: false }));
  for (const text of ['America/Los_Angeles', 'partial', 'Demo activity excluded', 'Current lifetime badge eligibility', 'original keeper', 'As of', 'Daily registrations and care logs']) assert.ok(html.includes(text), text);
  assert.match(html, /<table/); assert.match(html, /<caption/); assert.match(html, /role="img"/);
  assert.match(html, /2026-03-10/); assert.match(html, /12:00 PM/); assert.match(html, /A Keeper/);
});

function load(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, Date, Intl, URLSearchParams, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports as { default(props: unknown): Promise<ReactElement> };
}
const passthrough = ({ children }: { children: React.ReactNode }) => createElement('div', null, children);
const prefs = { getAdminDateFormatter: async () => ({ timezone: 'Asia/Tokyo', dates: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }) }) };
const common = { 'react/jsx-runtime': jsx, 'next/link': { default: passthrough }, '@/components/ui/card': { Card: passthrough },
  '@/components/mutation-form': { MutationForm: passthrough }, '@/components/mutation-context': { MutationContextInput: () => null },
  '@/lib/admin/reporting': prefs, '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'admin', role: 'admin' }) },
  'next/navigation': {},
};
test('account listing uses viewer Tokyo date across UTC date boundary', async () => {
  const page = load('../../app/admin/accounts/page.tsx', { ...common, '@/lib/admin/accounts': { searchAccounts: async () => ({ items: [{ id: 'keeper', name: 'Keeper', email: 'keeper@example.test', role: 'user', createdAt: now, _count: { spiders: 1, careDays: 0 } }] }) } });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Mar 11, 2026/);
});
test('operations receipt, checkout and billing dates use the saved viewing timezone', async () => {
  const page = load('../../app/admin/operations/page.tsx', { ...common,
    '@/app/actions/admin-demo': {}, '@/app/actions/admin-accounts': {},
    '@/lib/admin/accounts': { listAdminOperations: async () => ({ facebookRequests: [{ id: 'request', status: 'pending', createdAt: now }], checkoutIntents: [{ id: 'checkout', userId: 'keeper', createdAt: now }], billingFailures: [{ id: 'keeper', billingLastCheckedAt: now, billingNextCheckAt: now }] }) },
  });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.equal(html.match(/Mar 11, 2026, 4:00 AM/g)?.length, 4);
});
