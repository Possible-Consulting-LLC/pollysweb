import assert from "node:assert/strict";
import test from "node:test";
import { socialButtonsFor } from "./social-buttons";

test("configured providers map to labeled buttons in order", () => {
  assert.deepEqual(socialButtonsFor(["google", "facebook"]), [
    { id: "google", label: "Continue with Google" },
    { id: "facebook", label: "Continue with Facebook" },
  ]);
});

test("apple is dropped until its credentials exist", () => {
  assert.deepEqual(socialButtonsFor(["google", "apple"]), [{ id: "google", label: "Continue with Google" }]);
});

test("no configured providers render no buttons", () => {
  assert.deepEqual(socialButtonsFor([]), []);
});