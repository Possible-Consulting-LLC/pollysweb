import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { credentialFingerprint, emailChangeCredentialSnapshot, matchesCredentialFingerprint, userCredentialSource } from "./credential-version";

const legacyHash = "$2b$10$abcdefghijklmnopqrstuuG5pn.zLyNZSWcoQs05VgB/VZ7P7wLni";
const secret = "session-test-secret";

test("an existing bcrypt session keeps the exact pre-social HMAC input", () => {
  const existingToken = createHmac("sha256", secret).update(`session-credentials:${legacyHash}`).digest("hex");
  assert.equal(credentialFingerprint(legacyHash, secret), existingToken);
  assert.equal(matchesCredentialFingerprint(existingToken, legacyHash, secret), true);
  assert.equal(matchesCredentialFingerprint(existingToken, "replacement-password-hash", secret), false);
});

test("social fingerprints are isolated by keeper and revocable version", () => {
  const token = credentialFingerprint("oauth:keeper-a:version-one", secret);
  assert.equal(matchesCredentialFingerprint(token, "oauth:keeper-a:version-one", secret), true);
  assert.equal(matchesCredentialFingerprint(token, "oauth:keeper-b:version-one", secret), false);
  assert.equal(matchesCredentialFingerprint(token, "oauth:keeper-a:version-two", secret), false);
});

test("confirming an email change revokes password and social sessions without invalidating untouched accounts", () => {
  const passwordUser: { id: string; passwordHash: string | null; authVersion: string; emailChangeVersion: string | null } = { id: "keeper-a", passwordHash: legacyHash, authVersion: "original", emailChangeVersion: null };
  const socialUser: typeof passwordUser = { id: "keeper-b", passwordHash: null, authVersion: "original", emailChangeVersion: null };
  const passwordToken = credentialFingerprint(userCredentialSource(passwordUser), secret);
  const socialToken = credentialFingerprint(userCredentialSource(socialUser), secret);
  assert.equal(matchesCredentialFingerprint(passwordToken, userCredentialSource(passwordUser), secret), true);
  passwordUser.emailChangeVersion = "changed";
  socialUser.emailChangeVersion = "changed";
  assert.equal(matchesCredentialFingerprint(passwordToken, userCredentialSource(passwordUser), secret), false);
  assert.equal(matchesCredentialFingerprint(socialToken, userCredentialSource(socialUser), secret), false);
});

test("an email-change challenge binds to the current credential state without storing its raw password hash", () => {
  const keeper = { id: "keeper-a", passwordHash: legacyHash, authVersion: "original", emailChangeVersion: null as string | null };
  const snapshot = emailChangeCredentialSnapshot(keeper);
  assert.match(snapshot, /^[0-9a-f]{64}$/);
  assert.ok(!snapshot.includes(legacyHash));
  keeper.passwordHash = "rotated-hash";
  assert.notEqual(emailChangeCredentialSnapshot(keeper), snapshot);
});

test('admin version revokes password and social credentials while null preserves existing sessions', () => {
  for (const passwordHash of [legacyHash, null]) {
    const user = { id: 'keeper', passwordHash, authVersion: 'auth', adminVersion: null as string | null };
    const token = credentialFingerprint(userCredentialSource(user), secret);
    user.adminVersion = 'first-admin-change';
    assert.equal(matchesCredentialFingerprint(token, userCredentialSource(user), secret), false);
    const newToken = credentialFingerprint(userCredentialSource(user), secret);
    user.adminVersion = 'second-admin-change';
    assert.equal(matchesCredentialFingerprint(newToken, userCredentialSource(user), secret), false);
  }
});
