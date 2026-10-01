import assert from "node:assert/strict";
import test from "node:test";
import { validateNewsletterInput } from "./newsletter";

test("valid email is accepted and lowercased", () => {
  assert.deepEqual(validateNewsletterInput("Keeper@Example.COM"), { email: "keeper@example.com" });
});

test("blank input is rejected", () => {
  const result = validateNewsletterInput("   ");
  assert.ok("error" in result);
});

test("non-email strings are rejected", () => {
  const result = validateNewsletterInput("not-an-email");
  assert.ok("error" in result);
});

test("non-string input is rejected", () => {
  const result = validateNewsletterInput(42);
  assert.ok("error" in result);
});