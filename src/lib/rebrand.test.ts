import assert from "node:assert/strict";
import test from "node:test";
import { scanForOldBrand } from "./rebrand-scan";

test("paths still containing the old brand are returned", () => {
  const result = scanForOldBrand([
    { path: "src/app/(app)/settings/page.tsx", text: "Disconnecting removes the sign-in link in Spoodly Space." },
    { path: "src/app/(marketing)/page.tsx", text: "clean text" },
  ]);
  assert.deepEqual(result, ["src/app/(app)/settings/page.tsx"]);
});

test("the rebrand-story about page is allowlisted", () => {
  const result = scanForOldBrand([
    { path: "src/app/(marketing)/about/page.tsx", text: "Spoodly Space is now Polly's Web!" },
  ]);
  assert.deepEqual(result, []);
});

test("old domain references count as old brand", () => {
  const result = scanForOldBrand([
    { path: "src/lib/feedback-delivery.ts", text: 'to: "support@spoodlyspace.com"' },
  ]);
  assert.deepEqual(result, ["src/lib/feedback-delivery.ts"]);
});

import { readdirSync, readFileSync } from "node:fs";

function walk(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(new URL(`${entry.name}/`, dir)) : entry.name.match(/\.(ts|tsx)$/i) ? [new URL(entry.name, dir)] : [],
  );
}

test("the source tree carries no old-brand strings outside content and allowlist", () => {
  const files = [...walk(new URL("../", import.meta.url))].filter((url) => !url.pathname.includes("/content/"));
  const found = scanForOldBrand(files.map((url) => ({ path: url.pathname.split("/src/")[1] ?? url.pathname, text: readFileSync(url, "utf8") })));
  assert.deepEqual(found, []);
});

test("package name is the new brand", async () => {
  const { readFileSync } = await import("node:fs");
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { name: string };
  assert.equal(pkg.name, "pollysweb");
});