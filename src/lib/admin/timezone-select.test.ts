import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

type Element = { props: { value?: string; children: Element } };
function select(server: boolean, saved = '') {
  const dependencies: Record<string, unknown> = {
    'react/jsx-runtime': jsx,
    react: { useMemo: (fn: () => unknown) => fn(), useEffect: () => {}, useState: (initial: unknown) => [initial, () => {}],
      useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => string, getServerSnapshot: () => string) => server ? getServerSnapshot() : getSnapshot() },
    '@/components/ui/field': { Field: 'fieldset', Select: 'select', Input: 'input' },
    '@/lib/utils': { COMMON_TIMEZONES: ['UTC', 'Asia/Tokyo'], toDateTimeLocalInputValue: () => '' },
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('../../components/ui/datetime-field.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Asia/Tokyo' }) }) }, require: (name: string) => dependencies[name] });
  return (exports.TimezoneSelect as (props: unknown) => Element)({ defaultValue: saved }).props.children;
}
test('timezone control has a stable server value and preselects actual browser zone on hydration', () => {
  assert.equal(select(true).props.value, 'UTC');
  assert.equal(select(false).props.value, 'Asia/Tokyo');
});
test('saved personal timezone always wins over browser detection', () => {
  assert.equal(select(false, 'America/Los_Angeles').props.value, 'America/Los_Angeles');
});
