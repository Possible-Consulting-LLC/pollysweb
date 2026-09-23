import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedText, optionalText, hydrationMethods, reminderInterval } from "./write-validation";

test("care text rejects oversized input with a clear error", () => {
  assert.equal(boundedText("  tiny  ", "Name", 120), "tiny");
  assert.throws(() => boundedText("x".repeat(121), "Name", 120), /Name must be 120 characters or fewer/);
  assert.equal(optionalText("   ", "Notes", 1000), undefined);
  assert.throws(() => optionalText("x".repeat(1001), "Notes", 1000), /Notes must be 1000 characters or fewer/);
});

test("reminder defaults accept only bounded whole days", () => {
  assert.equal(reminderInterval("7", "Feeding"), 7);
  for (const value of ["0", "-1", "1.5", "Infinity", "500", "bad"]) {
    assert.throws(() => reminderInterval(value, "Feeding"), /Feeding must be a whole number of days from 1 to 365/);
  }
});

test("hydration methods reject oversized or excessive entries", () => {
  assert.deepEqual(hydrationMethods([" Mist ", "Droplet"]), ["Mist", "Droplet"]);
  assert.throws(() => hydrationMethods(Array(9).fill("Mist")), /at most 8 hydration methods/);
  assert.throws(() => hydrationMethods(["x".repeat(121)]), /Hydration method must be 120 characters or fewer/);
});
