import assert from "node:assert/strict";
import test from "node:test";
import { isAppNavActive } from "./app-navigation";

test("only the matching primary destination is active", () => {
  assert.equal(isAppNavActive("/home", "/home"), true);
  assert.equal(isAppNavActive("/home", "/constellation"), false);
  assert.equal(isAppNavActive("/constellation", "/constellation"), true);
  assert.equal(isAppNavActive("/settings", "/constellation"), false);
});

test("spood profiles belong to My Spoods without activating unrelated links", () => {
  assert.equal(isAppNavActive("/spoods/spider-a", "/spoods"), true);
  assert.equal(isAppNavActive("/spoods/spider-a/story", "/spoods"), true);
  assert.equal(isAppNavActive("/spoods-extra", "/spoods"), false);
});
