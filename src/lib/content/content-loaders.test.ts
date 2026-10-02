import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { listLegalDocs, getLegalDoc } from "./legal";
import { listGuides, getGuide, GUIDE_CATEGORIES } from "./care-guides";
import { renderMarkdown } from "./markdown";

const FIXTURES = path.join(process.cwd(), "src", "lib", "content", "fixtures");
const legalDir = path.join(FIXTURES, "legal");

test("legal docs list in order with drafts excluded", () => {
  const docs = listLegalDocs(legalDir);
  assert.deepEqual(docs.map((doc) => doc.slug), ["another-doc", "valid-doc"]);
});

test("getLegalDoc returns meta, rendered html, and toc", () => {
  const doc = getLegalDoc("valid-doc", legalDir);
  assert.ok(doc);
  assert.equal(doc.title, "Valid Doc");
  assert.equal(doc.order, 2);
  assert.ok(doc.html.includes('<h2 id="hello">Hello</h2>'));
  assert.deepEqual(doc.toc, [
    { id: "hello", text: "Hello", level: 2 },
    { id: "nested-topic", text: "Nested Topic", level: 3 },
  ]);
});

test("draft docs are hidden from lists and getters unconditionally", () => {
  assert.ok(listLegalDocs(legalDir).every((doc) => doc.slug !== "draft-doc"));
  assert.equal(getLegalDoc("draft-doc", legalDir), null);
});

test("unknown slugs resolve to null", () => {
  assert.equal(getLegalDoc("missing-doc", legalDir), null);
});

test("malformed frontmatter throws with the filename named", () => {
  assert.throws(
    () => listLegalDocs(path.join(FIXTURES, "legal-malformed")),
    (error: Error) => error.message.includes("malformed.md"),
  );
});

test("duplicate slugs across files throw", () => {
  assert.throws(
    () => listLegalDocs(path.join(FIXTURES, "legal-duplicate")),
    (error: Error) => error.message.includes("same-slug"),
  );
});

test("renderMarkdown produces heading ids and toc entries", () => {
  const { html, toc } = renderMarkdown("## Hello\n\ntext");
  assert.ok(html.includes('<h2 id="hello">Hello</h2>'));
  assert.deepEqual(toc, [{ id: "hello", text: "Hello", level: 2 }]);
});

test("guide categories are the nine approved keys", () => {
  assert.deepEqual(GUIDE_CATEGORIES.map((category) => category.key), [
    "feeding",
    "water",
    "molting",
    "handling",
    "habitat",
    "cleaning",
    "life-stages",
    "health",
    "species-profiles",
  ]);
});

test("guides list with drafts excluded and carry category metadata", () => {
  const guides = listGuides(path.join(FIXTURES, "guides"));
  assert.deepEqual(guides.map((guide) => guide.slug), ["fixture-feeding"]);
  const guide = guides[0];
  assert.equal(guide.category, "feeding");
  assert.equal(guide.readingTime, 4);
  assert.ok(guide.excerpt.length > 0);
});

test("draft guides are hidden from lists and getters unconditionally", () => {
  const guides = listGuides(path.join(FIXTURES, "guides"));
  assert.ok(guides.every((guide) => guide.slug !== "fixture-water"));
  assert.equal(getGuide("fixture-water", path.join(FIXTURES, "guides")), null);
});

test("unknown guide categories throw with the filename", () => {
  assert.throws(
    () => listGuides(path.join(FIXTURES, "guides-bad")),
    (error: Error) => error.message.includes("bad-category.md"),
  );
});

test("getGuide returns rendered html and toc", () => {
  const guide = getGuide("fixture-feeding", path.join(FIXTURES, "guides"));
  assert.ok(guide);
  assert.ok(guide.html.includes('<h2 id="feed-well">Feed Well</h2>'));
  assert.deepEqual(guide.toc, [{ id: "feed-well", text: "Feed Well", level: 2 }]);
});