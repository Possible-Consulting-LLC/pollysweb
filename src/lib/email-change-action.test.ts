import * as maintenancePolicy from './admin/maintenance-policy';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";

function actions(passwordHash: string | null, reauthAt?: number, oldAddressAllowed = true) {
  const requests: string[] = [];
  const scopes: string[] = [];
  const source = ts.transpileModule(readFileSync(new URL("../app/actions/email-change.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, FormData, process: { env: {} }, console: { error: () => undefined },
    require: (name: string) => {
      if(name==='@/lib/admin/maintenance-policy') return maintenancePolicy;
      if (name === "@/lib/mutation-boundary") return { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() };
      if (name === "zod") return { z };
      if (name === "@/lib/features/gate") return { withFeatureGate: async (_key: string, work: () => Promise<unknown>) => work() };
      if (name === "@/lib/session") return { getActionUser: async () => ({ id: "keeper-1", emailChangeReauthAt: reauthAt }) };
      if (name === "@/lib/db") return { prisma: { user: { findUnique: async () => ({ email: "old@example.test", passwordHash, emailVerified: new Date() }) } } };
      if (name === "@/lib/password-policy") return { verifyPassword: async (value: string) => value === "current-password" };
      if (name === "@/lib/rate-limit") return { RATE_LIMIT_MESSAGE: "Limited", allowAction: async (scope: string) => { scopes.push(scope); return true; } };
      if (name === "@/lib/email-delivery") return { emailDeliveryAvailable: (email: string) => email !== "old@example.test" || oldAddressAllowed };
      if (name === "@/lib/email-challenge") return {
        requestEmailChange: async (_id: string, email: string) => { requests.push(email); return "sent"; },
        confirmEmailChange: async () => true,
      };
      if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`redirect:${path}`); } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { api: exports as {
    requestEmailChangeAction?: (prev: undefined, data: FormData) => Promise<{ error?: string; success?: string }>;
    confirmEmailChangeAction?: (prev: undefined, data: FormData) => Promise<{ error?: string }>;
  }, requests, scopes };
}

function form(email: string, password?: string) {
  const data = new FormData();
  data.set("email", email);
  if (password) data.set("currentPassword", password);
  return data;
}

test("password accounts require their current password before emailing a new address", async () => {
  const f = actions("stored-hash");
  const denied = await f.api.requestEmailChangeAction?.(undefined, form("new@example.test", "wrong"));
  assert.match(denied?.error ?? "", /password/i);
  assert.deepEqual(f.requests, []);
  const accepted = await f.api.requestEmailChangeAction?.(undefined, form("New@Example.Test", "current-password"));
  assert.match(accepted?.success ?? "", /link/i);
  assert.deepEqual(f.requests, ["new@example.test"]);
  assert.deepEqual(f.scopes, ["email-change", "email-change"]);
});

test("social-only accounts require a recent provider sign-in", async () => {
  const stale = actions(null, Date.now() - 10 * 60_000);
  assert.match((await stale.api.requestEmailChangeAction?.(undefined, form("new@example.test")))?.error ?? "", /sign in again/i);
  assert.deepEqual(stale.requests, []);
  const fresh = actions(null, Date.now());
  assert.match((await fresh.api.requestEmailChangeAction?.(undefined, form("new@example.test")))?.success ?? "", /link/i);
  assert.deepEqual(fresh.requests, ["new@example.test"]);
});

test("a staging address outside the send allowlist does not block new-address confirmation", async () => {
  const f = actions("stored-hash", undefined, false);
  assert.match((await f.api.requestEmailChangeAction?.(undefined, form("new@example.test", "current-password")))?.success ?? "", /link/i);
  assert.deepEqual(f.requests, ["new@example.test"]);
});

test("confirming a valid new-address link ends at login and uses the verification limit", async () => {
  const f = actions(null);
  const data = new FormData();
  data.set("token", "a".repeat(43));
  await assert.rejects(async () => { await f.api.confirmEmailChangeAction?.(undefined, data); }, /redirect:\/login\?emailChanged=1/);
  assert.deepEqual(f.scopes, ["verify-email"]);
});
