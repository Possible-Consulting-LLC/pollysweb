import assert from "node:assert/strict";
import test from "node:test";
import { NAV_ITEMS, FOOTER_LEGAL_SLUGS, activeNavKey } from "./nav";

test("nav carries the seven approved items in order", () => {
  assert.deepEqual(NAV_ITEMS.map((item) => item.href), [
    "/features",
    "/care-guides",
    "/blog",
    "/pricing",
    "/about",
    "/help",
    "/contact",
  ]);
  assert.deepEqual(NAV_ITEMS.map((item) => item.label), [
    "Features",
    "Care Guides",
    "Blog",
    "Pricing",
    "About",
    "Help",
    "Contact",
  ]);
});

test("active nav key resolves section pages to their item", () => {
  assert.equal(activeNavKey("/care-guides/molting"), "care-guides");
  assert.equal(activeNavKey("/blog/welcome-to-pollys-web"), "blog");
  assert.equal(activeNavKey("/pricing"), "pricing");
});

test("home has no nav key and unknown paths resolve to none", () => {
  assert.equal(activeNavKey("/"), null);
  assert.equal(activeNavKey("/login"), null);
});

test("footer legal column lists exactly the nine approved slugs", () => {
  assert.deepEqual([...FOOTER_LEGAL_SLUGS], [
    "terms-of-service",
    "privacy-policy",
    "cookie-policy",
    "community-guidelines",
    "acceptable-use",
    "copyright",
    "disclaimer",
    "data-deletion",
    "accessibility",
  ]);
});