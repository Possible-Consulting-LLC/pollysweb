import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveFeatureGate } from "./gate";

it("released + entitled → entitled", () =>
  assert.equal(resolveFeatureGate({ active: true, entitled: true }), "entitled"));
it("released + not entitled → upsell", () =>
  assert.equal(resolveFeatureGate({ active: true, entitled: false }), "upsell"));
it("unreleased → coming-soon regardless of entitlement", () => {
  assert.equal(resolveFeatureGate({ active: false, entitled: true }), "coming-soon");
  assert.equal(resolveFeatureGate({ active: false, entitled: false }), "coming-soon");
});
