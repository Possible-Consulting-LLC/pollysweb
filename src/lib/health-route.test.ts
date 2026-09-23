import * as maintenancePolicy from './admin/maintenance-policy';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadHealthRoute(env: Record<string, string | undefined>) {
  const source = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const routeModule = { exports: {} as { GET: () => Promise<Response> } };
  runInNewContext(outputText, {
    module: routeModule,
    exports: routeModule.exports,
    process: { env },
    require: (id: string) => {
      if(id==='@/lib/admin/maintenance-access') return {guardServiceMaintenance:async()=>{}};
      if(id==='@/lib/admin/maintenance-policy') return maintenancePolicy;
      if (id === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
      if (id === "@/lib/billing") return { stripeEnvStatus: () => ({ STRIPE_SECRET_KEY: true }) };
      if (id === "@/lib/supabase") return { privatePhotoStorageReady: async () => env.SUPABASE_READY === "true" };
      throw new Error(`Unexpected import: ${id}`);
    },
  });
  return routeModule.exports.GET;
}

test("public health response reveals only availability, without configuration details", async () => {
  const GET = loadHealthRoute({ AUTH_SECRET: "secret", DATABASE_URL: "private-url", SUPABASE_READY: "true" });
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("health is unavailable when private photo storage is not configured", async () => {
  const GET = loadHealthRoute({ AUTH_SECRET: "secret", DATABASE_URL: "private-url" });
  const response = await GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false });
});

test("public health response stays coarse when required configuration is missing", async () => {
  const GET = loadHealthRoute({});
  const response = await GET();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false });
});
