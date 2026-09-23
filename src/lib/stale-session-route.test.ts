import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the real route with only its auth boundary substituted. This avoids
// Next request-local storage and database access while preserving route behavior.
function routeWithSession(session: unknown) {
  let signOuts = 0;
  const source = readFileSync(new URL("../app/api/auth/clear-stale/route.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const require = createRequire(import.meta.url);
  const routeModule = { exports: {} as { GET: (request: Request) => Promise<Response | undefined> } };
  runInNewContext(outputText, {
    module: routeModule, exports: routeModule.exports, URL,
    require: (id: string) => id === "@/lib/auth" ? {
      auth: async () => session,
      signOut: async () => { signOuts++; },
    } : id === "@/lib/admin/test-session-store" ? { stopTestSession: async () => {} } : require(id),
  });
  return { GET: routeModule.exports.GET, signOuts: () => signOuts };
}

test("cross-site cleanup GET cannot sign out a valid session", async () => {
  const route = routeWithSession({ user: { id: "keeper-a" } });
  const response = await route.GET(new Request("https://spoodly.example/api/auth/clear-stale", {
    headers: { "sec-fetch-site": "cross-site" },
  }));
  assert.equal(route.signOuts(), 0);
  assert.equal(response?.headers.get("location"), "https://spoodly.example/");
});

test("cleanup GET still clears an invalid or missing session", async () => {
  const route = routeWithSession(null);
  await route.GET(new Request("https://spoodly.example/api/auth/clear-stale"));
  assert.equal(route.signOuts(), 1);
});
