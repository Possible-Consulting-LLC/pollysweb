import * as maintenancePolicy from './admin/maintenance-policy';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { z } from "zod";

test("registration sends a challenge and never creates a user or stores a password", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../app/actions/auth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const issued: Array<{ email: string; name?: string }> = [];
  const rateLimitActions: string[] = [];
  const dependencies: Record<string, unknown> = {
    '@/lib/admin/maintenance-policy':maintenancePolicy, '@/lib/admin/maintenance-access':{guardMaintenance:async()=>{},prepareCredentialChange:async()=>{}}, '@/lib/maintenance-write':{},
    "@/lib/mutation-boundary": { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    "@/lib/rate-limit": { allowAction: async (action: string) => { rateLimitActions.push(action); return true; } },
    "@/lib/password-policy": {}, "@/lib/utils": {}, "next-auth": { AuthError: Error },
    "next/navigation": {}, "@/lib/registration-validation": { authSchema: { safeParse: () => ({ success: true, data: { email: "keeper@example.test", password: "wrong-password" } }) } }, "@/lib/auth": { signIn: async () => { throw new Error("credentials rejected"); } },
    "@/lib/db": { prisma: { user: { create: async () => { throw new Error("user created too early"); }, findUnique: async () => ({ email: "keeper@example.test", passwordHash: "hash", emailVerified: null }) } } },
    "@/lib/session": { getActionUser: async () => ({ id: "user-1" }) }, "@/lib/constants": {}, "@/lib/uploads": {},
    "@/lib/spider-slots": {}, "@/lib/write-validation": {}, "next/cache": {},
    "next/dist/client/components/redirect-error": {}, "zod": { z },
    "@/lib/email-delivery": { emailDeliveryAvailable: () => true },
    "@/lib/email-challenge": { GENERIC_EMAIL_RESPONSE: "Check your inbox.", issueEmailChallenge: async (email: string, name?: string) => { if (email === "fail@example.test") throw new Error("mail unavailable"); issued.push({ email, name }); } },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, FormData, console: { error: () => undefined }, process: { env: { DATABASE_URL: "configured" } },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  const registerAction = exports.registerAction as (previous: undefined, form: FormData) => Promise<{ error?: string; success?: string }>;
  const form = new FormData();
  form.set("email", "Keeper@Example.test");
  form.set("name", "Keeper");
  form.set("password", "should never be read or stored");
  const result = await registerAction(undefined, form);
  assert.equal(result.success, "Check your inbox.");
  assert.deepEqual(issued, [{ email: "keeper@example.test", name: "Keeper" }]);
  const failedDelivery = new FormData();
  failedDelivery.set("email", "fail@example.test");
  assert.equal((await registerAction(undefined, failedDelivery)).success, result.success);
  const requestMyVerification = exports.requestMyEmailVerificationAction as (previous: undefined, form: FormData) => Promise<{ success?: string }>;
  assert.equal((await requestMyVerification(undefined, new FormData())).success, result.success);
  assert.deepEqual(issued.at(-1), { email: "keeper@example.test", name: undefined });
  assert.deepEqual(rateLimitActions, ["register", "register", "verify-email"]);
  const loginAction = exports.loginAction as (previous: undefined, form: FormData) => Promise<{ error?: string }>;
  assert.match((await loginAction(undefined, new FormData())).error ?? "", /verif/i);
});

test("verified signup signs in with the new password and opens Home", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../app/actions/auth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const redirects: string[] = [];
  const signIns: Array<{ provider: string; email: string; password: string }> = [];
  const dependencies: Record<string, unknown> = {
    '@/lib/admin/maintenance-policy':maintenancePolicy, '@/lib/admin/maintenance-access':{guardMaintenance:async()=>{},prepareCredentialChange:async()=>{}}, '@/lib/maintenance-write':{},
    "@/lib/mutation-boundary": { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    "@/lib/rate-limit": { allowAction: async () => true },
    "@/lib/password-policy": { newPasswordSchema: { safeParse: () => ({ success: true }) }, hashNewPassword: async () => "hashed-password" },
    "@/lib/utils": {}, "next-auth": { AuthError: Error },
    "next/navigation": { redirect: (path: string) => { redirects.push(path); throw new Error(`redirect:${path}`); } },
    "@/lib/registration-validation": {},
    "@/lib/auth": { signIn: async (provider: string, options: { email: string; password: string }) => { signIns.push({ provider, email: options.email, password: options.password }); } },
    "@/lib/db": {}, "@/lib/session": {}, "@/lib/constants": {}, "@/lib/uploads": {},
    "@/lib/spider-slots": {}, "@/lib/write-validation": {}, "next/cache": {},
    "next/dist/client/components/redirect-error": { isRedirectError: (error: Error) => error.message.startsWith("redirect:") },
    "zod": { z }, "@/lib/email-delivery": {},
    "@/lib/email-challenge": { completeNewEmailRegistration: async () => "keeper@example.test" },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, FormData, console: { error: () => undefined }, process: { env: {} },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  const complete = exports.completeRegistrationAction as (previous: undefined, form: FormData) => Promise<{ error?: string; success?: string }>;
  const form = new FormData();
  form.set("token", "a".repeat(43));
  form.set("password", "a long new password");
  form.set("confirmPassword", "a long new password");
  await assert.rejects(complete(undefined, form), /redirect:\/home/);
  assert.equal(redirects.at(-1), "/home");
  assert.deepEqual(signIns, [{ provider: "credentials", email: "keeper@example.test", password: "a long new password" }]);
});

test("a created account whose session fails goes to Login instead of a dead-end message", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../app/actions/auth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    '@/lib/admin/maintenance-policy':maintenancePolicy, '@/lib/admin/maintenance-access':{guardMaintenance:async()=>{},prepareCredentialChange:async()=>{}}, '@/lib/maintenance-write':{},
    "@/lib/mutation-boundary": { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    "@/lib/rate-limit": { allowAction: async () => true },
    "@/lib/password-policy": { newPasswordSchema: { safeParse: () => ({ success: true }) }, hashNewPassword: async () => "hashed-password" },
    "@/lib/utils": {}, "next-auth": { AuthError: Error },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/registration-validation": {}, "@/lib/auth": { signIn: async () => { throw new Error("session unavailable"); } },
    "@/lib/db": {}, "@/lib/session": {}, "@/lib/constants": {}, "@/lib/uploads": {},
    "@/lib/spider-slots": {}, "@/lib/write-validation": {}, "next/cache": {},
    "next/dist/client/components/redirect-error": { isRedirectError: (error: Error) => error.message.startsWith("redirect:") },
    "zod": { z }, "@/lib/email-delivery": {},
    "@/lib/email-challenge": { completeNewEmailRegistration: async () => "keeper@example.test" },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, FormData, console: { error: () => undefined }, process: { env: {} },
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  const complete = exports.completeRegistrationAction as (previous: undefined, form: FormData) => Promise<{ error?: string; success?: string }>;
  const form = new FormData();
  form.set("token", "a".repeat(43));
  form.set("password", "a long new password");
  form.set("confirmPassword", "a long new password");
  await assert.rejects(complete(undefined, form), /redirect:\/login\?created=1/);
});
