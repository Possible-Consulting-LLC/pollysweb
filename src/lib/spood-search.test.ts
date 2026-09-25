import assert from "node:assert/strict";
import test from "node:test";
import { matchingSpoodNames } from "./spood-search";

test("name suggestions match anywhere ignoring case and surrounding spaces", () => {
  assert.deepEqual(matchingSpoodNames(["Staging Star", "Moon", "Stardust"], " STAR "), ["Staging Star", "Stardust"]);
});
test("blank and unmatched searches have no suggestions", () => {
  assert.deepEqual(matchingSpoodNames(["Staging Star"], "  "), []);
  assert.deepEqual(matchingSpoodNames(["Staging Star"], "Moon"), []);
});
test("duplicate names appear once and suggestions are bounded", () => {
  assert.deepEqual(matchingSpoodNames(["Star", "Star", "Star Two"], "star"), ["Star", "Star Two"]);
  assert.equal(matchingSpoodNames(Array.from({ length: 20 }, (_, i) => `Star ${i}`), "star").length, 8);
});
