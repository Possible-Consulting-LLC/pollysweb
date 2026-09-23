import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import * as metrics from './metrics';
import { reportingPeriod } from './analytics-period';
import type * as Cache from './metrics-cache';

test('shared cache keys isolate zone, range and demo filter and refresh expires the matching tag immediately', async () => {
  const registrations: { key: string[]; options: { revalidate: number; tags: string[] } }[] = [];
  const invalidated: string[] = [];
  let queryCount = 0;
  const dependencies: Record<string, unknown> = {
    'server-only': {}, 'node:crypto': crypto, './metrics': metrics,
    '../db': { prisma: { $queryRaw: async () => { queryCount++; return [{ id: 'firstPortrait', count: 2 }]; } } },
    'next/cache': {
      unstable_cache: (read: () => Promise<unknown>, key: string[], options: { revalidate: number; tags: string[] }) => {
        registrations.push({ key, options }); return read;
      },
      updateTag: (tag: string) => invalidated.push(tag),
    },
  };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL('./metrics-cache.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Date, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const api = exports as typeof Cache;
  const now = new Date('2026-03-10T19:00:00Z'), la = reportingPeriod('America/Los_Angeles', 7, now);
  const first = await api.loadCachedBadges(la, false);
  assert.equal(first.counts[0].count, 2); assert.ok(Date.parse(first.generatedAt));
  await api.loadCachedBadges({ ...la, end: new Date(now.getTime() + 1000) }, false);
  await api.loadCachedBadges(reportingPeriod('Asia/Tokyo', 7, now), false);
  await api.loadCachedBadges(reportingPeriod('UTC', 7, now), false);
  await api.loadCachedBadges(reportingPeriod(la.zone, 14, now), false);
  await api.loadCachedBadges(la, true);
  assert.equal(queryCount, 6);
  assert.equal(registrations[0].key[0], registrations[1].key[0]);
  assert.equal(new Set(registrations.map(row => row.key[0])).size, 5);
  for (const row of registrations) { assert.equal(row.options.revalidate, 60); assert.equal(row.options.tags[0], row.key[0]); }
  api.refreshCachedBadges(la, false);
  assert.equal(invalidated[0], registrations[0].key[0]);
  assert.notEqual(invalidated[0], registrations.at(-1)!.key[0]);
});
