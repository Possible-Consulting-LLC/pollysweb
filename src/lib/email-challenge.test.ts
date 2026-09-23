import * as maintenancePolicy from './admin/maintenance-policy';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function fixture(purpose: "register" | "legacy", expired = false) {
  const token = "a".repeat(43);
  const challenge = {
    id: "challenge-1", tokenHash: token, email: "keeper@example.com", name: "Keeper",
    userId: purpose === "legacy" ? "user-1" : null, purpose,
    expiresAt: new Date(Date.now() + (expired ? -1 : 60_000)), consumedAt: null as Date | null,
  };
  const created: Array<{ email: string; emailVerified: Date }> = [];
  let verified = false;
  let removed = false;
  const tx = {
    pendingEmailVerification: {
      findUnique: async () => removed ? null : challenge,
      delete: async ({ where }: { where: { id: string } }) => {
        assert.equal(where.id, challenge.id); removed = true; return challenge;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: { consumedAt: Date } }) => {
        if (where.id !== challenge.id || challenge.consumedAt || challenge.expiresAt <= new Date()) return { count: 0 };
        challenge.consumedAt = data.consumedAt;
        return { count: 1 };
      },
    },
    user: {
      findFirst: async () => null,
      create: async ({ data }: { data: { email: string; emailVerified: Date } }) => { created.push(data); },
      updateMany: async () => { verified = true; return { count: 1 }; },
    },
  };
  const source = ts.transpileModule(readFileSync(new URL("./email-challenge.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, console, Date, require: (name: string) => {
    if(name==='./admin/maintenance-access') return {guardMaintenance:async()=>{},prepareCredentialChange:async()=>{}};
    if(name==='./admin/maintenance-policy') return maintenancePolicy;
    if(name==='./maintenance-write') return {maintenanceTransaction:async(work:(tx:unknown)=>Promise<unknown>)=>work(tx)};
    if (name === "./db") return { prisma: { $transaction: async (fn: (value: unknown) => Promise<unknown>) => fn(tx) } };
    if (name === "./email-verification") return { verificationTokenHash: (value: string) => value };
    if (name === "./email-delivery") return {};
    if (name === "./credential-version") return { emailChangeCredentialSnapshot: () => "unused-in-these-cases" };
    if (name === "node:crypto") return { randomUUID: () => "unused-in-these-cases" };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return { token, challenge, created, verified: () => verified, service: exports as {
    completeNewEmailRegistration(token: string, hash: string): Promise<string | null>;
    verifyExistingEmail(token: string): Promise<boolean>;
  } };
}

test("registration challenge creates a verified user once", async () => {
  const f = fixture("register");
  assert.equal(await f.service.completeNewEmailRegistration(f.token, "password-hash"), "keeper@example.com");
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].email, "keeper@example.com");
  assert.ok(f.created[0].emailVerified instanceof Date);
  assert.equal(await f.service.completeNewEmailRegistration(f.token, "password-hash"), null);
  assert.equal(f.created.length, 1);
});

test("expired registration challenge creates no account", async () => {
  const f = fixture("register", true);
  assert.equal(await f.service.completeNewEmailRegistration(f.token, "password-hash"), null);
  assert.equal(f.created.length, 0);
});

test("legacy challenge verifies once and does not create a new account", async () => {
  const f = fixture("legacy");
  assert.equal(await f.service.verifyExistingEmail(f.token), true);
  assert.equal(f.verified(), true);
  assert.equal(f.created.length, 0);
  assert.equal(await f.service.verifyExistingEmail(f.token), false);
});
