import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as versions from "./credential-version";
import * as passwordPolicy from "./password-policy";
import { z } from "zod";
import { PrismaAdapter } from "@auth/prisma-adapter";
import * as socialAuth from "./social-auth";
import { canUsePasswordAccount } from "./email-verification";

type Token = { sub?: string; credentialVersion?: unknown; emailChangeReauthAt?: number };
type Config = {
  pages: { signIn: string; error: string };
  callbacks: {
    signIn(input: {user:{id:string;email?:string};account:{type:string;provider:string;providerAccountId:string};profile?:unknown}):Promise<boolean|string>;
    jwt(input: { token: Token; user?: { id: string; email?: string }; account?: { provider?: string; providerAccountId?: string; type: string }; profile?: { email?: string; email_verified?: unknown } }): Promise<Token | null>;
    session(input: { session: { user: { id: string; email?: string; emailChangeReauthAt?: number } }; token: Token }): Promise<{ user: { id: string; email?: string; emailChangeReauthAt?: number } }>;
  };
  providers: { authorize(input: { email: string; password: string }, request: { headers: Headers }): Promise<unknown> }[];
  adapter: {
    getUserByEmail(email: string): Promise<{ id: string; email: string } | null>;
    createUser(user: { email: string }): Promise<{ email: string }>;
    updateUser(user: { id: string; name: string }): Promise<unknown>;
    linkAccount(account: { userId: string; provider: string }): Promise<unknown>;
  };
};

test("Auth.js sends OAuth access denials to the app's safe error page", async () => {
  const { config } = await fixture();
  assert.equal(config.pages.error, "/login");
});

// Execute real callbacks/actions while isolating framework startup and external I/O.
function loadModule(path: string, dependencies: Record<string, unknown>, env = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, unknown> = {};
  dependencies['./admin/maintenance-access'] ??= {allowMaintenanceLogin:async()=>true};
  dependencies['@/lib/admin/maintenance-access'] ??= {prepareCredentialChange:async()=>{}};
  dependencies['@/lib/admin/maintenance-policy'] ??= {MaintenanceError:class extends Error{}};
  dependencies['@/lib/maintenance-write'] ??= {};
  runInNewContext(source, { exports, process: { env }, console, FormData,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const secret = "session-test-secret";
const legacyHash = "$2b$10$abcdefghijklmnopqrstuuG5pn.zLyNZSWcoQs05VgB/VZ7P7wLni";
const fingerprint = (source: string) => createHmac("sha256", secret).update(`session-credentials:${source}`).digest("hex");

async function fixture(passwordHash: string | null = null, email = "keeper@example.test", activation?: string) {
  const keeper = { id: "keeper-a", email, name: "Keeper", passwordHash, emailVerified: null as Date | null, authVersion: "version-one", emailChangeVersion: null as string | null, adminVersion: null as string | null, suspendedAt: null as Date | null, deletingAt: null as Date | null };
  let maintenance=false;
  let cutoffOnWrite = false;
  let accounts = 0;
  const gateConnections: unknown[] = [];
  let passwordCalls = 0;
  let writes = 0;
  const createdUsers: Array<{ email: string }> = [];
  const lookups: string[] = [];
  const prisma = { user: {
    findUnique: async ({ where, select }: { where: { id?: string; email?: string }; select?: Record<string, boolean> }) => {
      lookups.push(where.id ?? where.email ?? "");
      if (where.id !== keeper.id && where.email !== keeper.email) return null;
      if (!select) return { ...keeper };
      return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, keeper[key as keyof typeof keeper]]));
    },
    findFirst: async ({ where }: { where: { email: { equals: string; mode: string } } }) =>
      where.email.mode === "insensitive" && where.email.equals.toLowerCase() === keeper.email.toLowerCase() ? { ...keeper } : null,
    create: async ({ data }: { data: { email: string } }) => {
      createdUsers.push(data);
      if (cutoffOnWrite) maintenance = true;
      return data;
    },
    update: async ({ data }: { data: { name: string } }) => { keeper.name = data.name; if (cutoffOnWrite) maintenance = true; return keeper; },
    updateMany: async ({ where, data }: { where?: { id?: string; emailVerified?: null; email?: { equals: string; mode: string } }; data?: { emailVerified?: Date } } = {}) => {
      writes++;
      if (where?.id === keeper.id && where.emailVerified === null && where.email?.mode === "insensitive" &&
          where.email.equals.toLowerCase() === keeper.email.toLowerCase() && data?.emailVerified) {
        keeper.emailVerified = data.emailVerified;
        return { count: 1 };
      }
      return { count: 0 };
    },
  }, account: { create: async () => { accounts++; if (cutoffOnWrite) maintenance = true; } },
  $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
    const before = { name: keeper.name, users: createdUsers.length, accounts };
    const tx = { user: prisma.user, account: prisma.account };
    try { return await work(tx); }
    catch (error) { keeper.name = before.name; createdUsers.length = before.users; accounts = before.accounts; throw error; }
  } };
  const policy = { ...passwordPolicy, verifyPassword: async () => { passwordCalls++; return true; } };
  let configure!: (request?: Request) => Promise<Config>;
  loadModule("./auth.ts", {
    "./admin/maintenance-access":{allowMaintenanceLogin:async(_id: unknown, db: unknown)=>{ gateConnections.push(db); return !maintenance; }},
    "./admin/reauth-store": { authorizeAdminSocialReauth: async () => true, completeAdminSocialReauth: async () => true, revokeAdminProof: async () => {} },
    "next-auth": (value: typeof configure) => { configure = value; return {}; },
    "next/headers": { cookies: async () => ({get: () => undefined}), headers: async () => new Headers({ "x-forwarded-proto": "https" }) },
    "@auth/prisma-adapter": { PrismaAdapter }, "./social-auth": socialAuth,
    "next-auth/providers/credentials": (value: unknown) => value,
    zod: { z }, "./db": { prisma }, "./credential-version": versions,
    "./rate-limit": { allowAction: async () => true }, "./password-policy": policy,
    "./email-verification": { canUsePasswordAccount },
  }, { AUTH_SECRET: secret, PASSWORD_EMAIL_VERIFICATION_GRACE_START: activation });
  const config = await configure();
  const actions = loadModule("../app/actions/auth.ts", {
    "@/lib/mutation-boundary": { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() },
    "@/lib/rate-limit": { allowAction: async () => true }, "@/lib/password-policy": policy,
    "@/lib/utils": {}, "next-auth": { AuthError: Error }, "next/navigation": {},
    "@/lib/registration-validation": {}, "@/lib/auth": {}, "@/lib/db": { prisma },
    "@/lib/session": { getActionUser: async () => ({ id: keeper.id }) },
    "@/lib/features/gate": { withFeatureGate: async (_key: string, work: () => Promise<unknown>) => work() },
    "@/lib/constants": {}, "@/lib/uploads": {}, "@/lib/spider-slots": {},
    "@/lib/write-validation": {}, "next/cache": {},
    "next/dist/client/components/redirect-error": {},
    "zod": { z }, "@/lib/email-delivery": {}, "@/lib/email-challenge": {},
  }) as { updatePasswordAction(previous: undefined, form: FormData): Promise<{ error?: string; success?: string }> };
  return { cutoffOnWrite: () => { cutoffOnWrite = true; }, gateConnections, accounts: () => accounts, close:()=>maintenance=true, keeper, config, actions, lookups, createdUsers, passwordCalls: () => passwordCalls, writes: () => writes };
}

test("OAuth email lookup finds an existing keeper despite provider casing", async () => {
  const f = await fixture();
  assert.equal((await f.config.adapter.getUserByEmail("KEEPER@Example.Test"))?.id, f.keeper.id);
});

test("password login and existing JWT are blocked after the activation grace expires", async () => {
  const f = await fixture(legacyHash, "keeper@example.test", "2026-09-01T00:00:00Z");
  assert.equal(await f.config.providers[0].authorize({ email: f.keeper.email, password: "spider" }, { headers: new Headers() }), null);
  assert.equal(await f.config.callbacks.jwt({ token: { sub: f.keeper.id, credentialVersion: fingerprint(legacyHash) } }), null);
  f.keeper.emailVerified = new Date();
  assert.ok(await f.config.providers[0].authorize({ email: f.keeper.email, password: "spider" }, { headers: new Headers() }));
});

test("OAuth account creation stores canonical lowercase email", async () => {
  const f = await fixture();
  const user = await f.config.adapter.createUser({ email: "New.Keeper@Example.Test" });
  assert.equal(user.email, "new.keeper@example.test");
  assert.equal(f.createdUsers[0]?.email, "new.keeper@example.test");
});

test("credentials can sign in to a legacy mixed-case email account", async () => {
  const f = await fixture(legacyHash, "Keeper@Example.Test");
  const user = await f.config.providers[0].authorize(
    { email: "keeper@example.test", password: "spider" },
    { headers: new Headers() },
  ) as { id: string; email: string } | null;
  assert.equal(user?.id, f.keeper.id);
  assert.equal(user?.email, "Keeper@Example.Test");
  assert.equal(f.passwordCalls(), 1);
});

test("existing password JWT survives social rollout and fails after password rotation", async () => {
  const f = await fixture(legacyHash);
  const token = { sub: f.keeper.id, credentialVersion: fingerprint(legacyHash) };
  assert.ok(await f.config.callbacks.jwt({ token }));
  f.keeper.passwordHash = "new-password-hash";
  assert.equal(await f.config.callbacks.jwt({ token }), null);
});

test("confirming an email change revokes an existing password session and new credentials get a fresh fingerprint", async () => {
  const f = await fixture(legacyHash);
  const previous = { sub: f.keeper.id, credentialVersion: fingerprint(legacyHash) };
  assert.ok(await f.config.callbacks.jwt({ token: previous }));
  f.keeper.emailChangeVersion = "changed-version";
  assert.equal(await f.config.callbacks.jwt({ token: previous }), null);
  const signedIn = await f.config.providers[0].authorize({ email: f.keeper.email, password: "spider" }, { headers: new Headers() }) as { credentialVersion?: string } | null;
  assert.equal(signedIn?.credentialVersion, fingerprint(`${legacyHash}:email:changed-version`));
});

test("social sign-in provides a recent reauthentication proof to the signed-in keeper", async () => {
  const f = await fixture();
  const token = await f.config.callbacks.jwt({ token: {}, user: { id: f.keeper.id }, account: { provider: "google", type: "oidc" } });
  assert.ok(token?.emailChangeReauthAt && Date.now() - token.emailChangeReauthAt < 5_000);
  const session = await f.config.callbacks.session({ session: { user: { id: f.keeper.id } }, token: token! });
  assert.equal(session.user.emailChangeReauthAt, token?.emailChangeReauthAt);
});

for (const provider of ["google", "facebook"] as const) {
  test(`${provider} sign-in marks a matching provider email verified for admin eligibility`, async () => {
    const f = await fixture();
    const profile = provider === "google"
      ? { email: f.keeper.email.toUpperCase(), email_verified: true }
      : { email: f.keeper.email.toUpperCase() };
    assert.equal(f.keeper.emailVerified, null);
    assert.ok(await f.config.callbacks.jwt({
      token: {}, user: { id: f.keeper.id, email: f.keeper.email },
      account: { provider, providerAccountId: `${provider}-id`, type: provider === "google" ? "oidc" : "oauth" }, profile,
    }));
    assert.ok(f.keeper.emailVerified);
  });
}

test("social sign-in never verifies a keeper from a mismatched provider email", async () => {
  const f = await fixture();
  assert.ok(await f.config.callbacks.jwt({
    token: {}, user: { id: f.keeper.id, email: f.keeper.email },
    account: { provider: "google", providerAccountId: "google-id", type: "oidc" },
    profile: { email: "other@example.test", email_verified: true },
  }));
  assert.equal(f.keeper.emailVerified, null);
});

test("first OAuth JWT loads the keeper and issues its current credential version", async () => {
  const f = await fixture();
  const token = await f.config.callbacks.jwt({ token: {}, user: { id: f.keeper.id }, account: { provider: "google", type: "oidc" } });
  assert.equal(token?.credentialVersion, fingerprint("oauth:keeper-a:version-one"));
  assert.ok(token);
  assert.equal(f.lookups[0], f.keeper.id);
  assert.ok(await f.config.callbacks.jwt({ token }));
  f.keeper.authVersion = "version-two";
  assert.equal(await f.config.callbacks.jwt({ token }), null);
});

test("OAuth sign-in to a password account preserves the password fingerprint", async () => {
  const f = await fixture(legacyHash);
  const token = await f.config.callbacks.jwt({ token: {}, user: { id: f.keeper.id }, account: { provider: "google", type: "oidc" } });
  assert.equal(token?.credentialVersion, fingerprint(legacyHash));
});

test("another keeper's social fingerprint never validates and missing keepers fail closed", async () => {
  const f = await fixture();
  assert.equal(await f.config.callbacks.jwt({ token: { sub: "keeper-a", credentialVersion: fingerprint("oauth:keeper-b:version-one") } }), null);
  assert.equal(await f.config.callbacks.jwt({ token: {}, user: { id: "missing" }, account: { type: "oauth" } }), null);
});

test("credentials reject provider-only accounts before password verification", async () => {
  const f = await fixture();
  const result = await f.config.providers[0].authorize({ email: f.keeper.email, password: "spider" }, { headers: new Headers() });
  assert.equal(result, null);
  assert.equal(f.passwordCalls(), 0);
});

test("password change explains provider-only accounts without password verification or writes", async () => {
  const f = await fixture();
  const form = new FormData();
  form.set("currentPassword", "spider");
  form.set("newPassword", "a new spider passphrase");
  form.set("confirmPassword", "a new spider passphrase");
  const result = await f.actions.updatePasswordAction(undefined, form);
  assert.match(result.error ?? "", /social|provider|Google|Apple/i);
  assert.equal(f.passwordCalls(), 0);
  assert.equal(f.writes(), 0);
});

for (const field of ['suspendedAt', 'deletingAt'] as const) {
  test(field + ' blocks password sign-in and existing or new OAuth JWTs', async () => {
    const f = await fixture(legacyHash);
    f.keeper[field] = new Date();
    assert.equal(await f.config.providers[0].authorize({ email: f.keeper.email, password: 'spider' }, { headers: new Headers() }), null);
    assert.equal(await f.config.callbacks.jwt({ token: { sub: f.keeper.id, credentialVersion: fingerprint(legacyHash) } }), null);
    assert.equal(await f.config.callbacks.jwt({ token: {}, user: { id: f.keeper.id }, account: { type: 'oauth' } }), null);
  });
}
test('admin credential rotation rejects old password JWT and issues valid fresh login', async () => {
  const f = await fixture(legacyHash);
  f.keeper.adminVersion = 'role-change';
  assert.equal(await f.config.callbacks.jwt({ token: { sub: f.keeper.id, credentialVersion: fingerprint(legacyHash) } }), null);
  const user = await f.config.providers[0].authorize({ email: f.keeper.email, password: 'spider' }, { headers: new Headers() }) as { credentialVersion: string };
  assert.equal(user.credentialVersion, fingerprint(legacyHash + ':admin:role-change'));
  assert.ok(await f.config.callbacks.jwt({ token: { sub: f.keeper.id, credentialVersion: user.credentialVersion } }));
});

test('maintenance denies verified credentials and OAuth completion and late adapter writes',async()=>{
 const f=await fixture(legacyHash);f.keeper.emailVerified=new Date();f.close();
 assert.equal(await f.config.providers[0].authorize({email:f.keeper.email,password:'spider'},{headers:new Headers()}),null);
 assert.equal(await f.config.callbacks.jwt({token:{},user:{id:f.keeper.id},account:{type:'oauth'}}),null);
 await assert.rejects(f.config.adapter.createUser({email:'new@example.test'}),/Maintenance/);
 assert.equal(f.createdUsers.length,0);
});

for (const operation of ['createUser', 'updateUser', 'linkAccount'] as const) {
  test('Auth.js ' + operation + ' rolls back when cutoff arrives during its write', async () => {
    const f = await fixture();
    f.cutoffOnWrite();
    const write = () => operation === 'createUser' ? f.config.adapter.createUser({ email: 'new@example.test' })
      : operation === 'updateUser' ? f.config.adapter.updateUser({ id: f.keeper.id, name: 'Changed' })
      : f.config.adapter.linkAccount({ userId: f.keeper.id, provider: 'google' });
    await assert.rejects(write(), /Maintenance/);
    assert.equal(f.createdUsers.length, 0);
    assert.equal(f.keeper.name, 'Keeper');
    assert.equal(f.accounts(), 0);
    assert.equal(f.gateConnections.length, 2);
    assert.ok(f.gateConnections[0], 'pre-check must use transaction connection');
    assert.equal(f.gateConnections[0], f.gateConnections[1], 'final guard must share the write transaction');
  });
}

test('Auth.js adapter updates and account links commit when both gates allow', async () => {
  const f = await fixture();
  await f.config.adapter.updateUser({ id: f.keeper.id, name: 'Updated keeper' });
  await f.config.adapter.linkAccount({ userId: f.keeper.id, provider: 'google' });
  assert.equal(f.keeper.name, 'Updated keeper');
  assert.equal(f.accounts(), 1);
});
