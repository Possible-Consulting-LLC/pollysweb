import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as core from "./rate-limit-core";

function careLimiter() {
  const counts = new Map<string, number>();
  const prisma = {
    $queryRaw: async (_strings: TemplateStringsArray, key: string, _expiry: Date, limit: number) => {
      const count = counts.get(key) ?? 0;
      if (count >= limit) return [];
      counts.set(key, count + 1);
      return [{ count: count + 1 }];
    },
    $executeRaw: async () => 0,
  };
  const source = ts.transpileModule(readFileSync(new URL("./rate-limit.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, process: { env: { RATE_LIMIT_TRUSTED_IP_HEADER: "x-real-ip" } },
    require: (name: string) => {
      if (name === "next/headers") return { headers: async () => new Headers() };
      if (name === "./db") return { prisma };
      if (name === "./rate-limit-core") return {
        ...core,
        requestIp: (headers: Headers) => core.requestIp(headers, { RATE_LIMIT_TRUSTED_IP_HEADER: "x-real-ip" }),
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports.allowAction as (action: string, identity: string, headers: Headers) => Promise<boolean>;
}

test("care writes stop at 120 per account per day", async () => {
  const allow = careLimiter();
  const headers = new Headers({ "x-real-ip": "203.0.113.1" });
  for (let i = 0; i < 120; i++) assert.equal(await allow("care", "keeper", headers), true);
  assert.equal(await allow("care", "keeper", headers), false);
});

test("care writes stop at 400 per IP per day across accounts", async () => {
  const allow = careLimiter();
  const headers = new Headers({ "x-real-ip": "203.0.113.2" });
  for (let i = 0; i < 400; i++) assert.equal(await allow("care", `keeper-${i}`, headers), true);
  assert.equal(await allow("care", "keeper-overflow", headers), false);
});

test("signed-in email verification has its own three-per-account bucket after signup traffic", async () => {
  const allow = careLimiter();
  const headers = new Headers({ "x-real-ip": "203.0.113.3" });
  for (let i = 0; i < 10; i++) {
    assert.equal(await allow("register", `signup-${i}`, headers), true);
  }
  assert.equal(await allow("register", "another-signup", headers), false);
  for (let i = 0; i < 3; i++) {
    assert.equal(await allow("verify-email", "keeper@example.test", headers), true);
  }
  assert.equal(await allow("verify-email", "keeper@example.test", headers), false);
});

test("signed-in email verification stops at 30 requests per IP across accounts", async () => {
  const allow = careLimiter();
  const headers = new Headers({ "x-real-ip": "203.0.113.4" });
  for (let i = 0; i < 30; i++) {
    assert.equal(await allow("verify-email", `keeper-${i}`, headers), true);
  }
  assert.equal(await allow("verify-email", "keeper-overflow", headers), false);
});
