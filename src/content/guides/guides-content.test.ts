import assert from "node:assert/strict";
import test from "node:test";
import { listGuides, getGuide, GUIDE_CATEGORIES } from "../../lib/content/care-guides";

test("all eight care guides exist, one per category, in category order coverage", () => {
  const guides = listGuides();
  assert.equal(guides.length, 8);
  const covered = new Set(guides.map((guide) => guide.category));
  for (const category of GUIDE_CATEGORIES) {
    assert.ok(covered.has(category.key), `no guide for category: ${category.key}`);
  }
});

test("guide slugs are unique and match their category domain", () => {
  const guides = listGuides();
  const slugs = guides.map((guide) => guide.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const guide of guides) {
    assert.equal(guide.slug, guide.category);
  }
});

test("every guide has a reading time, excerpt, and rendered TOC", () => {
  for (const guide of listGuides()) {
    const full = getGuide(guide.slug);
    assert.ok(full, `missing: ${guide.slug}`);
    assert.ok(full.readingTime >= 1);
    assert.ok(full.excerpt.length > 0);
    assert.ok(full.toc.length >= 2, `guide lacks structure: ${guide.slug}`);
    assert.ok(full.html.includes("<h2 id="));
  }
});

test("species profiles covers the three species from the mockup book spines", () => {
  const guide = getGuide("species-profiles");
  assert.ok(guide?.html.includes("Phidippus"));
  assert.ok(guide.html.includes("Salticus"));
  assert.ok(guide.html.includes("Habronattus"));
});