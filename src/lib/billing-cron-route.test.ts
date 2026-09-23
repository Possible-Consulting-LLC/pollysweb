import * as maintenancePolicy from './admin/maintenance-policy';
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadRoute(env: Record<string, string | undefined>, result = { selected: 2, succeeded: 2, failed: 0 }, maintenance=false) {
  const source = readFileSync(new URL("../app/api/cron/reconcile-billing/route.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const routeModule = { exports: {} as { GET: (request: Request) => Promise<Response> } };
  const calls: unknown[] = [];
  runInNewContext(outputText, {
    module: routeModule,
    exports: routeModule.exports,
    process: { env },
    Buffer,
    Date,
    console: { info: () => {}, error: () => {} },
    require: (id: string) => {
      if(id==='@/lib/admin/maintenance-access') return {guardServiceMaintenance:async()=>{if(maintenance)throw new maintenancePolicy.MaintenanceError();}};
      if(id==='@/lib/admin/maintenance-policy') return maintenancePolicy;
      if (id === "node:crypto") return crypto;
      if (id === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
      if (id === "@/lib/staging-guard") return { isStaging: () => env.SPOODLY_ENV === "staging" };
      if (id === "@/lib/db") return { prisma: {} };
      if (id === "@/lib/billing-service") return { reconcileStripeCustomer: async () => {} };
      if (id === "@/lib/billing-reconciliation") return { reconcileDueBilling: async (options: unknown) => { calls.push(options); return result; } };
      throw new Error(`Unexpected import: ${id}`);
    },
  });
  return { GET: routeModule.exports.GET, calls };
}

function request(token?: string) {
  return new Request("https://example.test/api/cron/reconcile-billing", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

test("missing or wrong cron bearer token cannot start database work", async () => {
  const route = loadRoute({ CRON_SECRET: "strong-secret" });
  assert.equal((await route.GET(request())).status, 401);
  assert.equal((await route.GET(request("wrong-secret"))).status, 401);
  assert.equal(route.calls.length, 0);
});

test("blank configured secret never authenticates an empty bearer token", async () => {
  const route = loadRoute({ CRON_SECRET: " " });
  const response = await route.GET(request(""));
  assert.equal(response.status, 503);
  assert.equal(route.calls.length, 0);
});

test("staging route remains inert even with the right secret", async () => {
  const route = loadRoute({ SPOODLY_ENV: "staging", CRON_SECRET: "strong-secret" });
  const response = await route.GET(request("strong-secret"));
  assert.equal(response.status, 503);
  assert.equal(route.calls.length, 0);
});

test("authenticated production request runs one batch and reports partial failure", async () => {
  const route = loadRoute({ CRON_SECRET: "strong-secret" }, { selected: 2, succeeded: 1, failed: 1 });
  const response = await route.GET(request("strong-secret"));
  assert.equal(response.status, 500);
  assert.equal(route.calls.length, 1);
  assert.deepEqual(await response.json(), { selected: 2, succeeded: 1, failed: 1 });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test('active maintenance pauses authenticated cron and preserves unauthorized response',async()=>{const route=loadRoute({CRON_SECRET:'secret'},undefined,true);assert.equal((await route.GET(request('wrong'))).status,401);const response=await route.GET(request('secret'));assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60');assert.equal(route.calls.length,0);});
