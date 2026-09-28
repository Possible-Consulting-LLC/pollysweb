import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  return text((node as Element).props.children);
}

function textOf(tree: unknown): string {
  return text(tree).replace(/\s+/g, ' ').trim();
}

const plan = {
  id: 'plan-1', name: 'Spoodler Standard',
  description: 'The everyday plan for a well-kept collection.',
  planType: 'STANDARD', maxSpiders: 5, active: true, public: true,
  billingOptions: [
    { id: 'opt-1', planId: 'plan-1', interval: 'MONTHLY', basePriceCents: 900, active: true },
    { id: 'opt-2', planId: 'plan-1', interval: 'ANNUAL', basePriceCents: 9000, active: false },
  ],
  featureTranslations: [
    { enabled: true, feature: { key: 'spood.create' } },
    { enabled: true, feature: { key: 'legacy.orphan' } },
    { enabled: false, feature: { key: 'care.feed.log' } },
  ],
};

let matrixProps: Array<Record<string, unknown>> = [];

const deps: Record<string, unknown> = {
  'react/jsx-runtime': jsx,
  'next/link': { default: ({ href, children }: { href: string; children?: unknown }) =>
    jsx.jsx('a', { href, children }) },
  'next/navigation': { notFound: () => { throw new Error('notFound'); } },
  '@/lib/admin/actor': { requireAdminActor: async () => ({ id: 'actor-1' }) },
  '@/lib/db': { prisma: { plan: { findUnique: async () => plan } } },
  '@/lib/features/registry': { isRegisteredFeatureKey: (key: string) => key.startsWith('spood') },
  '@/components/mutation-form': { MutationForm: ({ children, ...props }: Record<string, unknown>) =>
    jsx.jsx('form', { ...props, children }) },
  '@/components/mutation-context': { MutationContextInput: () => null },
  '@/components/admin/feature-matrix': { FeatureMatrix: (props: Record<string, unknown>) => {
    matrixProps.push({ ...props });
    return jsx.jsx('div', { 'data-matrix': props.planId });
  } },
  '@/components/ui/button': {
    Button: ({ variant, size, children, ...props }: Record<string, unknown>) =>
      jsx.jsx('button', { 'data-variant': variant ?? 'primary', 'data-size': size ?? 'md', ...props, children }),
  },
  '@/components/admin/list-shared': (() => {
    const listSharedExports: Record<string, unknown> = {};
    runInNewContext(ts.transpileModule(
      readFileSync(new URL('../../components/admin/list-shared.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: listSharedExports });
    return listSharedExports;
  })(),
  '../../actions': {
    updatePlanAction: 'update-plan',
    saveBillingOptionAction: 'save-billing-option',
    setBillingOptionActiveAction: 'set-billing-option-active',
  },
  '../actions': { createPlanAction: 'create-plan' },
};

function loadPage(path: string): (input: unknown) => Promise<unknown> {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports.default as (input: unknown) => Promise<unknown>;
}

const renderEdit = async () => {
  matrixProps = [];
  const tree = await loadPage('../../app/admin/plans/[id]/edit/page.tsx')({ params: Promise.resolve({ id: 'plan-1' }) });
  elements(tree); // resolve the function-component tree (fills matrixProps)
  return tree;
};

const renderNew = async () => loadPage('../../app/admin/plans/new/page.tsx')({});

test('builder header: clean title, quiet crumbs — View plan deep-links the plans accordion open state', async () => {
  const tree = await renderEdit();
  const h2 = elements(tree).find(item => item.type === 'h2');
  assert.equal(textOf(h2), 'Edit Spoodler Standard');
  const links = elements(tree).filter(item => item.type === 'a');
  const view = links.find(item => textOf(item) === 'View plan');
  const back = links.find(item => textOf(item) === 'Back to plans');
  assert.equal(view?.props.href, '/admin/plans?open=plan-1');
  assert.equal(back?.props.href, '/admin/plans');
});

test('plan details renders as ONE soft card submitting updatePlanAction with the mockup field set', async () => {
  const tree = await renderEdit();
  const forms = elements(tree).filter(item => item.type === 'form');
  const details = forms.find(form =>
    elements(form).some(item => item.type === 'input' && item.props.name === 'name'));
  assert.ok(details, 'the plan-details card form is missing');
  assert.equal(details?.props.action, 'update-plan');
  const fields = elements(details!);
  const name = fields.find(item => item.type === 'input' && item.props.name === 'name');
  assert.equal(name?.props.required, true);
  assert.equal(name?.props.maxLength, 80);
  const description = fields.find(item => item.type === 'textarea' && item.props.name === 'description');
  assert.ok(description, 'description field missing');
  assert.equal(description?.props.required, undefined, 'descriptions are optional');
  assert.equal(description?.props.maxLength, 500);
  const type = fields.find(item => item.type === 'select' && item.props.name === 'planType');
  assert.deepEqual(elements(type).filter(item => item.type === 'option').map(item => String(item.props.value)),
    ['STANDARD', 'CUSTOM', 'INTERNAL']);
  assert.ok(fields.some(item => item.type === 'input' && item.props.name === 'maxSpiders' &&
    item.props.type === 'number'));
  assert.ok(fields.some(item => item.type === 'input' && item.props.name === 'active' &&
    item.props.type === 'checkbox'));
  assert.ok(fields.some(item => item.type === 'input' && item.props.name === 'public' &&
    item.props.type === 'checkbox'));
  const save = elements(details!).find(item => item.type === 'button' && text(item) === 'Save plan');
  assert.equal(save?.props['data-variant'], 'primary', 'Save plan is the card-footer primary');
});

test('billing options render as freestanding rows with pill badges and per-row Activate/Deactivate', async () => {
  const tree = await renderEdit();
  const body = textOf(tree);
  // The kv-style row text joins children with spaces; compare compactly.
  const compact = body.replace(/\s+/g, '');
  assert.ok(compact.includes('Monthly$9.00USD'), compact);
  assert.ok(compact.includes('Annual$90.00USD'), compact);
  assert.ok(body.includes('Inactive'), body);
  const toggleForms = elements(tree).filter(item => item.type === 'form' &&
    elements(item).some(child => child.type === 'input' && child.props.name === 'optionId'));
  assert.equal(toggleForms.length, plan.billingOptions.length);
  const monthly = toggleForms.find(form =>
    String(elements(form).find(child => child.type === 'input' && child.props.name === 'optionId')?.props.value) === 'opt-1')!;
  const annual = toggleForms.find(form =>
    String(elements(form).find(child => child.type === 'input' && child.props.name === 'optionId')?.props.value) === 'opt-2')!;
  assert.equal(textOf(elements(monthly).find(item => item.type === 'button')), 'Deactivate');
  assert.equal(String(elements(monthly).find(item => item.type === 'input' && item.props.name === 'active')?.props.value), 'false');
  assert.equal(textOf(elements(annual).find(item => item.type === 'button')), 'Activate');
  assert.equal(String(elements(annual).find(item => item.type === 'input' && item.props.name === 'active')?.props.value), 'true');
  // Pill badges are theme-token classes from list-shared (no palette literals).
  const on = elements(tree).filter(item => item.type === 'span' && text(item) === 'Active');
  const off = elements(tree).filter(item => item.type === 'span' && text(item) === 'Inactive');
  assert.equal(on.length, 1);
  assert.equal(off.length, 1);
  assert.match(String(on[0].props.className), /var\(--plum\)|var\(--hover\)/);
  assert.match(String(off[0].props.className), /border-dashed/);
});

test('the add-option form posts interval, cents price, and state, with the one-active-per-interval hint', async () => {
  const tree = await renderEdit();
  const forms = elements(tree).filter(item => item.type === 'form');
  const add = forms.find(form =>
    elements(form).some(item => item.type === 'select' && item.props.name === 'interval'));
  assert.ok(add, 'the add-option form is missing');
  assert.equal(add?.props.action, 'save-billing-option');
  const intervals = elements(add).find(item => item.type === 'select' && item.props.name === 'interval');
  assert.deepEqual(elements(intervals).filter(item => item.type === 'option').map(item => String(item.props.value)),
    ['MONTHLY', 'ANNUAL']);
  assert.ok(elements(add).some(item => item.type === 'input' && item.props.name === 'basePriceCents' &&
    item.props.type === 'number' && item.props.min === 0));
  const state = elements(add).find(item => item.type === 'select' && item.props.name === 'active');
  assert.deepEqual(elements(state).filter(item => item.type === 'option').map(item => String(item.props.value)),
    ['true', 'false']);
  const addBtn = elements(add).find(item => item.type === 'button' && text(item) === 'Add option');
  assert.equal(addBtn?.props['data-variant'], 'soft');
  assert.ok(textOf(tree).includes('One active option per interval'), 'the hint must render');
});

test('the features section receives the registry-filtered enabled keys and the plan identity', async () => {
  await renderEdit();
  assert.equal(matrixProps.length, 1);
  // vm-realm results: JSON copies keep strict comparisons local.
  const captured = JSON.parse(JSON.stringify(matrixProps[0]));
  assert.deepEqual(captured.planId, 'plan-1');
  assert.deepEqual(captured.planName, 'Spoodler Standard');
  assert.deepEqual(captured.initialEnabledKeys, ['spood.create'],
    'orphaned (unregistered) keys never seed the matrix');
  assert.deepEqual(captured.options, plan.billingOptions.map(option =>
    ({ planId: option.planId, interval: option.interval, basePriceCents: option.basePriceCents, active: option.active })));
});

test('the standalone plan-detail page is retired — no surface links to it', () => {
  assert.equal(existsSync(new URL('../../app/admin/plans/[id]/page.tsx', import.meta.url)), false,
    'the retired detail page must be deleted');
  for (const relative of ['../../app/admin/plans/[id]/edit/page.tsx', '../../app/admin/plans/new/page.tsx',
    '../../components/admin/plans-accordion.tsx']) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    const targets = source.match(/\/admin\/plans\/\$\{[^}]+\}[^`]*/g) ?? [];
    for (const target of targets)
      assert.match(target, /\/edit$/, `${relative} still links to the retired detail page: ${target}`);
  }
});

test('the new-plan page mirrors the builder plan-details card', async () => {
  const tree = await renderNew();
  const h2 = elements(tree).find(item => item.type === 'h2');
  assert.equal(textOf(h2), 'Create a plan');
  const back = elements(tree).filter(item => item.type === 'a')
    .find(item => textOf(item) === 'Back to plans');
  assert.equal(back?.props.href, '/admin/plans');
  const forms = elements(tree).filter(item => item.type === 'form');
  assert.equal(forms.length, 1);
  const fields = elements(forms[0]);
  assert.equal(forms[0].props.action, 'create-plan');
  const name = fields.find(item => item.type === 'input' && item.props.name === 'name');
  assert.equal(name?.props.required, true);
  assert.equal(name?.props.maxLength, 80);
  const description = fields.find(item => item.type === 'textarea' && item.props.name === 'description');
  assert.equal(description?.props.required, undefined, 'descriptions are optional');
  const type = fields.find(item => item.type === 'select' && item.props.name === 'planType');
  assert.deepEqual(elements(type).filter(item => item.type === 'option').map(item => String(item.props.value)),
    ['STANDARD', 'CUSTOM', 'INTERNAL']);
  assert.ok(fields.some(item => item.type === 'input' && item.props.name === 'maxSpiders'));
  assert.ok(fields.some(item => item.type === 'input' && item.props.name === 'active' && item.props.type === 'checkbox'));
  assert.ok(fields.some(item => item.type === 'input' && item.props.name === 'public' && item.props.type === 'checkbox'));
  const create = fields.find(item => item.type === 'button' && text(item) === 'Create plan');
  assert.equal(create?.props['data-variant'], 'primary');
  assert.equal(elements(tree).some(item => item.type === 'form' &&
    elements(item).some(child => child.type === 'input' && child.props.name === 'optionId')), false,
    'no billing machinery before the plan exists');
});
