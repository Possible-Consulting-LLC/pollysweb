import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { configuredSocialProviders } from "./social-auth";

function socialActions(session: { id?: string } | null) {
  const source = readFileSync(new URL("../app/actions/social-auth.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const originalRequire = createRequire(import.meta.url);
  const actionModule = { exports: {} as {
    startSocialSignIn: (data: FormData) => Promise<void>;
    linkSocialProvider: (data: FormData) => Promise<void>;
    reauthenticateForEmailChange?: (data: FormData) => Promise<void>;
  } };
  const signIns: unknown[][] = [];
  const signOuts: unknown[][] = [];
  const authOrder: string[] = [];
  const redirects: string[] = [];
  runInNewContext(outputText, {
    module: actionModule, exports: actionModule.exports, FormData,
    process: { env: { AUTH_GOOGLE_ID: "client", AUTH_GOOGLE_SECRET: "secret" } },
    require: (id: string) => {
      if (id === "@/lib/mutation-boundary") return { withMutation: async (_context: unknown, _kind: unknown, _action: unknown, work: () => Promise<unknown>) => work() };
      if (id === "@/lib/features/gate") return { withFeatureGate: async (_key: string, work: () => Promise<unknown>) => work() };
      if (id === "@/lib/admin/reauth-store") return { clearAdminSocialChallenge: async () => { authOrder.push("clearChallenge"); } };
      if (id === "@/lib/social-auth") return { configuredSocialProviders };
      if (id === "@/lib/auth") return {
        signIn: async (...args: unknown[]) => { authOrder.push("signIn"); signIns.push(args); },
        signOut: async (...args: unknown[]) => { authOrder.push("signOut"); signOuts.push(args); },
      };
      if (id === "@/lib/session") return { getActionUser: async () => session };
      if (id === "@/lib/db") return { prisma: { account: { findFirst: async ({ where }: { where: { provider: string; userId: string } }) =>
        where.userId === "keeper-a" && where.provider === "google" ? { id: "linked-google" } : null } } };
      if (id === "next/navigation") return { redirect: (path: string) => { redirects.push(path); throw new Error("REDIRECT"); } };
      return originalRequire(id);
    },
  });
  return { ...actionModule.exports, signIns, signOuts, authOrder, redirects };
}

function providerForm(provider: string) {
  const data = new FormData();
  data.set("provider", provider);
  return data;
}

test("public social sign-in accepts only configured providers", async () => {
  const actions = socialActions(null);
  await actions.startSocialSignIn(providerForm("google"));
  assert.equal(actions.signIns[0]?.[0], "google");
  assert.equal((actions.signIns[0]?.[1] as { redirectTo: string }).redirectTo, "/home");
  await assert.rejects(actions.startSocialSignIn(providerForm("facebook")), /REDIRECT/);
  await assert.rejects(actions.startSocialSignIn(providerForm("credentials")), /REDIRECT/);
  assert.equal(actions.signIns.length, 1);
});

test("public social sign-in clears any existing keeper session before OAuth", async () => {
  const actions = socialActions({ id: "keeper-a" });
  await actions.startSocialSignIn(providerForm("google"));
  assert.deepEqual(actions.authOrder, ["signOut", "signIn"]);
  assert.equal(actions.signOuts.length, 1);
  assert.equal((actions.signOuts[0]?.[0] as { redirect?: boolean }).redirect, false);
});

test("linking requires a signed-in keeper and a configured provider", async () => {
  const anonymous = socialActions(null);
  await assert.rejects(anonymous.linkSocialProvider(providerForm("google")), /REDIRECT/);
  assert.equal(anonymous.signIns.length, 0);
  const signedIn = socialActions({ id: "keeper-a" });
  await signedIn.linkSocialProvider(providerForm("google"));
  assert.equal(signedIn.signIns[0]?.[0], "google");
  assert.equal((signedIn.signIns[0]?.[1] as { redirectTo: string }).redirectTo, "/settings?linked=1");
  await assert.rejects(signedIn.linkSocialProvider(providerForm("apple")), /REDIRECT/);
  assert.equal(signedIn.signIns.length, 1);
});

test("email-change reauthentication uses only a provider already linked to the signed-in keeper", async () => {
  const anonymous = socialActions(null);
  await assert.rejects(async () => { await anonymous.reauthenticateForEmailChange?.(providerForm("google")); }, /REDIRECT/);
  assert.equal(anonymous.signIns.length, 0);
  const signedIn = socialActions({ id: "keeper-a" });
  await signedIn.reauthenticateForEmailChange?.(providerForm("google"));
  assert.equal(signedIn.signIns[0]?.[0], "google");
  assert.equal((signedIn.signIns[0]?.[1] as { redirectTo: string }).redirectTo, "/settings?reauth=1");
});

test('Settings linking and email-change confirmation clear canceled admin challenge before OAuth', async () => {
  const linking = socialActions({ id: 'keeper-a' });
  await linking.linkSocialProvider(providerForm('google'));
  assert.deepEqual(linking.authOrder, ['clearChallenge', 'signIn']);
  const reauth = socialActions({ id: 'keeper-a' });
  await reauth.reauthenticateForEmailChange?.(providerForm('google'));
  assert.deepEqual(reauth.authOrder, ['clearChallenge', 'signIn']);
});
