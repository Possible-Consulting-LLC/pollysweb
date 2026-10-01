# Domain-Agnostic Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every functional hardcode of `spoodlyspace.com` so the public origin is derived from per-deployment configuration (`AUTH_URL` / `NEXTAUTH_URL`) with identical behavior on every deployment.

**Architecture:** A new pure module `src/lib/public-site.ts` decides "am I the public site" from `isStaging()` plus the configured canonical origin (with a derived apex⇄www twin); the robots route delegates to it; the staging check script derives its origin via the existing `facebookDeletionOrigin()` helper; inert `spoodlyspace.com` fixtures in tests swap to reserved neutral domains.

**Tech Stack:** Next.js App Router route handler, TypeScript, node:test + node:assert/strict via `tsx --test`, ESLint, webpack production build.

**Spec:** `docs/superpowers/specs/2026-10-01-domain-agnostic-runtime-design.md`

## Global Constraints

- No new environment variables; no database migrations.
- Brand text stays "Spoodly Space" everywhere.
- Internal identifiers are untouched: `SPOODLY_ENV`, `SPOODLY_ALLOW_DEMO_SEED`, `spoodly-test-session` / `spoodly_tz` cookies, `/brand/spoodly-logo-mark.png`, and the password pepper `"spoodly-space-password-v2\0"` + `"spoodly-password-v2$"` in `src/lib/password-policy.ts` (cryptographic material — never change).
- Deferred support-email references stay verbatim: `src/lib/feedback-delivery.ts:19`, the `mailto:` links in `src/app/terms/page.tsx` / `src/app/privacy/page.tsx` / `src/app/data-deletion/page.tsx`, `legal-site/*.html`, `README.md:67`, `.env.example` feedback lines.
- Historical records under `docs/` are not rewritten.
- Fixture swaps use exactly: `https://staging.spoodlyspace.com` → `https://staging.example`, `http://staging.spoodlyspace.com` → `http://staging.example`, `hello@spoodlyspace.com` → `hello@example.com`, `support@spoodlyspace.com` (staging fixtures only) → `support@example.com`, `e2e.spoodlyspace.test` → `e2e.example.test`.
- No git pushes, ever. Commit messages: conventional prefix, lowercase (`feat:`, `test:`, `chore:`).
- Test commands: full suite `npm test`; single file `npx tsx --test <file>`.

## Review Focus

1. **Canonical host with a port or uppercase letters** (e.g. `AUTH_URL=https://EXAMPLE.com:8443`): hostname comparison is case-insensitive and port-blind, so a request to `example.com` still gets public rules — pinned in Task 1.
2. **`wwwTwin` on a multi-label www host** (`www.sub.example.com` → `sub.example.com`): the twin strips/adds exactly one `www.` label — pinned in Task 1.
3. **Empty-string vs missing canonical** (`AUTH_URL=""` or unset): both must Disallow-all, never Allow — pinned in Task 1.
4. **`VERCEL_PROJECT_ID` leaking a staging value into a public case**: `isStaging()` also matches the staging project ID, so tests must pin `VERCEL_PROJECT_ID: undefined` for public cases and the staging ID for the staging case — pinned in Tasks 1–2.
5. **Preview-deployment hostnames** (`*.vercel.app` on a non-staging project): request host never matches the canonical host → Disallow-all, same as today — pinned in Task 2.

---

### Task 1: `src/lib/public-site.ts` — public-site derivation

**Files:**
- Create: `src/lib/public-site.ts`
- Create: `src/lib/public-site.test.ts`

**Interfaces:**
- Consumes: `isStaging(env?: Record<string, string | undefined>): boolean` from `./staging-guard`.
- Produces:
  - `isPublicSiteHost(env: Record<string, string | undefined> = process.env, requestHostname: string): boolean`
  - `wwwTwin(host: string): string` — strips one leading `www.`, or adds one if absent.
- Later tasks rely on exactly these two exports; do not rename or add parameters.

- [ ] **Step 1: Write the failing test** — `src/lib/public-site.test.ts`, house style (`node:assert/strict` + `node:test` `it`):

```ts
import assert from "node:assert/strict";
import { it } from "node:test";
import { isPublicSiteHost, wwwTwin } from "./public-site";

it("allows the canonical origin host and its www twin, nobody else", () => {
  const env = { AUTH_URL: "https://example.com", VERCEL_PROJECT_ID: undefined };
  assert.equal(isPublicSiteHost(env, "example.com"), true);
  assert.equal(isPublicSiteHost(env, "www.example.com"), true);
  assert.equal(isPublicSiteHost(env, "other.example.com"), false);
  assert.equal(isPublicSiteHost(env, "spoodly-space-preview.vercel.app"), false);
});

it("falls back to NEXTAUTH_URL when AUTH_URL is absent", () => {
  const env = { AUTH_URL: undefined, NEXTAUTH_URL: "https://www.example.com", VERCEL_PROJECT_ID: undefined };
  assert.equal(isPublicSiteHost(env, "www.example.com"), true);
  assert.equal(isPublicSiteHost(env, "example.com"), true);
});

it("disallows on staging even when the request host matches the canonical origin", () => {
  const env = { SPOODLY_ENV: "staging", AUTH_URL: "https://staging.example" };
  assert.equal(isPublicSiteHost(env, "staging.example"), false);
  const envById = { SPOODLY_ENV: "production", VERCEL_PROJECT_ID: "prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO", AUTH_URL: "https://staging.example" };
  assert.equal(isPublicSiteHost(envById, "staging.example"), false);
});

it("disallows when the canonical origin is missing, empty, or malformed", () => {
  assert.equal(isPublicSiteHost({}, "example.com"), false);
  assert.equal(isPublicSiteHost({ AUTH_URL: "" }, "example.com"), false);
  assert.equal(isPublicSiteHost({ AUTH_URL: "not a url" }, "example.com"), false);
});

it("compares hostnames case-insensitively and ignores the canonical port", () => {
  const env = { AUTH_URL: "https://EXAMPLE.com:8443", VERCEL_PROJECT_ID: undefined };
  assert.equal(isPublicSiteHost(env, "example.com"), true);
  assert.equal(isPublicSiteHost(env, "www.example.com"), true);
});

it("derives the apex/www twin by one www label", () => {
  assert.equal(wwwTwin("example.com"), "www.example.com");
  assert.equal(wwwTwin("www.example.com"), "example.com");
  assert.equal(wwwTwin("www.sub.example.com"), "sub.example.com");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test src/lib/public-site.test.ts`
Expected: FAIL — cannot find module `./public-site`.

- [ ] **Step 3: Implement `src/lib/public-site.ts` per spec §1** — the spec's code block is the implementation; `wwwTwin` lowercases nothing itself (URL parsing already lowercases) and must strip exactly one leading `www.` label.

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test src/lib/public-site.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/public-site.ts src/lib/public-site.test.ts
git commit -m "feat: derive public-site status from staging guard + canonical origin"
```

---

### Task 2: robots route delegates; rewrite `robots.test.ts`

**Files:**
- Modify: `src/app/robots.txt/route.ts:18-28` (GET body + comment)
- Test: `src/lib/robots.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `isPublicSiteHost(env, requestHostname)` from Task 1.
- Produces: route behavior only — same response shapes (`publicRules` text or `"User-agent: *\nDisallow: /\n"`, `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-store`).

- [ ] **Step 1: Rewrite the failing test** — replace the whole `src/lib/robots.test.ts` with a version that controls `process.env` per case (save and restore `AUTH_URL`, `NEXTAUTH_URL`, `SPOODLY_ENV`, `VERCEL_PROJECT_ID` in a `try`/`finally`). Keep the existing public-rules body assertions (`Allow: /`, `Disallow: /spoods`, `Disallow: /api/`, `Allow: /api/brand/`, both headers). Cases:

```ts
// staging: Disallow-all even though the host matches its own canonical origin
env = { SPOODLY_ENV: "staging", AUTH_URL: "https://staging.example" } → hosts ["staging.example", "spoodly-space-staging.vercel.app", "localhost:43123"] all "User-agent: *\nDisallow: /\n"
// staging via project id only
env = { SPOODLY_ENV: "production", VERCEL_PROJECT_ID: "prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO", AUTH_URL: "https://staging.example" } → host "staging.example" → Disallow-all
// public: canonical apex and www twin get public rules
env = { SPOODLY_ENV: "production", VERCEL_PROJECT_ID: undefined, AUTH_URL: "https://example.com" } → hosts ["example.com", "www.example.com"] → public rules + both headers
// public via NEXTAUTH_URL fallback
env = { SPOODLY_ENV: "production", AUTH_URL: undefined, NEXTAUTH_URL: "https://example.com", VERCEL_PROJECT_ID: undefined } → host "example.com" → public rules
// preview/unknown host on a public deployment → Disallow-all
env = { SPOODLY_ENV: "production", AUTH_URL: "https://example.com", VERCEL_PROJECT_ID: undefined } → host "preview.vercel.app" → Disallow-all
// missing canonical → Disallow-all
env = { SPOODLY_ENV: "production", AUTH_URL: undefined, NEXTAUTH_URL: undefined, VERCEL_PROJECT_ID: undefined } → host "example.com" → Disallow-all
// malformed canonical → Disallow-all
env = { SPOODLY_ENV: "production", AUTH_URL: "not a url", VERCEL_PROJECT_ID: undefined } → host "example.com" → Disallow-all
```

- [ ] **Step 2: Run to verify it fails against the old route**

Run: `npx tsx --test src/lib/robots.test.ts`
Expected: FAIL — old route hardcodes `spoodlyspace.com` hosts (public cases get Disallow, staging case gets public rules or unchanged Disallow mismatch).

- [ ] **Step 3: Change `src/app/robots.txt/route.ts`** — GET computes `isPublicSiteHost(process.env, new URL(request.url).hostname)` and returns the existing `publicRules` or Disallow-all response unchanged; replace the old VERCEL_ENV comment with one sentence stating the derivation (staging deploys as `VERCEL_ENV=production`; public-ness = not staging and request host matches the configured canonical origin or its www twin).

- [ ] **Step 4: Run to verify it passes**

Run: `npx tsx --test src/lib/robots.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/robots.txt/route.ts src/lib/robots.test.ts
git commit -m "feat: robots.txt derives the public origin from env instead of hardcoded hosts"
```

---

### Task 3: staging check script derives its origin

**Files:**
- Modify: `scripts/staging-social-disconnect-check.ts:12` and `:31`

**Interfaces:**
- Consumes: `facebookDeletionOrigin(env: Record<string, string | undefined>): string` from `../src/lib/facebook-deletion` (returns the origin string; throws `Deletion origin is not configured` when `EMAIL_VERIFICATION_ORIGIN ?? AUTH_URL` is missing/malformed).
- Produces: script behavior only.

- [ ] **Step 1: Delete line 12** (`process.env.EMAIL_VERIFICATION_ORIGIN = "https://staging.spoodlyspace.com";`) — the script must use the operator's configured origin, not override it. `assertStagingEnvironment()` on line 13 still validates the origin when present.

- [ ] **Step 2: Derive the callback origin** — near the top of `main()` after `assertStagingEnvironment()`, add `const origin = facebookDeletionOrigin(process.env);` (with the corresponding import), and build line 31's request as `new Request(\`${origin}/api/facebook/data-deletion\`, ...)`.

- [ ] **Step 3: Verify compile + no literals remain**

Run: `npx tsc --noEmit && grep -n 'spoodlyspace' scripts/staging-social-disconnect-check.ts; echo "grep exit: $?"`
Expected: tsc reports no errors; grep finds nothing (exit 1).

- [ ] **Step 4: Commit**

```bash
git add scripts/staging-social-disconnect-check.ts
git commit -m "chore: staging disconnect check derives its origin from configured env"
```

---

### Task 4: neutral-domain fixture swaps in tests

**Files:**
- Modify: `src/lib/email-verification.test.ts` (lines 49, 51, 56, 58)
- Modify: `src/lib/facebook-deletion-route.test.ts` (lines 16, 35 — line 35 is the regex `staging\.spoodlyspace\.com` → `staging\.example`)
- Modify: `src/lib/facebook-deletion.test.ts` (line 19 — both sides of the assertion)
- Modify: `src/lib/feedback-delivery.test.ts` (lines 8, 10, 11, 12, 19, 20 **only** — lines 29, 30, 32 are the deferred production-fallback assertions and must stay verbatim)
- Modify: `src/lib/feedback-action.test.ts` (lines 25, 26, 27, 28, 53, 54 — every spoodlyspace occurrence in this file is staging-path; the spec's production exception applies to none of it)
- Modify: `src/lib/staging-guard.test.ts` (lines 29, 30, 36, 37)
- Modify: `tests/integration/global-setup.ts` (line 43), `tests/integration/fixtures.ts` (line 244), `tests/integration/admin-subscriptions.spec.ts` (line 19)

**Interfaces:**
- Consumes: nothing new. Produces: no behavior change; all swapped strings are inert sample data.

- [ ] **Step 1: Apply the mapping table from Global Constraints per file and line above.** Do not touch any file outside this list.

- [ ] **Step 2: Run the unit suite**

Run: `npm test`
Expected: PASS — same test count as baseline (1153) plus Task 1/2 additions, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add -A src/lib tests/integration
git commit -m "test: swap spoodlyspace.com fixtures for reserved neutral domains"
```

---

### Task 5: full verification gates

**Files:**
- Modify: nothing (verification + wrap-up only)

- [ ] **Step 1: Full gates**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build -- --webpack`
Expected: all pass; test count ≈ 1164 (baseline 1153 − 2 replaced robots tests + 6 new public-site tests + 7 rewritten robots tests), 0 failures.

- [ ] **Step 2: Grep gate**

Run: `rg -l 'spoodlyspace\.com' -g '!.next' -g '!node_modules' .`
Expected — the ONLY tracked files remaining:
`src/lib/feedback-delivery.ts`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/data-deletion/page.tsx`, `legal-site/index.html`, `legal-site/privacy/index.html`, `legal-site/terms/index.html`, `README.md`, `.env.example`, `docs/**` historical records, and the spec/plan documents themselves. Any other file is a failure.

- [ ] **Step 3: Commit any stragglers and report the board to the owner**

```bash
git status --short
git log --oneline codex/plan-creator..HEAD
```