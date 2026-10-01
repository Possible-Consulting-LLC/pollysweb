import assert from "node:assert/strict";
import test from "node:test";
import { BRAND, BRAND_LOGO_SRC } from "./brand";

test("brand constants carry the approved copy", () => {
  assert.equal(BRAND.name, "Polly's Web");
  assert.equal(BRAND.tagline, "Happier, Healthier Spoods.");
  assert.equal(BRAND.emails.support, "support@pollysweb.com");
});
test("logo points at the new mark", () => {
  assert.equal(BRAND_LOGO_SRC, "/brand/pollys-logo-mark.png");
});