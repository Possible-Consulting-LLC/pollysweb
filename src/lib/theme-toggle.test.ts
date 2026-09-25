import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("theme preference is a three-way Light, Dark, and System radio control", () => {
  const source = readFileSync(
    new URL("../components/settings/theme-toggle.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /<Select/);
  assert.doesNotMatch(source, /<option/);
  assert.match(source, /<fieldset/);
  assert.match(source, /type="radio"/);
  assert.match(source, /label: "Light"/);
  assert.match(source, /label: "Dark"/);
  assert.match(source, /label: "System"/);
});

test("choosing a theme previews and persists it without submitting profile fields", () => {
  const toggle = readFileSync(
    new URL("../components/settings/theme-toggle.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../app/(app)/settings/page.tsx", import.meta.url),
    "utf8",
  );
  const actions = readFileSync(
    new URL("../app/actions/auth.ts", import.meta.url),
    "utf8",
  );

  assert.match(toggle, /document\.documentElement\.setAttribute\("data-theme"/);
  assert.match(toggle, /action\(formData\)/);
  assert.match(toggle, /Theme saved\./);
  assert.match(page, /action=\{updateThemeAction\}/);
  assert.match(actions, /export async function updateThemeAction/);
});

// Theme autosave and profile submission can finish in either order.
test("saving profile settings cannot overwrite an independently saved theme", () => {
  const actions = readFileSync(new URL("../app/actions/auth.ts", import.meta.url), "utf8");
  const profileAction = actions.split("export async function updateSettingsAction")[1].split("export async function updateThemeAction")[0];
  assert.doesNotMatch(profileAction, /theme\s*:/);
});
