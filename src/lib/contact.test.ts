import assert from "node:assert/strict";
import test from "node:test";
import { contactTargetFor, validateContactInput } from "./contact";

test("contact topics route to the four brand inboxes", () => {
  assert.equal(contactTargetFor("support"), "support@pollysweb.com");
  assert.equal(contactTargetFor("bugs"), "bugs@pollysweb.com");
  assert.equal(contactTargetFor("ideas"), "ideas@pollysweb.com");
  assert.equal(contactTargetFor("partnerships"), "partnerships@pollysweb.com");
});

test("valid contact input is normalized", () => {
  const result = validateContactInput({
    name: "  Keeper  ",
    email: "Keeper@Example.COM",
    topic: "bugs",
    message: "  The water guide typo is bugging me.  ",
  });
  assert.ok(!("error" in result));
  assert.deepEqual(result, {
    name: "Keeper",
    email: "keeper@example.com",
    topic: "bugs",
    message: "The water guide typo is bugging me.",
  });
});

test("invalid input is rejected", () => {
  assert.ok("error" in validateContactInput({ name: "", email: "nope", topic: "bugs", message: "short" }));
  assert.ok("error" in validateContactInput({ name: "A", email: "a@b.co", topic: "spam", message: "long enough message here" }));
  assert.ok("error" in validateContactInput({ name: "A", email: "a@b.co", topic: "bugs", message: "tiny" }));
});