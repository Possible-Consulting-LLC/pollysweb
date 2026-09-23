import assert from "node:assert/strict";
import test from "node:test";
import { configuredSocialProviders, isSocialSignInAllowed, socialProviderVerifiedEmail, socialSignInRejectionUrl } from "./social-auth";

test("accepted Google and Facebook profiles prove only their matching keeper email", () => {
  assert.equal(socialProviderVerifiedEmail({
    account: { type: "oidc", provider: "google", providerAccountId: "google-id" },
    user: { email: "Keeper@Example.com" },
    profile: { email: "keeper@example.com", email_verified: true },
  }), true);
  assert.equal(socialProviderVerifiedEmail({
    account: { type: "oauth", provider: "facebook", providerAccountId: "facebook-id" },
    user: { email: "keeper@example.com" },
    profile: { email: "Keeper@Example.com" },
  }), true);
  assert.equal(socialProviderVerifiedEmail({
    account: { type: "oidc", provider: "google", providerAccountId: "google-id" },
    user: { email: "keeper@example.com" },
    profile: { email: "other@example.com", email_verified: true },
  }), false);
  assert.equal(socialProviderVerifiedEmail({
    account: { type: "oidc", provider: "google", providerAccountId: "google-id" },
    user: { email: "keeper@example.com" },
    profile: { email: "keeper@example.com", email_verified: false },
  }), false);
  assert.equal(socialProviderVerifiedEmail({
    account: { type: "oauth", provider: "facebook", providerAccountId: "facebook-id" },
    user: { email: "keeper@example.com" },
    profile: {},
  }), false);
});

test("Facebook's missing email routes to its actionable account-creation error", () => {
  assert.equal(socialSignInRejectionUrl("facebook", undefined), "/login?error=FacebookEmailUnavailable");
  assert.equal(socialSignInRejectionUrl("facebook", "not-an-email"), "/login?error=FacebookEmailUnavailable");
  assert.equal(socialSignInRejectionUrl("facebook", "keeper@example.com"), null);
});

for (const [provider, prefix] of [["google", "GOOGLE"], ["apple", "APPLE"], ["facebook", "FACEBOOK"]] as const) {
  test(`${provider} is available only with both nonblank credentials`, () => {
    const id = `AUTH_${prefix}_ID`;
    const secret = `AUTH_${prefix}_SECRET`;
    assert.deepEqual(configuredSocialProviders({}), []);
    assert.deepEqual(configuredSocialProviders({ [id]: "client" }), []);
    assert.deepEqual(configuredSocialProviders({ [secret]: "secret" }), []);
    assert.deepEqual(configuredSocialProviders({ [id]: " ", [secret]: "secret" }), []);
    assert.deepEqual(configuredSocialProviders({ [id]: "client", [secret]: "\n" }), []);
    assert.deepEqual(configuredSocialProviders({ [id]: "client", [secret]: "secret" }), [provider]);
  });
  for (const email of [null, undefined, "", " ", "not-an-email", "a@", "a b@example.com"]) {
    test(`${provider} rejects new accounts with invalid email ${JSON.stringify(email)}`, async () => {
      assert.equal(await isSocialSignInAllowed({
        account: { type: "oauth", provider, providerAccountId: "new-id" },
        user: { email }, profile: { email_verified: true },
      }, async () => false), false);
    });
  }
  test(`${provider} permits a new account with a valid email`, async () => {
    assert.equal(await isSocialSignInAllowed({
      account: { type: "oidc", provider, providerAccountId: "new-id" },
      user: { email: "keeper@example.com" }, profile: { email_verified: true },
    }, async () => false), true);
  });
  test(`${provider} permits an existing link even when email is omitted`, async () => {
    assert.equal(await isSocialSignInAllowed({
      account: { type: "oauth", provider, providerAccountId: "linked-id" },
      user: {}, profile: {},
    }, async (identity) => identity.provider === provider && identity.providerAccountId === "linked-id"), true);
  });
}

for (const verified of [false, undefined, "true"]) {
  test(`new Google accounts require verified email, rejecting ${JSON.stringify(verified)}`, async () => {
    assert.equal(await isSocialSignInAllowed({
      account: { type: "oidc", provider: "google", providerAccountId: "new-id" },
      user: { email: "keeper@example.com" }, profile: { email_verified: verified },
    }, async () => false), false);
  });
}

test("explicitly unverified Google email is rejected even for an existing link", async () => {
  assert.equal(await isSocialSignInAllowed({
    account: { type: "oidc", provider: "google", providerAccountId: "linked-id" },
    user: { email: "keeper@example.com" }, profile: { email_verified: false },
  }, async () => true), false);
});

test("the same email cannot substitute for a linked provider account identity", async () => {
  assert.equal(await isSocialSignInAllowed({
    account: { type: "oauth", provider: "facebook", providerAccountId: "different-id" },
    user: {}, profile: {},
  }, async (identity) => identity.provider === "facebook" && identity.providerAccountId === "linked-id"), false);
});

test("a signed-in keeper may link Facebook even when Facebook omits email", async () => {
  assert.equal(await isSocialSignInAllowed({
    account: { type: "oauth", provider: "facebook", providerAccountId: "new-id" },
    user: {}, profile: {},
  }, async () => false, true), true);
});

test("credentials sign-in does not use the social lookup or email policy", async () => {
  assert.equal(await isSocialSignInAllowed({
    account: { type: "credentials", provider: "credentials", providerAccountId: "keeper-id" }, user: {},
  }, async () => { throw new Error("Credentials must not query social links"); }), true);
});

test("lookup errors fail closed", async () => {
  await assert.rejects(isSocialSignInAllowed({
    account: { type: "oauth", provider: "facebook", providerAccountId: "linked-id" }, user: {},
  }, async () => { throw new Error("lookup unavailable"); }), /lookup unavailable/);
});

// Exercise real Auth.js encryption and cookie parsing, including chunked HTTPS cookies.
import { encode } from "next-auth/jwt";
import { credentialFingerprint, userCredentialSource } from "./credential-version";
import { hasValidSocialLinkSession } from "./social-auth";
const sessionSecret = "social-session-test-secret";
const passwordKeeper = { id: "keeper-a", passwordHash: "old-password-hash", authVersion: "version-a" };
const socialKeeper = { id: "keeper-social", passwordHash: null, authVersion: "version-a" };

async function sessionRequest(keeper: typeof passwordKeeper | typeof socialKeeper, secure = false) {
  const name = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await encode({
    token: { sub: keeper.id, credentialVersion: credentialFingerprint(userCredentialSource(keeper), sessionSecret) },
    secret: sessionSecret, salt: name,
  });
  return new Request(secure ? "https://spoodly.example/api/auth/callback/google" : "http://localhost/api/auth/callback/google", {
    headers: { cookie: `${name}.0=${token.slice(0, 100)}; ${name}.1=${token.slice(100)}` },
  });
}

for (const secure of [false, true]) {
  test(`current session permits social sign-in with ${secure ? "secure" : "local"} chunked cookies`, async () => {
    assert.equal(await hasValidSocialLinkSession(await sessionRequest(passwordKeeper, secure), sessionSecret,
    async (id) => id === "keeper-a" ? passwordKeeper : null), "valid");
  });
  test(`password revocation blocks linking with ${secure ? "secure" : "local"} chunked cookies`, async () => {
    assert.equal(await hasValidSocialLinkSession(await sessionRequest(passwordKeeper, secure), sessionSecret,
    async () => ({ ...passwordKeeper, passwordHash: "replacement-password-hash" })), "invalid");
  });
}

test("social authVersion revocation blocks linking", async () => {
  assert.equal(await hasValidSocialLinkSession(await sessionRequest(socialKeeper), sessionSecret,
    async () => ({ ...socialKeeper, authVersion: "version-b" })), "invalid");
});

test("a deleted keeper cannot link a new provider", async () => {
  assert.equal(await hasValidSocialLinkSession(await sessionRequest(passwordKeeper), sessionSecret, async () => null), "invalid");
});

test("new social sign-in with no session cookie is allowed without querying a keeper", async () => {
  assert.equal(await hasValidSocialLinkSession(new Request("https://spoodly.example/api/auth/callback/google"), sessionSecret,
    async () => { throw new Error("No session to resolve"); }), "none");
});

test("an invalid existing session cookie is rejected", async () => {
  assert.equal(await hasValidSocialLinkSession(new Request("https://spoodly.example/api/auth/callback/google", {
    headers: { cookie: "__Secure-authjs.session-token=invalid-token" },
  }), sessionSecret, async () => passwordKeeper), "invalid");
});

test("OAuth callback without a request fails closed", async () => {
  assert.equal(await hasValidSocialLinkSession(undefined, sessionSecret, async () => passwordKeeper), "invalid");
});

test("configured AUTH_URL determines secure cookie mode behind a proxy", async () => {
  const secureRequest = await sessionRequest(passwordKeeper, true);
  const internalRequest = new Request("http://internal/api/auth/callback/google", { headers: secureRequest.headers });
  assert.equal(await hasValidSocialLinkSession(internalRequest, sessionSecret,
    async () => ({ ...passwordKeeper, passwordHash: "replacement-password-hash" }), "https://spoodly.example"), "invalid");
});

test("keeper lookup failure cannot authorize social linking", async () => {
  await assert.rejects(hasValidSocialLinkSession(await sessionRequest(passwordKeeper), sessionSecret,
    async () => { throw new Error("keeper lookup unavailable"); }), /keeper lookup unavailable/);
});

import { socialAuthProviders, socialSessionCookie } from "./social-auth";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

test("HTTPS session cookies support Apple's cross-site POST while retaining session protections", () => {
  assert.deepEqual(socialSessionCookie("https://spoodly.example/api/auth/callback/apple"), {
    name: "__Secure-authjs.session-token",
    options: { httpOnly: true, sameSite: "none", path: "/", secure: true },
  });
});

test("local HTTP session cookies keep Lax and the local Auth.js cookie name", () => {
  assert.deepEqual(socialSessionCookie("http://localhost:43123"), {
    name: "authjs.session-token",
    options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
  });
});

for (const providerId of ["google", "apple", "facebook"] as const) {
  for (const linking of [false, true]) {
    test(`${providerId} ${linking ? "authenticated linking" : "account creation"} persists identity without provider tokens`, async () => {
      // Characterize the installed Auth.js account() lifecycle against an in-memory
      // adapter boundary. No OAuth requests or database operations are performed.
      const coreRoot = dirname(createRequire(import.meta.url).resolve("@auth/core"));
      const { default: parseProviders } = await import(pathToFileURL(join(coreRoot, "lib/utils/providers.js")).href);
      const { handleLoginOrRegister } = await import(pathToFileURL(join(coreRoot, "lib/actions/callback/handle-login.js")).href);
      const env = { [`AUTH_${providerId.toUpperCase()}_ID`]: "client", [`AUTH_${providerId.toUpperCase()}_SECRET`]: "secret" };
      const { provider } = parseProviders({
        providerId, url: new URL("https://spoodly.example/api/auth/callback/" + providerId),
        config: { providers: socialAuthProviders(env) },
      });
      const keeper = { id: "keeper-a", email: "keeper@example.com", emailVerified: null };
      const linkedAccounts: unknown[] = [];
      const salt = "__Secure-authjs.session-token";
      const token = linking ? await encode({ token: { sub: keeper.id }, secret: sessionSecret, salt }) : undefined;
      const { decode } = await import("next-auth/jwt");
      const profile = providerId === "facebook" && linking ? { name: "Keeper" } : { email: keeper.email };
      await handleLoginOrRegister(token, profile, {
        provider: providerId, providerAccountId: "external-id", type: provider.type,
        access_token: "sensitive-access", refresh_token: "sensitive-refresh", id_token: "sensitive-id",
        expires_at: 9999999999, scope: "openid email", token_type: "Bearer", session_state: "provider-session",
      }, {
        provider,
        adapter: {
          getUser: async (id: string) => id === keeper.id ? keeper : null,
          getUserByAccount: async () => null,
          getUserByEmail: async () => null,
          createUser: async () => keeper,
          linkAccount: async (account: unknown) => { linkedAccounts.push(account); return account; },
        },
        jwt: { decode, secret: sessionSecret },
        cookies: { sessionToken: { name: salt } },
        session: { strategy: "jwt" }, events: {},
      });
      assert.deepEqual(linkedAccounts, [{
        provider: providerId, providerAccountId: "external-id", type: provider.type, userId: "keeper-a",
      }]);
    });
  }
}
