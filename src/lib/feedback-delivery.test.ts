import assert from "node:assert/strict";
import test from "node:test";
import { feedbackMailConfig } from "./feedback-delivery";

const staging = {
  SPOODLY_ENV: "staging",
  AUTH_URL: "https://long-project.vercel.app",
  EMAIL_VERIFICATION_ORIGIN: "https://staging.spoodlyspace.com",
  EMAIL_RESEND_API_KEY: "staging-key",
  EMAIL_FROM_EMAIL: "hello@spoodlyspace.com",
  EMAIL_ALLOWED_RECIPIENTS: "keeper@example.com,support@spoodlyspace.com",
  FEEDBACK_TO_EMAIL: "support@spoodlyspace.com",
  RESEND_API_KEY: "live-key-must-not-be-used",
};

test("staging feedback uses the dedicated key and only an allowed explicit recipient", () => {
  assert.deepEqual(feedbackMailConfig(staging), {
    key: "staging-key",
    from: "hello@spoodlyspace.com",
    to: "support@spoodlyspace.com",
  });
  assert.equal(feedbackMailConfig({ ...staging, FEEDBACK_TO_EMAIL: "outsider@example.com" }), null);
  assert.equal(feedbackMailConfig({ ...staging, FEEDBACK_TO_EMAIL: "" }), null);
  assert.equal(feedbackMailConfig({ ...staging, EMAIL_RESEND_API_KEY: "" }), null);
});

test("live feedback keeps its existing key, sender, and recipient settings", () => {
  assert.deepEqual(feedbackMailConfig({
    RESEND_API_KEY: "live-key", RESEND_FROM_EMAIL: "Spoodly Space <feedback@spoodlyspace.com>",
    FEEDBACK_TO_EMAIL: "support@spoodlyspace.com",
  }), {
    key: "live-key", from: "Spoodly Space <feedback@spoodlyspace.com>", to: "support@spoodlyspace.com",
  });
});
