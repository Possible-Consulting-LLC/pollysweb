import * as maintenancePolicy from './admin/maintenance-policy';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function fixture(verified = true, passwordHash: string | null = "stored-hash") {
  const user = { id: "keeper-1", email: "old@example.test", emailVerified: verified ? new Date() : null as Date | null, passwordHash,
    authVersion: "auth-version", emailChangeVersion: null as string | null, adminVersion: null as string | null, accountVersion: 0 };
  let challenge: {
    id: string; tokenHash: string; email: string; previousEmail: string; userId: string;
    purpose: string; expiresAt: Date; consumedAt: Date | null; credentialSnapshot: string;
  } | null = null;
  let duplicate = false;
  let confirmationFails = false;
  let noticeFails = false;
  let raceAdminVersion = false;
  const sent: string[] = [];
  const tx = {
    user: {
      findUnique: async () => ({ ...user }),
      findFirst: async ({ where }: { where: { email: { equals: string } } }) =>
        duplicate && where.email.equals === "new@example.test" ? { id: "other" } : null,
      updateMany: async ({ where, data }: { where: { id: string; email: string; adminVersion?: string | null }; data: { email: string; emailVerified: Date; emailChangeVersion: string } }) => {
        if (where.id !== user.id || where.email !== user.email || where.adminVersion !== user.adminVersion) return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      },
    },
    pendingEmailVerification: {
      deleteMany: async () => { challenge = null; return { count: 1 }; },
      create: async ({ data }: { data: NonNullable<typeof challenge> }) => { challenge = { ...data, id: "challenge-1", consumedAt: null }; },
      findUnique: async () => challenge,
      updateMany: async ({ where, data }: { where: { id: string }; data: { consumedAt: Date } }) => {
        if (!challenge || challenge.id !== where.id || challenge.consumedAt || challenge.expiresAt <= new Date()) return { count: 0 };
        challenge.consumedAt = data.consumedAt;
        if (raceAdminVersion) user.adminVersion = "changed-during-admin-operation";
        return { count: 1 };
      },
    },
  };
  const source = ts.transpileModule(readFileSync(new URL("./email-challenge.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(source, { exports, Date, console, require: (name: string) => {
    if(name==='./admin/maintenance-access') return {guardMaintenance:async()=>{},prepareCredentialChange:async()=>{}};
    if(name==='./admin/maintenance-policy') return maintenancePolicy;
    if(name==='./maintenance-write') return {maintenanceTransaction:async(work:(tx:unknown)=>Promise<unknown>)=>work(tx)};
    if (name === "./db") return { prisma: { $transaction: async (fn: (value: unknown) => Promise<unknown>) => fn(tx), pendingEmailVerification: tx.pendingEmailVerification } };
    if (name === "./email-verification") return { CHALLENGE_MS: 30 * 60_000, createVerificationToken: () => "a".repeat(43), verificationTokenHash: (token: string) => token };
    if (name === "./email-delivery") return {
      sendEmailChangeConfirmation: async (email: string) => { sent.push(`confirm:${email}`); if (confirmationFails) throw Error("Confirmation unavailable"); },
      sendEmailChangeNotice: async (email: string) => { sent.push(`notice:${email}`); if (noticeFails) throw Error("Notice unavailable"); },
    };
    if (name === "node:crypto") return { randomUUID: () => "new-auth-version" };
    if (name === "./credential-version") return { emailChangeCredentialSnapshot: (account: { passwordHash: string | null; emailChangeVersion: string | null }) => `${account.passwordHash}:${account.emailChangeVersion}` };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const service = exports as {
    requestEmailChange?: (userId: string, email: string) => Promise<string>;
    confirmEmailChange?: (token: string) => Promise<boolean>;
  };
  return { user, service, sent, getChallenge: () => challenge, setDuplicate: () => { duplicate = true; }, expire: () => { if (challenge) challenge.expiresAt = new Date(0); },
    failConfirmation: () => { confirmationFails = true; }, failNotice: () => { noticeFails = true; }, raceAdminChange: () => { raceAdminVersion = true; } };
}

test("new address stays pending until its link is confirmed and then revokes sessions", async () => {
  const f = fixture();
  assert.equal(await f.service.requestEmailChange?.("keeper-1", "new@example.test"), "sent");
  assert.equal(f.user.email, "old@example.test");
  assert.equal(f.getChallenge()?.previousEmail, "old@example.test");
  assert.deepEqual(f.sent, ["confirm:new@example.test", "notice:old@example.test"]);
  assert.equal(await f.service.confirmEmailChange?.("a".repeat(43)), true);
  assert.equal(f.user.email, "new@example.test");
  assert.ok(f.user.emailVerified instanceof Date);
  assert.equal(f.user.emailChangeVersion, "new-auth-version");
  assert.equal(await f.service.confirmEmailChange?.("a".repeat(43)), false);
});

test("unverified old address is not needed to correct a typo", async () => {
  const f = fixture(false);
  assert.equal(await f.service.requestEmailChange?.("keeper-1", "new@example.test"), "sent");
  assert.deepEqual(f.sent, ["confirm:new@example.test"]);
});

test("a social-only account with an unverified provider email sends no old-address notice", async () => {
  const f = fixture(false, null);
  assert.equal(await f.service.requestEmailChange?.("keeper-1", "new@example.test"), "sent");
  assert.deepEqual(f.sent, ["confirm:new@example.test"]);
});

test("a password change invalidates a pending address change", async () => {
  const f = fixture();
  await f.service.requestEmailChange?.("keeper-1", "new@example.test");
  f.user.passwordHash = "new-password-hash";
  assert.equal(await f.service.confirmEmailChange?.("a".repeat(43)), false);
  assert.equal(f.user.email, "old@example.test");
});

test("an old-address notice failure does not cancel a delivered new-address confirmation", async () => {
  const f = fixture();
  f.failNotice();
  assert.equal(await f.service.requestEmailChange?.("keeper-1", "new@example.test"), "sent");
  assert.deepEqual(f.sent, ["confirm:new@example.test", "notice:old@example.test"]);
  assert.ok(f.getChallenge());
});

test("a failed confirmation send clears the pending link and does not send an old-address notice", async () => {
  const f = fixture();
  f.failConfirmation();
  await assert.rejects(() => f.service.requestEmailChange!("keeper-1", "new@example.test"));
  assert.deepEqual(f.sent, ["confirm:new@example.test"]);
  assert.equal(f.getChallenge(), null);
});

test("an expired link or newly occupied address cannot change the login email", async () => {
  const f = fixture();
  await f.service.requestEmailChange?.("keeper-1", "new@example.test");
  f.expire();
  assert.equal(await f.service.confirmEmailChange?.("a".repeat(43)), false);
  assert.equal(f.user.email, "old@example.test");
  await f.service.requestEmailChange?.("keeper-1", "new@example.test");
  f.setDuplicate();
  assert.equal(await f.service.confirmEmailChange?.("a".repeat(43)), false);
  assert.equal(f.user.email, "old@example.test");
});

test("an admin suspension or role change invalidates an email confirmation racing it", async () => {
  const f = fixture();
  await f.service.requestEmailChange?.("keeper-1", "new@example.test");
  f.raceAdminChange();
  assert.equal(await f.service.confirmEmailChange?.("a".repeat(43)), false);
  assert.equal(f.user.email, "old@example.test");
});
