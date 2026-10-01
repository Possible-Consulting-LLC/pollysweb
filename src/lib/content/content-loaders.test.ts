import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { listLegalDocs, getLegalDoc } from "./legal";
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