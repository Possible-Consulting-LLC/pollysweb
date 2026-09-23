import assert from "node:assert/strict";
import test from "node:test";
import { parseRegistration } from "./registration-validation";

const registration = {
  email: "keeper@example.com",
  password: "a memorable spider passphrase",
  name: "Keeper",
};

test("registration rejects a missing password confirmation", () => {
  const result = parseRegistration(registration);
  assert.equal(result.success, false);
});

test("registration rejects passwords that do not match", () => {
  const result = parseRegistration({ ...registration, confirmPassword: "different123" });
  assert.equal(result.success, false);
});

test("registration accepts matching passwords", () => {
  const result = parseRegistration({ ...registration, confirmPassword: registration.password });
  assert.equal(result.success, true);
});

test("registration rejects a password shorter than 15 Unicode code points", () => {
  const result = parseRegistration({ ...registration, password: "🕷".repeat(14), confirmPassword: "🕷".repeat(14) });
  assert.equal(result.success, false);
});

test("registration accepts 15 Unicode code points and a 128-character passphrase", () => {
  for (const password of ["🕷".repeat(15), "p".repeat(128)]) {
    assert.equal(parseRegistration({ ...registration, password, confirmPassword: password }).success, true);
  }
});

test("registration rejects more than 128 Unicode code points", () => {
  const password = "p".repeat(129);
  assert.equal(parseRegistration({ ...registration, password, confirmPassword: password }).success, false);
});
