import { config } from 'dotenv';
config({ path: '.env.local' });
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { cleanupE2eData, PREFIX, readCreds, resetRateLimits } from './lib/db';
import { seedKeeper, seedPlan } from './fixtures';

/**
 * PERFORMANCE MEASUREMENT — report-only, no fixes (user directive).
 *
 * Runs against the PRODUCTION build served by `next start` (the config's
 * webServer) — never dev-server timings, which compile on demand and recompile
 * while files are edited. See serve.sh.
 *
 * Method:
 * - TTFB / load come from the browser's Navigation Timing entries per goto.
 * - Queries per render come from pg_stat_statements DELTAS around a single
 *   navigation: the suite snapshots statement call counts immediately before
 *   and after the page render, so the delta IS the render's query count —
 *   measured at the database boundary without changing any product code
 *   (Prisma client code is frozen for this task). The same snapshots carry
 *   mean/max execution time per statement for the largest/slowest queries.
 * Caveat recorded in the report: the user's dev server shares this staging
 * database, so concurrent browsing during a measurement window would add noise
 * to the deltas (kept short to limit the exposure).
 */

const ITERATIONS = 4;
const perfDb = new PrismaClient({ log: ['error'] });

type Statement = { query: string; calls: number; rows: number; totalMs: number; maxMs: number };

/** Supabase's pooler drops long-lived idle connections; reconnect on a
 * dropped-connection error instead of failing the measurement. */
async function queryStats() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await perfDb.$queryRaw<Array<{ query: string; calls: bigint; rows: bigint; total_ms: number; max_ms: number }>>`
        SELECT left(query, 240) AS query, calls, rows,
               total_exec_time::float8 AS total_ms, max_exec_time::float8 AS max_ms
        FROM pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())`;
    } catch (error) {
      const message = String((error as { message?: string }).message);
      if (!/closed the connection|Connection terminated|ECONNRESET/i.test(message) || attempt === 2) throw error;
      await perfDb.$disconnect().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2_000 * (attempt + 1)));
    }
  }
  throw new Error('unreachable');
}

async function snapshot(): Promise<Map<string, Statement>> {
  const rows = await queryStats();
  return new Map(rows.map(row => [row.query, { query: row.query, calls: Number(row.calls), rows: Number(row.rows), totalMs: row.total_ms, maxMs: row.max_ms }]));
}

function diff(before: Map<string, Statement>, after: Map<string, Statement>): Statement[] {
  const delta: Statement[] = [];
  for (const [query, afterRow] of after) {
    const calls = afterRow.calls - (before.get(query)?.calls ?? 0);
    if (calls > 0) delta.push({ query, calls, rows: afterRow.rows, totalMs: afterRow.totalMs, maxMs: afterRow.maxMs });
  }
  return delta;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? NaN;
};

const timing = async (page: import('@playwright/test').Page) => page.evaluate(() => {
  const entry = performance.getEntriesByType('navigation').at(-1) as PerformanceNavigationTiming | undefined;
  if (!entry) return null;
  return {
    ttfbMs: Math.round(entry.responseStart - entry.startTime),
    dclMs: Math.round(entry.domContentLoadedEventEnd - entry.startTime),
    loadMs: Math.round(entry.loadEventEnd > 0 ? entry.loadEventEnd - entry.startTime : -1),
    transferBytes: entry.transferSize,
  };
});

test.describe.configure({ mode: 'serial' });

test('measure the new admin surfaces (production build, report-only)', async ({ page }) => {
  test.setTimeout(900_000); // 9 targets × (warm-up + measurement) under shared-DB contention
  const creds = readCreds();
  await resetRateLimits(creds.userId, creds.email);

  // Deterministic, prefixed data so every target renders populated content.
  const plan = await seedPlan({ name: `${PREFIX}Perf Plan`, active: true,
    billingOptions: [{ interval: 'MONTHLY', basePriceCents: 1000, active: true }] });
  const keeper = await seedKeeper({ name: `${PREFIX}Perf Keeper` });
  await prismaPerfSetup(plan.id, plan.billingOptions[0].id, keeper.id);

  const targets: Array<{ name: string; url: string }> = [
    { name: 'admin-plans (paginated list)', url: '/admin/plans' },
    { name: 'admin-plans (search ZZ-e2e-)', url: `/admin/plans?search=${encodeURIComponent(PREFIX)}` },
    { name: 'admin-plans (accordion expanded)', url: `/admin/plans?open=${plan.id}` },
    { name: 'admin-features (catalog)', url: '/admin/features' },
    { name: 'admin-features (expanded)', url: '/admin/features?open=spood.create' },
    { name: 'admin-plan-edit (feature matrix)', url: `/admin/plans/${plan.id}/edit` },
    { name: 'admin-subscriptions (list)', url: '/admin/subscriptions' },
    { name: 'admin-subscriptions (wizard open)', url: '/admin/subscriptions?wizard=open&step=1' },
    { name: 'home (product, signed in)', url: '/home' },
  ];

  const results: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    const timings: Array<Record<string, number>> = [];
    let renderQueries = 0;
    const queries: Statement[] = [];
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      await page.goto(target.url); // warm-up pass on iteration 0 (JIT/fonts)
      const before = await snapshot();
      await page.goto(target.url);
      const after = await snapshot();
      const delta = diff(before, after);
      renderQueries += delta.reduce((sum, statement) => sum + statement.calls, 0);
      queries.push(...delta);
      const entry = await timing(page);
      if (entry && entry.loadMs >= 0) timings.push(entry);
    }
    // Attribute the accumulated statements: calls scale by ITERATIONS.
    const byQuery = new Map<string, Statement>();
    for (const statement of queries) {
      const known = byQuery.get(statement.query);
      if (known) { known.calls += statement.calls; known.totalMs += statement.totalMs; }
      else byQuery.set(statement.query, { ...statement });
    }
    const statements = [...byQuery.values()].sort((a, b) => b.calls - a.calls);
    const slowest = [...byQuery.values()].sort((a, b) => b.maxMs - a.maxMs).slice(0, 5);
    results.push({
      target: target.name,
      url: target.url,
      samples: timings.length,
      ttfbMedianMs: median(timings.map(entry => entry.ttfbMs)),
      domContentLoadedMedianMs: median(timings.map(entry => entry.dclMs)),
      loadMedianMs: median(timings.map(entry => entry.loadMs)),
      htmlTransferMedianBytes: median(timings.map(entry => entry.transferBytes)),
      prismaQueriesPerRender: +(renderQueries / ITERATIONS).toFixed(1),
      topStatementsByCalls: statements.slice(0, 10).map(statement => ({
        calls: statement.calls, avgMsPerCall: +(statement.totalMs / statement.calls).toFixed(2), query: statement.query,
      })),
      slowestStatementsByMaxMs: slowest.map(statement => ({
        maxMs: +statement.maxMs.toFixed(2), calls: statement.calls, query: statement.query,
      })),
    });
  }

  mkdirSync('tests/integration/artifacts/run', { recursive: true });
  writeFileSync('tests/integration/artifacts/run/perf-results.json', JSON.stringify(results, null, 2));
  for (const result of results) {
    console.log(`${result.target}: ttfb=${result.ttfbMedianMs}ms load=${result.loadMedianMs}ms prismaQueries/render=${result.prismaQueriesPerRender}`);
  }
  expect(results).toHaveLength(targets.length);

  async function prismaPerfSetup(planId: string, optionId: string, keeperId: string) {
    await perfDb.userSubscription.create({ data: { userId: keeperId, planId, planBillingOptionId: optionId, status: 'ACTIVE', startedAt: new Date() } });
  }
});

test.afterAll(async () => {
  await cleanupE2eData({ includeUsers: true, excludeEmails: [readCreds().email] });
  await perfDb.$disconnect();
});