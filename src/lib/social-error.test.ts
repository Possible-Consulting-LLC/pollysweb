import assert from "node:assert/strict";
import test from "node:test";
import { socialErrorMessage } from "./social-error";

test("same-email collision explains how to connect the provider", () => {
  assert.match(socialErrorMessage("OAuthAccountNotLinked") ?? "", /sign in.*Settings/i);
});

test("missing email or declined permission gives a useful fallback", () => {
  assert.match(socialErrorMessage("AccessDenied") ?? "", /email/i);
  assert.match(socialErrorMessage("AccessDenied") ?? "", /password/i);
});

test("Facebook missing-email rejection explains how to connect it after account creation", () => {
  const message = socialErrorMessage("FacebookEmailUnavailable") ?? "";
  assert.match(message, /Facebook.*email/i);
  assert.match(message, /email and password.*Settings/i);
});

test("cancellation and configuration failures are explained without exposing raw query values", () => {
  assert.match(socialErrorMessage("OAuthCallback") ?? "", /cancel|complete/i);
  assert.match(socialErrorMessage("Configuration") ?? "", /unavailable/i);
  assert.equal(socialErrorMessage("<script>alert(1)</script>"), null);
});
