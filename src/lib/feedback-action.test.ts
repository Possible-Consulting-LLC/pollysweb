import * as maintenancePolicy from './admin/maintenance-policy';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { z } from "zod";
import { feedbackMailConfig } from "./feedback-delivery";

test("staging feedback sends through its dedicated key to the approved inbox", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../app/actions/feedback.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const keys: string[] = [];
  const sent: Array<{ from: string; to: string[]; replyTo?: string; text: string }> = [];
  class FakeResend {
    constructor(key: string) { keys.push(key); }
    emails = { send: async (message: { from: string; to: string[]; replyTo?: string; text: string }) => {
      sent.push(message);
      return { error: null };
    } };
  }
  const env = {
    SPOODLY_ENV: "staging", AUTH_URL: "https://long-project.vercel.app",
    EMAIL_VERIFICATION_ORIGIN: "https://staging.example",
    EMAIL_RESEND_API_KEY: "staging-key", EMAIL_FROM_EMAIL: "hello@example.com",
    EMAIL_ALLOWED_RECIPIENTS: "support@example.com",
    FEEDBACK_TO_EMAIL: "support@example.com", RESEND_API_KEY: "live-key-must-not-be-used",
  };
  const dependencies: Record<string, unknown> = {
    '@/lib/admin/maintenance-policy':maintenancePolicy, '@/lib/admin/maintenance-access':{guardMaintenance:async()=>{},prepareCredentialChange:async()=>{}}, '@/lib/maintenance-write':{},
    "@/lib/mutation-boundary": { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    "@/lib/rate-limit": { allowAction: async () => true },
    "next/headers": { headers: async () => new Headers() },
    resend: { Resend: FakeResend }, zod: { z },
    "@/lib/session": { getActionUser: async () => ({ id: "keeper-1", name: "Keeper", email: "keeper@example.com" }) },
    "@/lib/staging-guard": { isStaging: () => true },
    "@/lib/feedback-delivery": { feedbackMailConfig },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, FormData, process: { env }, console,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  const submit = exports.submitFeedbackAction as (previous: undefined, form: FormData) => Promise<{ error?: string; success?: string }>;
  const form = new FormData();
  form.set("category", "feedback");
  form.set("message", "Please test this feedback email.");
  const result = await submit(undefined, form);
  assert.equal(result.error, undefined);
  assert.match(result.success ?? "", /on its way/);
  assert.deepEqual(keys, ["staging-key"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "hello@example.com");
  assert.deepEqual(Array.from(sent[0].to), ["support@example.com"]);
  assert.equal(sent[0].replyTo, "keeper@example.com");
  assert.match(sent[0].text, /Please test this feedback email/);
});

test('unconfigured staging feedback exits after context admission before account lookup or email requests', async () => {
  const code = ts.transpileModule(readFileSync(new URL('../app/actions/feedback.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let admitted = false;
  const dependencies: Record<string, unknown> = {
    '@/lib/admin/maintenance-policy':maintenancePolicy, '@/lib/admin/maintenance-access':{guardMaintenance:async()=>{},prepareCredentialChange:async()=>{}}, '@/lib/maintenance-write':{},
    '@/lib/mutation-boundary': { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => { admitted = true; return work(); } },
    '@/lib/rate-limit': {}, 'next/headers': {}, zod: { z },
    resend: { Resend: class { constructor() { assert.fail('No email client for disabled feedback'); } } },
    '@/lib/session': { getActionUser: async () => assert.fail('No account lookup for disabled feedback') },
    '@/lib/staging-guard': { isStaging: () => true }, '@/lib/feedback-delivery': { feedbackMailConfig },
  };
  const exports = {};
  runInNewContext(code, { exports, process: { env: { SPOODLY_ENV: 'staging' } }, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const result = await (exports as typeof import('../app/actions/feedback')).submitFeedbackAction(undefined, new FormData());
  assert.equal(admitted, true);
  assert.match(result.error!, /Feedback email isn’t configured for staging/);
});
