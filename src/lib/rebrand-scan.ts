// Allowlist: paths that legitimately reference the old brand. The about page
// names it in the rebrand story; the scanner and its tests self-match by
// necessity (they contain the patterns they detect).
const ALLOWLIST = new Set([
  "app/(marketing)/about/page.tsx",
  "lib/rebrand-scan.ts",
  "lib/rebrand.test.ts",
]);

/** Paths whose text still carries the old brand ("Spoodly Space" or its
 * domains). Paths are normalized (leading "src/" stripped) before the
 * allowlist check. */
export function scanForOldBrand(files: Array<{ path: string; text: string }>): string[] {
  return files
    .filter((file) => !ALLOWLIST.has(file.path.replace(/^src\//, "")))
    .filter((file) => /Spoodly Space|spoodlyspace\.com|spoodly\.space|spoodly-space\.vercel\.app/.test(file.text))
    .map((file) => file.path);
}