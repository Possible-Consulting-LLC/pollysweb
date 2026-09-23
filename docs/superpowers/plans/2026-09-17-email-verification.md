# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require mailbox ownership for new password accounts and phase existing password users into verification after seven days.

**Architecture:** Store hashed, expiring challenges separately from users. New signup consumes its challenge while creating the user; legacy verification marks an existing user verified. An explicit activation timestamp controls legacy credential and session access.

**Tech Stack:** Next.js Server Actions, Auth.js, Prisma/PostgreSQL, Resend, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-email-verification-design.md`

## Global Constraints

- Never backfill `emailVerified` without proof of mailbox control.
- Never access production data or run a database command in this task.
- Staging sends only with a dedicated key and an explicit recipient allowlist.

---

### Task 1: Challenge and grace policy

**Files:** `src/lib/email-verification.ts`, `src/lib/email-verification.test.ts`, `prisma/schema.prisma`, new SQL migration.

**Interfaces:** `createVerificationToken()`, `verificationTokenHash(token)`, `canUsePasswordAccount(user, now, activation)`.

- [ ] Write tests for token digest, expiration, single-use conditional consume, and legacy grace boundaries.
- [ ] Run targeted tests and observe failures due to missing functions.
- [ ] Implement pure helpers, schema, and SQL migration with no legacy deadline backfill.
- [ ] Run targeted tests and type check.

### Task 2: Delivery and account actions

**Files:** `src/lib/email-delivery.ts`, `src/app/actions/auth.ts`, `src/lib/email-actions.test.ts`.

**Interfaces:** `sendVerificationEmail(email, url)`; `registerAction`, `resendVerificationAction`, `completeRegistrationAction`, `verifyExistingEmailAction`.

- [ ] Write tests for generic registration response, no preverification user creation, safe staging configuration, resend, and token expiry.
- [ ] Run targeted tests and observe failures.
- [ ] Implement rate limited send and atomic challenge consumption.
- [ ] Run targeted tests and type check.

### Task 3: Auth gating and UI

**Files:** `src/lib/auth.ts`, `src/components/auth/forms.tsx`, `src/components/auth/email-verification-notice.tsx`, `src/app/(auth)/verify-email/page.tsx`, `src/app/(app)/home/page.tsx`, `src/app/(app)/settings/page.tsx`.

**Interfaces:** Credentials authorization and JWT callback use `canUsePasswordAccount`.

- [ ] Write tests for grace boundary, blocked legacy login/session, and verification page routing.
- [ ] Run targeted tests and observe failures.
- [ ] Add the email-first form, completion form, resend form, Home/Settings grace notice, and existing-account verification state.
- [ ] Run relevant tests, lint, and build; report configuration needed before deployment.
