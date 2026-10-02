import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeatureGate } from "./feature-gate";

test("entitled features render their children", () => {
  const markup = renderToStaticMarkup(
    createElement(FeatureGate, {
      state: "entitled", featureKey: "spood.create", name: "Spood Create",
    }, createElement("strong", null, "Feature content")),
  );

  assert.equal(markup, "<strong>Feature content</strong>");
});

test("upsell features show a link with the feature name", () => {
  const markup = renderToStaticMarkup(
    createElement(FeatureGate, {
      state: "upsell", featureKey: "spood.create", name: "Spood Create",
    }, createElement("strong", null, "Feature content")),
  );

  assert.match(markup, /href="\/features\/spood\.create"/);
  assert.match(markup, /Spood Create is part of a richer plan — see details/);
  assert.doesNotMatch(markup, /Feature content/);
});

test("coming-soon features show an inline placeholder", () => {
  const markup = renderToStaticMarkup(
    createElement(FeatureGate, {
      state: "coming-soon", featureKey: "spood.create", name: "Spood Create",
    }, createElement("strong", null, "Feature content")),
  );

  assert.match(markup, /Spood Create — coming soon/);
  assert.doesNotMatch(markup, /Feature content/);
});
