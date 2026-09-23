import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { hashNewPassword, newPasswordSchema, validatePasswordChange, verifyPassword } from "./password-policy";

test("new passwords require 15 to 128 Unicode code points without composition rules", () => {
  assert.equal(newPasswordSchema.safeParse("🕷".repeat(14)).success, false);
  assert.equal(newPasswordSchema.safeParse("🕷".repeat(15)).success, true);
  assert.equal(newPasswordSchema.safeParse("a quiet spider passphrase").success, true);
  assert.equal(newPasswordSchema.safeParse("x".repeat(128)).success, true);
  assert.equal(newPasswordSchema.safeParse("x".repeat(129)).success, false);
});

test("new password hashes include content beyond bcrypt's 72-byte limit", async () => {
  const prefix = "🕷".repeat(20);
  const hash = await hashNewPassword(`${prefix}first`);
  assert.equal(await verifyPassword(`${prefix}first`, hash), true);
  assert.equal(await verifyPassword(`${prefix}second`, hash), false);
});

test("legacy bcrypt hashes remain valid, including six-character passwords", async () => {
  const legacyHash = await bcrypt.hash("spider", 4);
  assert.equal(await verifyPassword("spider", legacyHash), true);
  assert.equal(await verifyPassword("wrong!", legacyHash), false);
});

test("new hashes do not authenticate when the password differs", async () => {
  const hash = await hashNewPassword("a little spider passphrase");
  assert.equal(await verifyPassword("a little spider passphrase", hash), true);
  assert.equal(await verifyPassword("a little spider passphrass", hash), false);
});

test("password changes enforce the new policy without imposing it on the current password", () => {
  assert.equal(validatePasswordChange("spider", "short", "short"), "Password must be at least 15 characters.");
  assert.equal(validatePasswordChange("spider", "🕷".repeat(15), "🕷".repeat(15)), null);
  assert.equal(validatePasswordChange("spider", "x".repeat(129), "x".repeat(129)), "Password must be no more than 128 characters.");
});

test("password changes reject a mismatched or unchanged new password", () => {
  assert.equal(validatePasswordChange("spider", "a new spider passphrase", "different spider passphrase"), "New passwords don’t match.");
  assert.equal(validatePasswordChange("an old spider passphrase", "an old spider passphrase", "an old spider passphrase"), "Pick a new password that’s different from the current one.");
});
