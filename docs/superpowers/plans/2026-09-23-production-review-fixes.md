# Production Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the confirmed production-readiness findings in the staging worktree without database execution, deployment, commits, pushes, or production access.

**Architecture:** Encode missing database protections in a new additive migration; make photo authorization cover every owned schema reference; move entitlement admission into the same locked transaction as each spood mutation; bound historical derivation and deletion queries; and align billing, storage readiness, Free-plan replacement behavior, and accessibility with what the UI promises. Each behavior change begins with a regression test that fails for the reviewed defect.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL migration SQL, Supabase Storage, Stripe, Node test runner.

**Spec:** Production-readiness findings approved in the September 23, 2026 review; supporting behavior is documented in `docs/staging/main-to-staging-handoff-2026-09-19.md`.

## Global Constraints

- Work only in `.worktrees/staging`; do not modify `main`.
- Never access production or execute database, seed, reset, or migration commands.
- Do not deploy, commit, or push.
- Preserve all existing user, spood, care, billing, photo, and audit data.
- Use test-first RED→GREEN cycles for every runtime behavior change.
- Free write access follows the oldest active spood; a memorialized earlier spood does not strand its active replacement.

## Review Focus

- Data API roles must have no access to email-verification challenges even when Supabase default grants are permissive.
- Private photo reads must accept every owned schema photo reference and reject another keeper’s matching reference.
- A concurrent Pro-to-Free reconciliation must win before a later-spood write commits.
- Historical care correction must remain accurate without complete-history work on every page render.
- Production readiness must fail when private storage is missing even if auth and database settings exist.

---

### Task 1: Harden pending email verification storage

**Files:**
- Create: `prisma/migrations/20260923010000_harden_pending_email_verification/migration.sql`
- Modify: `src/lib/admin/admin-migration.test.ts` or the closest migration contract test

**Interfaces:**
- Produces: an additive, idempotent hardening migration enabling RLS and revoking `PUBLIC`, `anon`, and `authenticated` access.

- [ ] Add a migration contract test requiring both RLS and explicit revocations for `PendingEmailVerification`.
- [ ] Run the focused test and confirm it fails because the hardening migration is absent.
- [ ] Add the new migration without changing or deleting any rows.
- [ ] Run the focused test and confirm it passes.

### Task 2: Complete private-photo ownership authorization

**Files:**
- Modify: `src/app/api/photos/route.ts`
- Modify/Create: a focused production-query contract test under `src/lib/`

**Interfaces:**
- Produces: `ownsReference(reference, userId)` coverage for `Photo.url`, `Spider.profilePhoto`, `Enclosure.photo`, `FeedingEvent.photoUrl`, `MoltEvent.moltPhoto`, `MoltEvent.postMoltPhoto`, and `ObservationEvent.photoUrl` through relational user ownership.

- [ ] Add a regression test proving event/enclosure-only references are absent from the production ownership query.
- [ ] Run it and confirm RED.
- [ ] Extend the query with ownership-scoped checks for every schema reference.
- [ ] Run focused private-photo tests and confirm GREEN, including foreign-user rejection.

### Task 3: Make entitlement admission atomic with spood writes

**Files:**
- Modify: `src/lib/spider-write-policy.ts`
- Modify: `src/lib/maintenance-write.ts` and mutation helpers/callers as needed
- Modify: care, profile, photo, habitat, memorial, and activity actions that mutate a spood
- Modify/Create: `src/lib/spider-write-policy.test.ts` and transaction integration tests

**Interfaces:**
- Produces: a transaction-scoped helper that locks the user, resolves effective entitlement and oldest active spood using that transaction, and performs the authorized mutation before releasing the lock.

- [ ] Add a concurrency regression test where reconciliation changes Pro to Free between preliminary ownership resolution and mutation admission.
- [ ] Run it and confirm the later-spood mutation currently commits incorrectly.
- [ ] Implement the locked transaction admission helper and migrate every spood write path to it.
- [ ] Run focused write-policy, billing, activity, and care tests and confirm GREEN.

### Task 4: Align Free replacement-spood behavior

**Files:**
- Modify: `src/lib/spider-write-policy.ts`
- Modify: `src/lib/constellation-data.ts`
- Modify: related tests and handoff documentation

**Interfaces:**
- Produces: oldest-active-spood selection shared by mutation authorization and care review.

- [ ] Add a regression test for memorialized A plus active B: B is writable and appears in care review.
- [ ] Run it and confirm RED.
- [ ] Exclude memorialized spoods when selecting the Free writable spood and reuse the result in care review.
- [ ] Run focused slot, write-policy, constellation, and memorial tests and confirm GREEN.

### Task 5: Replace full-history page-load reconciliation

**Files:**
- Modify: `src/lib/care-revalidation-data.ts`
- Modify: mutation call sites that know the affected date/account
- Modify: `src/lib/constellation-data.ts`
- Modify/Create: care-day revalidation tests

**Interfaces:**
- Produces: bounded affected-day reconciliation for edits/deletions and a lightweight page-read path that does not scan all event history.

- [ ] Add query-contract tests proving Home/Constellation reads do not fetch every care event and that an edited historical day is still reevaluated.
- [ ] Run and confirm RED.
- [ ] Move reconciliation to mutation-time affected-day processing, retaining reversible care-star and badge withdrawal/restoration.
- [ ] Run care-day, history, celebration, Home-data, and constellation tests and confirm GREEN.

### Task 6: Bound account-deletion media discovery

**Files:**
- Modify: `src/lib/admin/deletion-photos.ts`
- Modify: `src/lib/admin/deletion-photos.test.ts`

**Interfaces:**
- Produces: target-owned media queries plus bounded checks for whether candidate storage keys are referenced by another account.

- [ ] Add a regression test rejecting unscoped `findMany` calls and preserving shared-key exclusion.
- [ ] Run and confirm RED.
- [ ] Query the target’s relational records first, then check only candidate keys for foreign references.
- [ ] Run deletion photo, account deletion, and deletion recovery tests and confirm GREEN.

### Task 7: Make production storage configuration truthful

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `src/app/api/health/route.ts`
- Modify: `src/lib/health-route.test.ts`
- Modify: production privacy/terms copy if the private-storage rollout is the release contract

**Interfaces:**
- Produces: a health response that requires valid private-storage configuration and documentation that requires a private bucket plus `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] Add health-route tests proving missing or non-service storage credentials fail readiness without exposing secret details.
- [ ] Run and confirm RED.
- [ ] Extend readiness checks and update configuration/legal documentation to the private-photo contract.
- [ ] Run health, staging-guard, storage, privacy, and robots tests and confirm GREEN.

### Task 8: Make checkout confirmation reflect effective entitlement

**Files:**
- Modify: `src/app/(app)/upgrade/page.tsx`
- Modify/Create: focused upgrade presentation test

**Interfaces:**
- Produces: confirmed-Pro messaging only when the loaded billing profile grants Pro; otherwise a processing/reconciliation message.

- [ ] Add presentation tests for `success=1` with Pro and Free/recovery states.
- [ ] Run and confirm RED for the Free return case.
- [ ] Gate welcome copy on effective Pro and show truthful processing copy otherwise.
- [ ] Run focused billing and presentation tests and confirm GREEN.

### Task 9: Repair interactive semantics and minor reviewed UI defects

**Files:**
- Modify: `src/components/ui/button.tsx` or replace Link/Button compositions with styled Links
- Modify: Home, Settings, My Spoods, profile photo empty state, and quick-log disclosure controls
- Modify/Create: presentation/accessibility tests

**Interfaces:**
- Produces: one interactive element per navigation CTA, correct filtered empty states, correct read-only photo text, and `aria-expanded` on every disclosure trigger.

- [ ] Add static/presentation tests that reject Link-wrapped buttons and require disclosure state/text distinctions.
- [ ] Run and confirm RED.
- [ ] Render styled links directly, distinguish filtered empty results, correct read-only photo instructions, and add missing ARIA state.
- [ ] Run focused UI tests and confirm GREEN.

### Task 10: Whole-branch verification and independent review

**Files:**
- Modify: `docs/staging/admin-acceptance.md`
- Modify: `docs/staging/main-to-staging-handoff-2026-09-19.md`

**Interfaces:**
- Produces: reviewable staging-only code and an evidence record; no deployment or database execution.

- [ ] Run the full 692+ test suite, TypeScript, ESLint, Prisma validation with inert local URLs, `git diff --check`, and a production-mode local build.
- [ ] Run `npm audit --omit=dev` if network access is available.
- [ ] Request a fresh whole-branch code/security review and fix any Critical/Important finding with another RED→GREEN test.
- [ ] Update staging handoff/acceptance evidence and present the exact diff and remaining rollout gates for separate approval.

## Self-review

- Spec coverage: all nine confirmed runtime, migration, configuration, performance, product-policy, and accessibility findings map to Tasks 1–9.
- Placeholder scan: no implementation placeholder or deferred task remains.
- Type consistency: Task 3 produces transaction-scoped write admission consumed by all spood mutation paths; Task 4 reuses its oldest-active rule in care review.
- Review-focus coverage: each listed failure mode has an explicit regression test in Tasks 1–7.
