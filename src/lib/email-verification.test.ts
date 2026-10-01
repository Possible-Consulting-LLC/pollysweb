import assert from "node:assert/strict";
import test from "node:test";
import { canUsePasswordAccount, createVerificationToken, legacyVerificationDeadline, verificationTokenHash, verificationLink, verificationMailConfig } from "./email-verification";

test("tokens are random and only their digest is stored", () => {
  const first = createVerificationToken();
  const second = createVerificationToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(verificationTokenHash(first), /^[a-f0-9]{64}$/);
  assert.notEqual(verificationTokenHash(first), first);
});

test("legacy password accounts have seven days after deliberate activation", () => {
  const user = { passwordHash: "hash", emailVerified: null };
  assert.equal(canUsePasswordAccount(user, new Date("2026-10-01T00:00:00Z"), undefined), true);
  assert.equal(canUsePasswordAccount(user, new Date("2026-09-24T00:00:00Z"), "2026-09-17T00:00:00Z"), false);
  assert.equal(canUsePasswordAccount(user, new Date("2026-09-23T23:59:59Z"), "2026-09-17T00:00:00Z"), true);
  assert.equal(canUsePasswordAccount({ ...user, emailVerified: new Date() }, new Date("2026-10-01T00:00:00Z"), "2026-09-17T00:00:00Z"), true);
  assert.throws(() => canUsePasswordAccount(user, new Date(), "tomorrow"), /activation/i);
});

test("unverified password users get a deadline notice only during the active grace", () => {
  const user = { passwordHash: "hash", emailVerified: null };
  const start = "2026-09-17T00:00:00Z";
  assert.equal(legacyVerificationDeadline(user, new Date("2026-09-18T00:00:00Z"), start)?.toISOString(), "2026-09-24T00:00:00.000Z");
  assert.equal(legacyVerificationDeadline(user, new Date("2026-09-24T00:00:00Z"), start), null);
  assert.equal(legacyVerificationDeadline(user, new Date("2026-09-18T00:00:00Z"), undefined), null);
  assert.equal(legacyVerificationDeadline({ ...user, emailVerified: new Date() }, new Date("2026-09-18T00:00:00Z"), start), null);
});

test("mail configuration fails closed without dedicated credentials or sender", () => {
  assert.equal(verificationMailConfig({ RESEND_API_KEY: "feedback-key" }), null);
  assert.equal(verificationMailConfig({ EMAIL_RESEND_API_KEY: "key", AUTH_URL: "https://staging.example" }), null);
  assert.equal(verificationMailConfig({ EMAIL_RESEND_API_KEY: "key", EMAIL_FROM_EMAIL: "hello@example.com", AUTH_URL: "https://staging.example", SPOODLY_ENV: "staging" }), null);
});

test("staging recipient allowlist is exact and verification link stays on canonical origin", () => {
  const env = { EMAIL_RESEND_API_KEY: "key", EMAIL_FROM_EMAIL: "hello@example.com", AUTH_URL: "https://staging.example", SPOODLY_ENV: "staging", EMAIL_ALLOWED_RECIPIENTS: "keeper@example.com" };
  const config = verificationMailConfig(env);
  assert.ok(config);
  assert.equal(config.allowed("keeper@example.com"), true);
  assert.equal(config.allowed("other@example.com"), false);
  assert.equal(verificationLink(config.origin, "raw-token"), "https://staging.example/verify-email?token=raw-token");
});

test("verification links use the public email origin without changing the authentication origin", () => {
  const env = {
    EMAIL_RESEND_API_KEY: "key", EMAIL_FROM_EMAIL: "hello@example.com",
    AUTH_URL: "https://long-project.vercel.app",
    EMAIL_VERIFICATION_ORIGIN: "https://staging.example",
    SPOODLY_ENV: "staging", EMAIL_ALLOWED_RECIPIENTS: "keeper@example.com",
  };
  const config = verificationMailConfig(env);
  assert.ok(config);
  assert.equal(verificationLink(config.origin, "raw-token"), "https://staging.example/verify-email?token=raw-token");
  assert.equal(env.AUTH_URL, "https://long-project.vercel.app");
  for (const unsafe of ["http://staging.example", "https://staging.example/path", "https://user:pass@staging.example"]) {
    assert.equal(verificationMailConfig({ ...env, EMAIL_VERIFICATION_ORIGIN: unsafe }), null);
  }
});
