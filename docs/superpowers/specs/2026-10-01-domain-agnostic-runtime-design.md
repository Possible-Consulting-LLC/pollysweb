# Domain-agnostic runtime — derive the public origin, hardcode nothing

**Date:** 2026-10-01
**Status:** Approved design (brainstorming complete; awaiting spec review)
**Owner decisions recorded:** brand text stays "Spoodly Space"; support-email replacement deferred; requirement is identical behavior with the domain derived from configuration instead of hardcoded; robots approach A approved.

## Summary

The site must keep working unchanged on any hosting domain (it is moving from `spoodlyspace.com` to `pollysweb.com`). Today exactly one runtime behavior depends on a hardcoded domain — the `robots.txt` route allows crawling only on `spoodlyspace.com` / `www.spoodlyspace.com`. A staging check script also hardcodes the staging origin. This change replaces both with derivation from existing per-deployment configuration, and swaps inert `spoodlyspace.com` sample strings in tests for neutral reserved domains. No behavior changes on production, staging, or preview deployments.

## Background

- `src/app/robots.txt/route.ts` compares the request hostname against hardcoded `spoodlyspace.com` / `www.spoodlyspace.com` and serves `Disallow: /` to everything else. Its comment documents that `VERCEL_ENV` cannot distinguish staging (the staging Vercel project deploys with `VERCEL_ENV=production`), which is why the hostname allowlist existed.
- `scripts/staging-social-disconnect-check.ts` hardcodes `https://staging.spoodlyspace.com` as the origin for email-verification and Facebook data-deletion checks.
- The codebase already derives origins from configuration everywhere else: `facebookDeletionOrigin()` (`EMAIL_VERIFICATION_ORIGIN ?? AUTH_URL`, validated), `auth.ts` and `admin/reauth-store.ts` (`AUTH_URL ?? NEXTAUTH_URL`), and `staging-guard.ts` (`isStaging()` via `SPOODLY_ENV` / `VERCEL_PROJECT_ID`).
- About 14 test files use `spoodlyspace.com`-family strings as inert sample data (staging origins, sender/recipient addresses, a fake `e2e.spoodlyspace.test` mail domain).

## Goals

- The app works identically on any domain; the public origin comes from per-deployment env (`AUTH_URL` / `NEXTAUTH_URL`), not from code.
- Zero functional references to `spoodlyspace.com` remain in runtime code and scripts.
- Fail-safe behavior: an unconfigured or invalid canonical origin always serves `Disallow: /`.

## Non-goals

- No brand-text changes ("Spoodly Space" stays in user-facing copy).
- No new environment variables; no database migrations; no infra changes in this repo.
- No changes to internal identifiers (`SPOODLY_ENV`, `SPOODLY_ALLOW_DEMO_SEED`, `spoodly-test-session` / `spoodly_tz` cookies, `/brand/spoodly-logo-mark.png`, the `spoodly-space-password-v2` hash pepper — the pepper is cryptographic material and must never change).
- No rewrites of historical records under `docs/` (they are dated audit evidence).

## Deferred owner decision: support email

The following literal `support@spoodlyspace.com` references stay **until the owner decides the replacement address**. They are the only `spoodlyspace.com` strings that remain in tracked source after this change:

- `src/lib/feedback-delivery.ts:19` — production fallback `env.FEEDBACK_TO_EMAIL || "support@spoodlyspace.com"`
- `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/data-deletion/page.tsx` — `mailto:` links
- `legal-site/index.html`, `legal-site/privacy/index.html`, `legal-site/terms/index.html` — static mailtos
- `README.md:67` and `.env.example` (feedback-related comment/example lines)

## Design

### 1. New module `src/lib/public-site.ts`

Pure function, following the house pattern of env-record-in → boolean-out modules (`staging-guard.ts`, `feedback-delivery.ts`):

```ts
type Environment = Record<string, string | undefined>;

export function isPublicSiteHost(env: Environment = process.env, requestHostname: string): boolean {
  if (isStaging(env)) return false;
  const canonical = env.AUTH_URL ?? env.NEXTAUTH_URL;
  if (!canonical) return false;
  try {
    const host = new URL(canonical).hostname;
    return requestHostname === host || requestHostname === wwwTwin(host);
  } catch {
    return false;
  }
}
```

- `isStaging()` guard closes the trap that hostname comparison alone cannot: the staging project's own `AUTH_URL` matches its own domain, and only staging-ness separates the two deployments.
- `wwwTwin(host)` derives the alternate form: `example.com ⇄ www.example.com` (strip a leading `www.`, or add one if absent). This preserves today's apex-and-www allowance without hardcoding either form.
- Unconfigured, malformed, or non-parseable canonical origin → `false` (Disallow-all). Comparison is on hostname only; the protocol is not re-validated here (`auth.ts` already governs `AUTH_URL` validity, and local `http://127.0.0.1:43123` must keep working).

### 2. `src/app/robots.txt/route.ts`

Stays `force-dynamic`. `GET` delegates to `isPublicSiteHost(process.env, new URL(request.url).hostname)` and serves the existing `publicRules` or `Disallow: /` exactly as before. The comment explaining the derivation (staging deploys as `VERCEL_ENV=production`; public-ness is derived from `isStaging()` plus the configured canonical origin) replaces the hardcoded-hostname comment.

### 3. `scripts/staging-social-disconnect-check.ts`

Derives its origin from `EMAIL_VERIFICATION_ORIGIN ?? AUTH_URL` by reusing the existing `facebookDeletionOrigin()` helper from `src/lib/facebook-deletion.ts`. The helper fails closed — throws when the origin is missing or malformed (generic `Invalid URL`) or is not a bare HTTPS origin (`'Deletion origin is not configured'`). Both hardcoded staging-origin occurrences are removed.

### 4. Test fixture swaps (mechanical)

In tests, replace inert sample strings with reserved neutral equivalents:

| Current fixture | Replacement |
|---|---|
| `https://staging.spoodlyspace.com` | `https://staging.example` |
| `http://staging.spoodlyspace.com` (invalid-origin cases) | `http://staging.example` |
| `hello@spoodlyspace.com` | `hello@example.com` |
| `e2e.spoodlyspace.test` (test mail domain) | `e2e.example.test` |

Exception — fixtures asserting the **deferred** production feedback fallback keep `support@spoodlyspace.com`: the production case of `feedback-delivery.test.ts` and the production-path assertions in `feedback-action.test.ts`. `robots.test.ts` is rewritten for the derivation (below) rather than fixture-swapped. Unrelated sample hosts (`spoodly-space-staging.vercel.app`, `spoodly-space-preview.vercel.app` — note the hyphenated project domain, not `spoodlyspace.com`) stay.

### 5. `src/lib/robots.test.ts` rewrite

Covers, with neutral domains: staging env → Disallow-all even when request host matches its canonical origin; production env with `AUTH_URL=https://example.com` → public rules on `example.com` and `www.example.com`; a different host (e.g. a preview deployment URL) → Disallow-all; `www.`-form canonical → both forms allow; missing `AUTH_URL`/`NEXTAUTH_URL` → Disallow-all; malformed canonical URL → Disallow-all; `NEXTAUTH_URL` used when `AUTH_URL` absent.

## Behavior parity

| Deployment | Before | After |
|---|---|---|
| Production apex / www (custom domain) | Allow | Allow (canonical `AUTH_URL` host + twin) |
| Production preview / unknown host | Disallow | Disallow |
| Staging project (any host) | Disallow | Disallow (`isStaging`) |
| Local dev (`http://127.0.0.1:43123`) | Disallow | **Allow** — documented, harmless edge: localhost robots.txt is meaningless; each deployment now asserts "crawlable only if not staging and on my canonical origin" |
| Canonical misconfigured/unset | Disallow (host mismatch) | Disallow (fail-safe) |

## Error handling

- `public-site.ts` never throws: every failure path returns `false` (Disallow).
- The staging script's `facebookDeletionOrigin()` helper fails closed — throws when the origin is missing or malformed (generic `Invalid URL`) or is not a bare HTTPS origin (`'Deletion origin is not configured'`).

## Testing & verification

1. New `src/lib/public-site.test.ts` (co-located, node:test/assert house style) covering the cases in §5 plus the `wwwTwin` helper.
2. Rewritten `src/lib/robots.test.ts` against the real route handler.
3. Full suite (`npm test`), TypeScript check, scoped ESLint, webpack production build — all must pass.
4. Grep gate: `rg -i "spoodlyspace\.com"` over tracked files returns only (a) the deferred support-email refs listed above, (b) `docs/` historical records, (c) build artifacts. Any other hit fails the review.

## Ops notes (outside this repo's code)

Precondition: the production project's `AUTH_URL`/`NEXTAUTH_URL` must already point at the public custom origin (not a Vercel alias) before this change deploys — otherwise robots.txt disallows the real domain and allows the alias. Verify the live values at deploy time.

- At deploy time, set the production Vercel project's `AUTH_URL` and `NEXTAUTH_URL` to the new public origin (e.g. `https://pollysweb.com`). The robots derivation follows that value; nothing in code needs to know the domain.
- Staging keeps its existing env; its robots.txt stays Disallow-all through `isStaging()`.
