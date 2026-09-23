import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialButtons } from "@/components/auth/social-buttons";

test("social controls render accessible labels only for configured providers", () => {
  const html = renderToStaticMarkup(
    createElement(SocialButtons, { providers: ["google", "facebook"], mode: "continue", action: async () => {} }),
  );
  assert.match(html, /Continue with Google/);
  assert.match(html, /Continue with Facebook/);
  assert.doesNotMatch(html, /Apple|Instagram/);
  assert.match(html, /value="google" name="provider"/);
  assert.match(html, /value="facebook" name="provider"/);
});

test("social controls omit the empty section and label account linking clearly", () => {
  assert.equal(renderToStaticMarkup(
    createElement(SocialButtons, { providers: [], mode: "continue", action: async () => {} }),
  ), "");
  const html = renderToStaticMarkup(
    createElement(SocialButtons, { providers: ["apple"], mode: "link", action: async () => {} }),
  );
  assert.match(html, /Connect Apple/);
  assert.doesNotMatch(html, /Google|Facebook|Instagram/);
});
