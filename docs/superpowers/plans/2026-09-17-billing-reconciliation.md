# Billing Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Pro access when Stripe reports `past_due`, repair missed webhooks, and make every spood after the first-created one read-only for effective Free accounts while keeping history readable.

**Architecture:** Keep the existing signed webhook and customer reconciliation as the source of billing state. Add an authenticated, resumable Vercel Cron route that selects due Stripe customers and calls the same reconciliation under the existing user lock. Centralize effective entitlement and spood write eligibility so the billing UI and server actions agree.

**Tech Stack:** Next.js 16, TypeScript, Prisma/Postgres, Stripe SDK, Vercel Cron, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-billing-reconciliation-design.md`

## Global Constraints

- Never access the production database or run a seed command.
- Do not commit to `main` or deploy the live Vercel project.
- Staging rejects Stripe keys and must never contact Stripe.
- Do not delete existing spoods or care records when an account loses Pro.
- `past_due` has no Pro grace period; the first-created spood is ordered by `createdAt`, then `id`.

---

### Task 1: Subscription entitlement policy

**Files:** Modify `src/lib/billing-policy.ts`, `src/lib/billing-policy.test.ts`, `src/lib/billing-service.test.ts`; inspect `src/lib/billing-service-core.ts`.

**Interfaces:** `grantsPro(status: string): boolean` returns true only for `active` and `trialing`; `chooseSubscription` prefers entitled subscriptions over others.

- [ ] **Step 1: Write failing tests.** Assert `grantsPro("past_due") === false` and an approved-price past-due snapshot makes `account.plan === "free"`; an active replacement wins over a newer past-due subscription.
- [ ] **Step 2: Run** `node --import tsx --test src/lib/billing-policy.test.ts src/lib/billing-service.test.ts` and confirm the new cases fail for the intended policy.
- [ ] **Step 3: Remove `past_due` from `grantsPro`, preserving checkout's separate rule that any nonterminal subscription prevents duplicate checkout.**
- [ ] **Step 4: Re-run the two test files and verify the new cases pass.**

### Task 2: Resumable reconciliation queue

**Files:** Modify `prisma/schema.prisma`, `src/lib/billing-service-core.ts`, `src/lib/billing-service.test.ts`, `vercel.json`; create `prisma/migrations/20260917121000_billing_reconciliation/migration.sql`, `src/lib/billing-reconciliation.ts`, `src/lib/billing-reconciliation.test.ts`, `src/app/api/cron/reconcile-billing/route.ts`, `src/lib/billing-cron-route.test.ts`.

**Interfaces:** `reconcileStripeCustomer(customerId)` stays the sole Stripe-to-User updater; the due-queue worker calls it with stored customer IDs. `GET` requires a matching `Authorization: Bearer ${CRON_SECRET}` header. New User fields `billingLastCheckedAt`, `billingNextCheckAt`, and `billingCheckFailures` track successful checks and retries.

- [ ] **Step 1: Write failing queue tests.** A batch selects only due customers, caps the count, continues after one failure, and schedules failures earlier than successes; concurrent webhooks do not regress current Stripe state.
- [ ] **Step 2: Run the queue tests and confirm they fail because the worker is absent.**
- [ ] **Step 3: Add queue fields and SQL migration.** Index `billingNextCheckAt`; backfill Stripe customers as due while leaving non-Stripe users null. The migration must enable RLS and revoke browser-role table access for any new table (none expected).
- [ ] **Step 4: Implement the bounded worker.** Use the existing reconciliation service, record successful check time, and on error record failure count/earlier next check without mutating entitlement. Return run counts for logs and an error status when any customer fails.
- [ ] **Step 5: Write a failing route test.** Missing/wrong secret and staging requests do no work; a valid production secret invokes the worker once.
- [ ] **Step 6: Add the route and Vercel cron schedule.** Compare nonempty secrets in constant time before data access; use a Pro-compatible schedule and keep staging inert.
- [ ] **Step 7: Run focused tests and TypeScript.**

### Task 3: Effective entitlement and recovery UI

**Files:** Modify `src/lib/stripe.ts`, `src/lib/spider-slots.ts`, `src/app/(app)/upgrade/page.tsx`, `src/app/(app)/settings/page.tsx`; create `src/lib/effective-entitlement.ts`, `src/lib/effective-entitlement.test.ts`.

**Interfaces:** `effectivePro(user, now)` preserves manual Pro without a Stripe customer but requires a Stripe-backed `active` or `trialing` snapshot checked within 24 hours for paid Pro. `getBillingProfile` and `runWithSpiderSlot` use the same decision. A customer with `past_due` sees the portal route even though plan is effectively Free.

- [ ] **Step 1: Write failing tests** for past-due denial, stale active denial, manual Pro, and Free slot count.
- [ ] **Step 2: Run tests and confirm the intended failures.**
- [ ] **Step 3: Implement the shared policy and wire both read and write paths.** Keep existing spoods readable.
- [ ] **Step 4: Test and implement the billing-recovery UI** so past-due customers can reach Manage billing without starting a duplicate checkout.
- [ ] **Step 5: Run focused tests, TypeScript, and lint.**

### Task 4: First-spood write gate

**Files:** Create `src/lib/spider-write-policy.ts`, `src/lib/spider-write-policy.test.ts`; modify care actions in `src/app/actions/care-events.ts`, `src/app/actions/care-habitat.ts`, `src/app/actions/activity.ts`, `src/app/actions/about.ts`, `src/app/actions/care-shared.ts`, and Constellation review in `src/lib/constellation-data.ts` as required.

**Interfaces:** A single server-side check determines the first-created spood by `createdAt`, then `id`, and rejects all extra-spood writes when effective Pro is false. Read pages remain accessible; new Free-plan Constellation reviews include only the writable spood.

- [ ] **Step 1: Write failing tests** for first-spood allow, later-spood deny, timestamp ties, paid Pro allow, and ownership.
- [ ] **Step 2: Run tests to confirm the gate is missing.**
- [ ] **Step 3: Implement the gate and call it before all mutations** in each affected action. Filter new Free-plan Constellation reviews to the writable spood. Keep denial copy clear: billing can be managed from Settings.
- [ ] **Step 4: Run focused tests and the complete local test/type/lint/build suite.**

## Self-review

The plan covers status policy, missed-webhook repair, stale-state safety, recovery UI, and first-spood writes. The same customer ownership and approved-price checks remain in the existing reconciliation service. Stage migration and validation are separate from any production release.
