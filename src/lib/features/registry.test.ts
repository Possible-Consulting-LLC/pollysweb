import assert from "node:assert/strict";
import test from "node:test";
import { FEATURE_REGISTRY, isRegisteredFeatureKey, registryCategories, registryFeature } from "./registry";

// Copied verbatim from docs/superpowers/audits/2026-09-26-feature-entry-points.md
// (the "Feature registry input" tables, in document order). The assertions below
// fail if either the audit doc or the registry drifts from the other.
const AUDIT_KEYS: readonly string[] = [
  // spoods (7)
  "spood.create",
  "spood.about.view",
  "spood.about.edit",
  "spood.list.view",
  "spood.story.view",
  "spood.memorialize",
  "spood.memorial.restore",
  // care (8)
  "care.feed.log",
  "care.hydrate.log",
  "care.molt.log",
  "care.observe.log",
  "care.play.log",
  "care.body_condition.log",
  "care.premolt.manage",
  "care.status.view",
  // habitat (3)
  "enclosure.view",
  "enclosure.manage",
  "housekeeping.log",
  // photos (4)
  "photo.upload",
  "photo.gallery.view",
  "photo.profile.set",
  "photo.delete",
  // journey (4)
  "universe.view",
  "journey.check_in",
  "journey.streaks.view",
  "journey.badges.view",
  // activity (3)
  "activity.full_history.view",
  "activity.edit",
  "activity.delete",
  // settings (5)
  "settings.profile.manage",
  "settings.theme.customize",
  "settings.password.change",
  "settings.email.change",
  "settings.social.link",
];

test("every registry key is unique", () => {
  assert.equal(FEATURE_REGISTRY.length, new Set(FEATURE_REGISTRY.map(feature => feature.key)).size);
});

test("every key matches the audit doc's key format", () => {
  for (const feature of FEATURE_REGISTRY) {
    assert.match(feature.key, /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
  }
});

test("every entry has a nonempty name, description, and category", () => {
  for (const feature of FEATURE_REGISTRY) {
    assert.ok(feature.name.trim().length > 0, `empty name for ${feature.key}`);
    assert.ok(feature.description.trim().length > 0, `empty description for ${feature.key}`);
    assert.ok(feature.category.trim().length > 0, `empty category for ${feature.key}`);
  }
});

test("registered keys answer true, unknown keys answer false", () => {
  assert.equal(isRegisteredFeatureKey("spood.create"), true);
  assert.equal(isRegisteredFeatureKey("nope.not-real"), false);
  for (const key of AUDIT_KEYS) {
    assert.equal(isRegisteredFeatureKey(key), true, `unregistered audit key: ${key}`);
  }
});

test("registryFeature round-trips the definition", () => {
  const expected = FEATURE_REGISTRY.find(feature => feature.key === "spood.create");
  assert.ok(expected);
  assert.deepEqual(registryFeature("spood.create"), expected);
  assert.equal(registryFeature("nope.not-real"), null);
  for (const key of AUDIT_KEYS) {
    const found = registryFeature(key);
    assert.ok(found, `registry missing audit key: ${key}`);
    assert.equal(found.key, key);
  }
});

test("registryCategories returns the audit categories sorted without duplicates", () => {
  const categories = registryCategories();
  assert.deepEqual(categories, ["activity", "care", "habitat", "journey", "photos", "settings", "spoods"]);
  assert.equal(categories.length, new Set(categories).size);
});

test("the registry matches the audit doc's keys exactly", () => {
  assert.equal(FEATURE_REGISTRY.length, 34);
  assert.deepEqual([...FEATURE_REGISTRY.map(feature => feature.key)].sort(), [...AUDIT_KEYS].sort());
});
