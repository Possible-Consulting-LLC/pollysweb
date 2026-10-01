import assert from "node:assert/strict";
import test from "node:test";
import { listLegalDocs, getLegalDoc } from "../../lib/content/legal";
import { FOOTER_LEGAL_SLUGS } from "../../components/marketing/nav";

const EXPECTED_SLUGS = [
  "overview",
  "terms-of-service",
  "privacy-policy",
  "cookie-policy",
  "community-guidelines",
  "acceptable-use",
  "copyright",
  "disclaimer",
  "data-deletion",
  "accessibility",
];

test("all ten legal documents exist under the expected slugs", () => {
  const docs = listLegalDocs();
  assert.deepEqual(docs.map((doc) => doc.slug), EXPECTED_SLUGS);
});

test("orders are the unique sequence 1..10", () => {
  const docs = listLegalDocs();
  assert.deepEqual(docs.map((doc) => doc.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("every footer legal link resolves to a real document", () => {
  for (const slug of FOOTER_LEGAL_SLUGS) {
    const doc = getLegalDoc(slug);
    assert.ok(doc, `footer links to missing doc: ${slug}`);
  }
});

test("migrated docs keep sentinel phrases from the originals", () => {
  const privacy = getLegalDoc("privacy-policy");
  assert.ok(privacy?.html.includes("We do not sell keeper information"));
  const terms = getLegalDoc("terms-of-service");
  assert.ok(terms?.html.includes("You must be at least 13 years old"));
  const deletion = getLegalDoc("data-deletion");
  assert.ok(deletion?.html.includes("We do not delete independently entered spoods"));
});

test("cookie policy enumerates the real cookies and invents no advertising", () => {
  const cookies = getLegalDoc("cookie-policy");
  assert.ok(cookies);
  assert.ok(cookies.html.includes("authjs.session-token"));
  assert.ok(cookies.html.includes("spoodly_tz"));
  assert.ok(cookies.html.includes("spoodly-test-session"));
  assert.ok(!cookies.html.toLowerCase().includes("advertising"));
});

test("documents render headings with anchor ids for the TOC", () => {
  const privacy = getLegalDoc("privacy-policy");
  assert.ok(privacy && privacy.toc.length >= 3);
  assert.ok(privacy.html.includes("<h2 id="));
});