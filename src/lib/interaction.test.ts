import assert from "node:assert/strict";
import { test } from "node:test";
import { interactionNotes } from "./interaction";

test("an optional interaction records how it happened", () => {
  assert.equal(interactionNotes("Voluntary handling", "", "Climbed onto my hand"), "How: Voluntary handling\nClimbed onto my hand");
  assert.equal(interactionNotes("Watched in enclosure", "", ""), "How: Watched in enclosure");
});

test("Other requires the keeper's own description", () => {
  assert.throws(() => interactionNotes("Other", "", "Looked curious"), /describe how/i);
  assert.equal(interactionNotes("Other", "Sat near the enclosure", ""), "How: Sat near the enclosure");
});

test("an unrecognized interaction method is rejected", () => {
  assert.throws(() => interactionNotes("force handling", "", ""), /choose a way/i);
});
