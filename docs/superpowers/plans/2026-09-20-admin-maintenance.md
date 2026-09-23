# Admin and Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user must review this plan and choose execution before implementation.

**Goal:** Deliver the approved administrator dashboard, demo testing and maintenance controls in staging before the production release review.

**Architecture:** Add `/admin` to the existing Next.js app with shared server-side authorization. Distinguish real actor from effective demo identity; derive all feature limits through the existing entitlement boundary. Account management, testing sessions and maintenance share those foundations and ship as one integrated subsystem with independently tested tasks.

**Tech Stack:** Next.js App Router/server actions, Auth.js, TypeScript, Prisma/PostgreSQL, Supabase private Storage, Stripe, existing Node test runner and browser test tooling.

**Spec:** [Approved design](../specs/2026-09-20-admin-maintenance-design.md), including administrator-selected reporting timezones.

## Global constraints

- Work in `/Users/rebeccapossible/web/spoodly-space/.worktrees/staging`, branch `codex/staging-setup`; preserve unrelated dirty changes.
- No production database access, production migration/deployment, seed/reset commands, commits, or pushes in this plan. Staging migration and deployment are separate checkpoints presented to the user before execution.
- Multiple admins; the owner's account initially is the only super admin.
- The owner's immutable account ID is protected against deletion, suspension, or demotion by anyone.
- Only super admins may designate demo accounts and select their test plan. Demo plans grant actual tier features without a Stripe subscription.
- An account with a real Stripe subscription cannot become a demo account. Demo accounts cannot initiate real checkout.
- Only tagged demo accounts may be entered using “Test as.” Only super admins may do so.
- Starting maintenance gives existing users a one-minute save window, followed by server-enforced maintenance.
- Administrator-selected timezone controls reporting; original keeper care-day dates and eligibility remain unchanged.
- Initial test plans are Free and Pro. No Breeder UI until that tier exists.
- Super-admin reauthentication window: five minutes. Test-session lifetime: 60 minutes maximum. Audit retention: 12 months.
- Read the spec with this plan. Changes to approved semantics return to the user; routine implementation choices do not require additional design rounds.

## Review focus

1. An open form survives actor demotion or the end of Test as: it must fail rather than write to the wrong account (Tasks 1, 6).
2. Checkout and demo designation overlap across requests: no real subscription may slip onto a demo (Task 5).
3. An email change or partial external deletion fails: maintain identity integrity and show accurate retry state (Tasks 3, 4).
4. Local days cross DST or UTC midnight: aggregate correctly for each administrator without shifting keeper stars (Task 7).
5. An upload starts before maintenance but commits after the deadline, or the database fails: block new work safely and never report an unsaved record as saved (Tasks 8, 9).

## Working method and checkpoints

Each task follows red/green tests, implementation, focused verification, and review. Do not commit between tasks. Add small focused modules rather than expanding a single admin service. Complete local code/tests before requesting a staging schema application. Bootstrap requires the user-confirmed staging owner account ID; never infer it from email/order or print credentials. Production owner configuration belongs to the future release plan.

Test commands from the staging worktree:

```sh
node --import tsx --test src/lib/admin/*.test.ts
node --import tsx --test src/lib/*.test.ts src/lib/**/*.test.ts
npx tsc --noEmit
```

Use the existing injected-service patterns in `billing-service-core.ts` and its tests for database/Stripe unit tests. Unit tests must not load `.env.local` or connect to a database. Staging integration scripts explicitly load `.env.local`, check `SPOODLY_ENV`, call `assertStagingEnvironment()`, create uniquely identified fixtures and delete only those fixtures in `finally`.

## Task 1: Roles, owner protection and actor authorization

**Files:** create `src/lib/admin/policy.ts`, `src/lib/admin/actor.ts`, `src/lib/admin/policy.test.ts`, `src/lib/admin/actor.test.ts`; modify `prisma/schema.prisma`, `src/lib/session.ts`, `src/lib/auth.ts`; add `prisma/migrations/20260921010000_admin_foundations/migration.sql`.

**Interfaces:**

```ts
type AdminRole = 'user' | 'admin' | 'super_admin';
type AdminOperation = 'view' | 'edit' | 'suspend' | 'role' | 'delete' | 'demo';
type Actor = { id: string; role: AdminRole; owner: boolean; suspended: boolean;
  credentialVersion: string; reauthenticatedAt: number | null };
type Target = { id: string; role: AdminRole; owner: boolean; demo: boolean };
canManage(actor: Actor, target: Target, operation: AdminOperation): boolean;
requireAdminActor(minimum: 'admin' | 'super_admin'): Promise<Actor>;
```

- [ ] Write pure authorization tests over every role/target/operation, owner protection, self-demotion, suspension and forged actor claims. Include a fixture factory with all Actor/Target fields; assert `canManage(admin, owner, 'edit') === false` and `canManage(superAdmin, owner, 'delete') === false`.
- [ ] Run `node --import tsx --test src/lib/admin/policy.test.ts`; observe failure before implementing the policy.
- [ ] Add role default `user`, nullable suspension/deletion timestamps and version fields to User. Persist singleton protected owner binding in a server-only table; explicitly bootstrap from a verified configured ID and reject mismatched/missing bindings for privileged access. Add constraints for owner protection and privileged/demo exclusion; no automatic owner selection. Add a trigger preventing owner deletion/suspension/demotion and binding mutation through normal runtime operations.
- [ ] Implement `requireAdminActor` using the live actor row and credential fingerprint, with no request-body role input. Existing sessions check suspension/deleting state. Lock and re-read actor/target for privileged mutations, using sorted row IDs to avoid lock-order inversions. Preserve ordinary user sign-in behavior when no owner is bootstrapped, while rejecting all admin entry.
- [ ] Verify policy tests, stale-JWT tests, TypeScript and migration SQL review. Document the controlled bootstrap path and verify that setting an environment variable alone cannot replace an existing owner binding.

## Task 2: Audit, reauthentication and admin shell

**Files:** create `src/lib/admin/audit.ts`, `src/lib/admin/reauth.ts`, their `.test.ts` files; `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/components/admin/nav.tsx`, `src/components/admin/confirm-action.tsx`; modify settings/navigation and schema/migration from Task 1.

**Interfaces:**

```ts
type AuditInput = { actorId: string; targetId: string | null; action: string;
  reason: string; changes: Record<string, string | number | boolean | null> };
appendAudit(tx: Prisma.TransactionClient, input: AuditInput): Promise<void>;
requireRecentAdminAuth(actor: Actor, now: number): void;
```

- [ ] Add tests requiring reauthentication for missing, future and older-than-five-minute timestamps; exclude credentials/tokens from audit metadata. Example: `assert.throws(() => requireRecentAdminAuth({...actor, reauthenticatedAt: now - 300001}, now))`.
- [ ] Run failing tests, then implement actor-bound password/social reauthentication based on existing verified flows. Never accept a client timestamp or reuse the target's password. Protect role/demo/delete/maintenance mutations with it.
- [ ] Add audit table with server-only grants/RLS; store safe actor/target references that survive user deletion, not cascading user relations. Transactional actions append audit in the same commit. External workflows record attempt/result separately. Create a paginated audit query; audited cleanup removes events older than 12 months without storing raw secrets or emails unnecessarily.
- [ ] Build responsive shell with environment label, timezone display, role-aware links, and accessible confirmation component. A confirmation is explicit and keyboard usable; server validation remains required. Own preferences stay editable for admins through normal Settings, while administrative edits to privileged targets remain forbidden.
- [ ] Run authorization and reauth tests plus keyboard/focus checks; direct `/admin` requests by ordinary users must be rejected regardless of hidden navigation.

## Task 3: Account search, safe edits and operations queue

**Files:** create `src/lib/admin/accounts.ts`, `src/lib/admin/accounts.test.ts`, `src/app/admin/accounts/page.tsx`, `src/app/admin/accounts/[id]/page.tsx`, `src/app/actions/admin-accounts.ts`, `src/app/admin/operations/page.tsx`; modify `src/lib/email-challenge.ts` only where reusable primitives are needed; reuse `src/lib/social-disconnect.ts` and Facebook deletion policy.

**Interfaces:**

```ts
type AccountPatch = { name?: string; timezone?: string; dateFormat?: string;
  measurement?: string; theme?: string; feedDefaultDays?: number;
  mistDefaultDays?: number; cleanDefaultDays?: number };
updateAccount(actor: Actor, targetId: string, version: number,
  patch: AccountPatch, reason: string): Promise<void>;
requestAdminEmailChange(actor: Actor, targetId: string, email: string): Promise<void>;
```

- [ ] Write failing service tests for field allowlists, target swap, stale versions, admin-on-admin denial, owner identity protection and failed email delivery. Assert a patch containing `plan`, `emailVerified`, `passwordHash` or `role` is rejected rather than applied.
- [ ] Implement paginated name/email search and role/demo/verification/suspension/plan filters using explicit selects that omit tokens/hashes. Show current entitlement, subscription summary, join date, care activity/counts, and no invented last-login date.
- [ ] Implement optimistic-version checked edits under row locks with audit. Implement suspension/reinstatement and role updates through dedicated commands, not AccountPatch; revoke sessions and pending identity operations when appropriate. Explain that suspension alone does not cancel billing.
- [ ] Implement target-bound verified email change using `requestEmailChange`/confirmation primitives and the existing delivery allowlist. Retain old identity until token confirmation, reject uniqueness collisions, invalidate pending tokens on later credential changes, and never grant verification from admin input. Request audit and actual confirmation audit are separate events.
- [ ] Build Facebook request review with current sign-in-method validation, explicit provenance checklist and reason before completion; privileged/owner target constraints still apply. Only mark completed after actual provider-data cleanup. Show billing check failures/read-only external management links.
- [ ] Verify repeated submissions, inaccessible target IDs, provider cleanup failure and identity races with injected repositories; no real emails are sent by unit tests.

## Task 4: Confirmed, resumable account deletion

**Files:** create `src/lib/admin/account-deletion.ts`, `src/lib/admin/account-deletion.test.ts`, `src/app/actions/admin-delete-account.ts`, `src/components/admin/delete-account.tsx`; modify schema with server-only `AccountDeletionOperation`; integrate billing/storage services rather than calling an unguarded User delete from the action.

**Interfaces:**

```ts
type DeleteStage = 'blocked_access' | 'billing_canceled' | 'photos_removed' | 'completed';
beginAccountDeletion(actor: Actor, input: { targetId: string; version: number;
  confirmationEmail: string; reason: string }): Promise<string>;
resumeAccountDeletion(actor: Actor, operationId: string): Promise<DeleteStage>;
```

- [ ] Add failing tests for owner rejection, stale impact preview, wrong email, double submission, active checkout, Stripe cancellation failure, partial photo removal, and retry after successful external work but failed database acknowledgment.
- [ ] Implement unique per-target operation and initial transaction: recheck authorization, lock target, mark deleting/revoke sessions, snapshot exact owned photo object keys and impact counts. Block all new app writes/checkout for deleting users. Keep sensitive cleanup manifests internal and remove them after completion.
- [ ] Implement stages with stable idempotency keys: expire pending checkout/verify subscriptions, cancel billable subscriptions without automatic refunds, delete only recorded owned Storage objects, then remove account data and preserve minimal operation/audit receipts. Retry resumes the existing operation; never run blind cascade deletion first. Locking coordinates with Tasks 3 and 5.
- [ ] Build impact preview, typed-email confirmation and visible pending/error/retry states. Example test contract: `assert.equal(await resumeAccountDeletion(superAdmin, failedStorageOperation), 'billing_canceled')` when storage remains unavailable; no success banner.
- [ ] Verify ordinary/admin denial and cross-account cleanup isolation. Staging integration later uses disposable accounts and mocked Stripe unless isolated Stripe test fixtures are explicitly configured.

## Task 5: Demo designation and feature entitlements

**Files:** create `src/lib/admin/demo-accounts.ts`, `src/lib/admin/demo-accounts.test.ts`, `src/app/admin/demos/page.tsx`, `src/app/actions/admin-demo.ts`; modify `src/lib/effective-entitlement.ts`, `src/lib/spider-write-policy.ts`, `src/lib/spider-slots.ts`, `src/lib/stripe.ts`, `src/lib/billing-service-core.ts`, `src/app/actions/billing.ts`, schema and relevant tests.

**Interfaces:**

```ts
type DemoPlan = 'free' | 'pro';
setDemoAccount(actor: Actor, targetId: string,
  designation: { label: string; plan: DemoPlan } | null, reason: string): Promise<void>;
// Extend BillingEntitlementSnapshot with isDemo:boolean and demoPlan:DemoPlan|null.
// effectivePro first resolves a valid demo override; otherwise retains existing billing rules.
```

- [ ] Add failing tests for Free/Pro overrides at every creation/write/care-collection gate, untagging, privileged targets, any historical subscription, pending checkout and unavailable Stripe. `effectivePro({...freeBilling, isDemo: true, demoPlan:'pro'})` is true; untagging cannot leave artificial Pro behind.
- [ ] Add demo fields with database constraints (`demoPlan` present iff demo; role user only). Never mutate real billing fields when tagging. Validate label, tier and dedicated-test-account confirmation; audit before/after designation and plan.
- [ ] Use the existing serialized User row billing transaction boundary for designation and checkout. Inspect all Stripe subscriptions and open checkout sessions with pagination for an existing customer. Reject subscription history even canceled. Persist an in-progress operation guard if an external call cannot safely share the lock; checkout must check it before creating a session. Recover uncertain Stripe responses by idempotency key before permitting designation.
- [ ] Guard checkout and portal in service and action layers. Webhook reconciliation preserves demo overrides and surfaces unexpected billing associations as an operational issue; it cannot silently convert the test plan.
- [ ] Audit every `effectivePro`, `plan === 'pro'`, billing select and slot-count consumer. Update explicit Prisma selects with demo fields. Add concurrent checkout/designation tests with barriers; only one valid state may win.

## Task 6: Actor-bound Test as demo sessions

**Files:** create `src/lib/admin/test-session.ts`, `src/lib/admin/test-session.test.ts`, `src/app/actions/admin-test-session.ts`, `src/components/admin/test-session-banner.tsx`; modify `src/lib/session.ts`, app layout, schema and mutation form-context integration.

**Interfaces:**

```ts
type RequestIdentity = { actorId: string; effectiveUserId: string;
  testSessionId: string | null; contextVersion: string };
resolveRequestIdentity(): Promise<RequestIdentity>;
startTestSession(actor: Actor, demoId: string): Promise<void>;
stopTestSession(): Promise<void>;
assertMutationContext(identity: RequestIdentity, submittedContext: string): void;
```

- [ ] Write failing tests for non-demo targets, revoked demo/actor, expiry at 60 minutes, nested sessions, cookie forgery, suspended target, direct demo login and stale forms after stopping/switching Test as. Assert stale form cannot mutate actor data.
- [ ] Store a hash of a cryptographically random opaque token server-side, bind actor credential version and target, and use a secure HttpOnly SameSite cookie. Re-read actor/target on requests. Preserve real actor session. Return effective identity only for ordinary account data; require actor identity separately for administrative authorization.
- [ ] Propagate an authenticated context version through all mutation forms/actions, not just the banner. Reject mismatches before lookup/write; do not fall back from an invalid test session to actor writes. Secure photo reads by effective user. Deny admin actions while testing except Stop; deny email/password/provider/billing changes through testing context.
- [ ] Add banner and Return control; explain same-browser tabs and that demo data changes persist. Record starts, explicit ends, expiry/revocation and actor+target on test mutations without recording private care content.
- [ ] Run session isolation tests and browser two-tab scenario, including a pre-existing super-admin tab submitting after Test as begins.

## Task 7: Timezone-correct analytics

**Files:** create `src/lib/admin/analytics-period.ts`, `src/lib/admin/analytics-period.test.ts`, `src/lib/admin/metrics.ts`, `src/lib/admin/metrics.test.ts`, `src/components/admin/metrics.tsx`; modify overview/accounts/audit pages and existing personal timezone controls.

**Interfaces:**

```ts
type ReportingPeriod = { zone: string; start: Date; end: Date; partialToday: boolean };
reportingPeriod(zone: string, days: 7 | 14, now: Date): ReportingPeriod;
loadAdminMetrics(period: ReportingPeriod, includeDemo: boolean): Promise<AdminMetrics>;
// AdminMetrics: totals, newAccountCount, activeKeeperCount, perDayCounts,
// careTypeCounts, topKeepers, starCount, badgeCounts, generatedAt; explicit typed DTOs.
```

- [ ] Add failing tests pinned to `America/Los_Angeles`, UTC and `Asia/Tokyo`; cover spring/fall DST, midnight, future records and administrator-cache separation. For `now=2026-03-10T19:00:00Z`, seven LA local days start `2026-03-04T08:00:00Z`, not a fixed-duration subtraction. Assert stored keeper day keys are unchanged.
- [ ] Implement IANA validation and local-calendar boundary conversion with a timezone-aware API; if the current date utilities cannot do this safely, use a focused vetted timezone dependency and lockfile rather than hand-written UTC-offset arithmetic. Prefer account timezone over browser cookie; prompt when unset and visibly label any UTC fallback. All endpoints derive administrator preference server-side.
- [ ] Query aggregates and top accounts with parameterized, bounded queries. Filter `[start,end]` capped at server now and use local grouping; use exclusive next-midnight for closed explicit dates. Label today partial. Count active keepers by distinct qualifying care author, not updatedAt. Exclude demos by default. Count badge eligibility from current records, never CelebratedReward notification counts.
- [ ] Render overview cards, tables and daily charts with timezone/date labels; audit/account times follow the same zone. Cache only aggregate data with zone/filter/range keys and a displayed generatedAt; retain original keeper care-day labels separately from completion instants.
- [ ] Test aggregate results against known fixtures, including a withdrawn care star, demo Pro vs paid Pro, corrected events and memorialized spoods. Document exact care types counted.

## Task 8: Maintenance state and server enforcement

**Files:** create `src/lib/admin/maintenance-state.ts`, `src/lib/admin/maintenance-policy.ts`, their tests, `src/app/actions/admin-maintenance.ts`, `src/app/api/site-status/route.ts`, `src/app/maintenance/page.tsx`; modify session/auth/data actions/photo routes/cron and shared write guards.

**Interfaces:**

```ts
type MaintenanceState = { version: number; deadline: Date | null;
  announcementEnabled: boolean; announcement: string };
maintenanceMode(state: MaintenanceState, now: Date): 'open' | 'countdown' | 'active';
assertSiteAccess(identity: RequestIdentity | null, state: MaintenanceState,
  now: Date, operation: 'read' | 'write'): Promise<void>;
setMaintenance(actor: Actor, version: number, enabled: boolean): Promise<void>;
```

- [ ] Write failing tests at deadline minus 1ms, exactly deadline and after; test concurrent start/off, stale version, expired Test as, ordinary/direct-demo denial, super-admin bypass and state-load failure.
- [ ] Store singleton state with optimistic version and audit. Start sets server `now+60000`; repeated start retains deadline. Stop/cancel clears it explicitly. Announcement validates bounded plain text separately. Maintenance role checks must not call an ordinary-user guard recursively.
- [ ] Implement uncached server guards at data reads/actions and immediately before write commit. Return typed maintenance errors to actions, 503/Retry-After to data APIs and a static fallback on state/auth database failure. Scan every `src/app/actions`, API route and direct `auth()`/Prisma entry; record allowlist/guard mapping in `docs/staging/admin-entry-points.md`.
- [ ] Keep minimal assets, maintenance/status, legal/deletion status and super-admin authentication reachable. OAuth completion must not grant ordinary app access during maintenance. Existing signed Stripe/Facebook callbacks retain signature checks and retryable failure behavior; pause billing cron while active. Never return success for skipped webhooks. Ensure super-admin exceptions are live actor checks, not a demo or client flag.
- [ ] Cover upload completion after deadline, rollback/cleanup of unattached objects, in-flight transaction boundaries and database outage. Document that already-admitted work and callbacks must drain/be managed separately before incompatible migrations.

## Task 9: Maintenance controls and user warnings

**Files:** create `src/app/admin/maintenance/page.tsx`, `src/components/admin/maintenance-controls.tsx`, `src/components/layout/site-status.tsx`; modify root/app layouts and form error handling.

**Interfaces:** use MaintenanceState plus a public status DTO containing only server time, deadline, mode and enabled announcement text; privileged exemption is never exposed as a client-controlled input.

- [ ] Write browser tests for announcement independent of maintenance, countdown saving, stale form preservation, expired/revoked Test as, focus return and multiple tabs. Expected copy at countdown: “Please save your work. Maintenance begins shortly.”
- [ ] Implement status polling every five seconds at most while visible; refresh on focus/visibility and use server clock/deadline. Never reset deadline on navigation. Display a persistent accessible countdown without repeated per-second screen-reader announcements. Stop unnecessary polling while hidden, resume immediately on focus.
- [ ] Build announcement preview/edit/on/off and start/cancel/reopen confirmation controls. Display active environment and expected deadline in admin timezone. Super-admin app banner explains privileged access; demo banner also shows actual test tier. Maintain inline unsaved-form error before any navigation.
- [ ] Verify mobile/desktop, keyboard focus, slow network and sleeping-tab behavior. Explain the limit that a suspended browser may not display the full minute; no claim of database-offline super-admin access.

## Task 10: Staging integration, review and handoff

**Files:** create `scripts/staging-admin-check.ts`, `docs/staging/admin-operations.md`, `docs/staging/admin-acceptance.md`; update existing staging handoff document with migrations, configuration and rollback limits.

- [ ] Complete spec coverage checklist and all relevant unit tests/TypeScript/targeted lint before requesting the staging migration checkpoint. Read migration SQL for additive changes and server-only tables. Record rollback risks: old code ignores suspension/maintenance/demo guards, so rolling back cannot be assumed security-equivalent.
- [ ] Present exact pending migration(s) and staging owner-binding procedure for approval. After approval use `node --import tsx scripts/staging-db.mjs status` and `deploy`; never unguarded migrate/reset/seed. Confirm the user-selected staging owner ID and bootstrap only that account. Do not set production values.
- [ ] Integration script follows this setup pattern, with fixture IDs captured before cleanup:

```ts
dotenv.config({ path: '.env.local', override: true, quiet: true });
assert.equal(process.env.SPOODLY_ENV, 'staging');
assertStagingEnvironment();
// Every created account gets a random test prefix and @example.invalid email.
// finally deletes only captured non-owner fixture IDs; global settings restored by version.
```

- [ ] Use a dedicated unit/integration repository to test protected owner invariants without replacing the real owner. For live staging verify bound owner read-only. Create disposable ordinary/admin/demo fixtures, exercise scoped edits and cleanup, test expiration and concurrent subscription/designation with Stripe fakes. Do not send emails to real inboxes or charge cards.
- [ ] Request a separate approval before briefly testing global maintenance on shared staging; agree on timing. Capture old announcement/state, exercise countdown/read/write denial and super-admin/demo bypass, then restore only if the current version is still the test's version. Never overwrite concurrent human changes.
- [ ] Run full unit suite, TypeScript, targeted lint and production-mode staging build. Conduct independent code/security review of authorization, payment races, impersonation, deletion and maintenance bypasses; fix concrete findings and rerun affected checks.
- [ ] Present results and request staging deployment approval. Verify `.vercel/project.json` is `spoodly-space-staging` before CLI deployment; use no Git push. Verify custom domain deployment ID and browser acceptance with approved demo fixtures.
- [ ] Document owner setup, delegated roles, timezone analytics definitions, demo test-plan behavior, irreversible deletion, resumable failure handling, audit cleanup, maintenance drain/reopen procedure and open limitations. Mark each checklist result with evidence. After user acceptance, return to the previously requested deep production-release peer review; do not begin production work automatically.

## Completion criteria

All approved role/owner/demo/maintenance requirements and timezone analytics pass unit plus staging acceptance tests; no unresolved critical/important review findings; no destructive production operations; no unapproved deployment. Any inability to guarantee subscription exclusion, actor isolation or owner protection blocks enabling those controls.
