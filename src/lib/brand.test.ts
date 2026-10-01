import assert from "node:assert/strict";
import test from "node:test";
import { BRAND, BRAND_LOGO_SRC, BRAND_LOGO_WHITE_SRC } from "./brand";

test("brand constants carry the approved copy", () => {
  assert.equal(BRAND.name, "Polly's Web");
  assert.equal(BRAND.tagline, "Happier, Healthier Spoods.");
  assert.equal(BRAND.emails.support, "support@pollysweb.com");
});
test("logo points at the new mark", () => {
  assert.equal(BRAND_LOGO_SRC, "/brand/pollys-logo-mark.png");
});
test("white logo variant exists for the dark footer", () => {
  assert.equal(BRAND_LOGO_WHITE_SRC, "/brand/pollys-logo-white.png");
});