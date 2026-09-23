# Admin staging acceptance

Execution status: local preparation verified; staging acceptance in progress. Updated September 23, 2026. An unchecked live item is not completed by an offline test or a historical deployment.

## Local implementation evidence

Tasks 1–9 have passed their recorded independent per-task spec/security/quality reviews, including the first fix rounds for Tasks 2/3/4/6/8/9. See the uncommitted `.superpowers/sdd/2026-09-20-admin-maintenance/progress.md` ledger and task reports/reviews. Task 9's final full suite passed 670 tests. This does not establish that PostgreSQL triggers, browser flows, or remote services work in staging.

Task 10 added an import-safe guarded fixture script, offline guard/restoration tests, a static PUBLIC-grant regression, the completed local coverage map/runbooks and cumulative handoff. Its historical local-only evidence is recorded in `.superpowers/sdd/2026-09-20-admin-maintenance/task-10-report.md`. Later approved staging checkpoints executed the guarded fixture, production-mode build, deployment, maintenance rehearsal and scoped browser acceptance; their actual evidence is recorded below.

The final whole-feature review identified three integration findings, corrected locally in one final fix wave: Facebook owned-write versions and final audit version, reachable Test-as Return inside the blocking modal, and exact registration-proof removal with a separate legacy cleanup migration. Current evidence is in `.superpowers/sdd/2026-09-20-admin-maintenance/final-fix-report.md`: 40 focused tests and all 687 full-suite tests pass, plus TypeScript/lint/offline Prisma checks. Scoped independent re-review remains required; this is implementer evidence, not live acceptance.

## Required approvals and environment

Guarded staging evidence (September 23, 2026): project `nfdecdylxcmuypxodppe` initially reported 17 local migrations and exactly the two reviewed migrations below as unapplied. A separately approved read-only count found exactly **1** row matching the cleanup predicate. The owner then explicitly approved both migrations; guarded deployment applied both successfully and the post-deploy status reported the database schema up to date.

- [x] Review, explicitly approve and apply both migrations listed below, including the separate intentionally destructive legacy authentication-metadata cleanup. Evidence: guarded deploy and post-deploy status on September 23, 2026.
- [x] Confirm and bind the staging owner: `rebecca@rebecca79.com`, immutable ID `cmu2th6ml0000i904zjrje3gl`. Read-only verification confirmed the exact binding, sole privileged role, eligibility, rotated session version and enabled owner/user guard triggers on September 23, 2026.
- [x] Configure the same immutable ID as server-only `ADMIN_OWNER_ID` in the staging worktree and as a Production Secret on the separate `spoodly-space-staging` Vercel project. No deployment was triggered.
- [x] Confirm `.vercel/project.json` identifies `spoodly-space-staging` (`prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO`) before deployment approval.
- [ ] Agree on a staging maintenance-test window; no production access or deployment.

### Exact locally known pending migrations

Guarded remote history reconciliation found exactly these two migrations pending before deployment and no unexpected pending changes. These hashes supersede earlier single-migration/no-deletion claims:

| Migration | Scope | SHA-256 |
| --- | --- | --- |
| `20260921010000_admin_foundations` | Additive admin schema and guards; unchanged | `8cea3a400ad5d2525b2f894cf32cd05df97142322558a3a0c46db028ecba9c98` |
| `20260922010000_remove_consumed_unbound_registration_challenges` | Deletes only `PendingEmailVerification` rows with `purpose = 'register' AND consumedAt IS NOT NULL AND userId IS NULL` | `c18ed887b81e2ee007f01f1cb07052a20ab9da2951edad4a7d17a53023478c17` |

The cleanup preserves pending/unconsumed challenges, bound challenges and all application/care records. It intentionally removed one legacy consumed registration email/name/token-hash record without guessing ownership by email. Application rollback cannot restore that obsolete metadata. Both migrations ran successfully on staging on September 23, 2026.

## Accounts and authorization

- [x] Ordinary user cannot access admin pages. Browser evidence on September 23, 2026 used a dedicated disposable ordinary account: direct `/admin` returned the safe 404 boundary and did not render or fetch administration content. Direct-action authorization remains covered locally rather than exercised destructively in the browser.
- [ ] Admin can view metrics and edit an ordinary disposable account, but cannot edit admin/super-admin targets, delete accounts, change roles, tag demos or control maintenance.
- [ ] Super admin can delegate/revoke privileges; existing sessions lose removed privileges immediately.
- [ ] Verify actual owner binding/role/eligibility and trigger/grant definitions **read-only**. Owner deletion/suspension/demotion/binding replacement probes use injected disposable repositories; any eventual PostgreSQL destructive probe uses a separately approved isolated disposable database, never the actual bound staging owner.
- [ ] Name/preferences edits retain validation; email change requires target verification and retains the old address until confirmation.
- [ ] Suspension blocks access, reinstatement permits fresh sign-in, and neither silently changes billing.
- [ ] Audit shows actor, target, time and reason without credentials or sensitive payloads.

## Deletion and operational failures

- [ ] Disposable target impact preview and typed email are required.
- [ ] Failed billing cancellation prevents reported deletion success.
- [ ] Failed photo cleanup remains pending; retry resumes the same operation.
- [ ] Large photo collections resume from persisted cleanup progress after an interrupted batch.
- [ ] In-flight uploads cannot escape the deletion manifest; an uncertain upload keeps deletion pending until a super admin confirms from service logs that the request ended, records a reason, and retries cleanup.
- [ ] Cleanup removes only the exact disposable account's records and owned objects.
- [ ] Facebook provider-data request review preserves independently supplied care data and another usable sign-in method.
- [ ] Existing Facebook links (including multiple links) complete under actual owned-write triggers; stale previews still fail and the audit reports the final version after challenge invalidation.
- [ ] New password registration removes its exact proven challenge atomically; later account deletion retains no such proof. Verify unrelated challenges survive and the approved legacy cleanup affects only the stated predicate.

## Demo testing

- [x] Only super admins can tag dedicated ordinary test accounts and choose Free/Pro. Browser evidence designated the exact disposable ordinary account first as Free and then Pro through the protected owner session; role-policy denial remains covered by the focused service tests.
- [ ] Real subscription history or pending checkout blocks designation, including concurrent/uncertain checkout attempts.
- [x] Demo Pro grants features without Stripe; demo Free enforces actual Free limits. Browser evidence showed the correct Free and Pro Test-as banners and the Pro Settings entitlement with zero Stripe billing controls; database-backed entitlement limits remain covered by local service tests.
- [x] Removing Demo removes its override and ends active Test-as sessions. The approved browser cleanup restored the disposable account to ordinary Free status before its separately confirmed permanent deletion.
- [x] Test as is rejected for an untagged target; admin routes and identity changes are unavailable inside Test as. The deployed browser retest returned a safe 404 for direct `/admin`; Settings retained Plan/Profile and replaced email/provider/password controls with the explanatory unavailable card. Server-side mutation denial remains covered by the focused tests.
- [x] Banner identifies demo account/tier; return restores actor context. Both Free and Pro banners identified the disposable demo, and Return restored the protected owner administration session.
- [ ] Old forms in other tabs cannot submit against a different context after switching/ending Test as.
- [ ] A save already admitted before Stop keeps its captured demo target; Stop never redirects that write to the actor. Fresh submissions require the current context.
- [ ] Expired/invalid testing contexts offer a working Return control; no redirect loop or fallback write to the actor occurs.
- [ ] While an already-open protected Test-as page is blocked by active maintenance, expire/revoke testing and use Return **inside** the modal. The explicit warning explains that navigation discards unsaved values; Escape stays blocked and no stale save becomes permitted.
- [ ] Return ends the actor's active testing session even when its browser cookie is missing, permitting a fresh test session without logout.
- [ ] Stale form submission displays actionable reload/Return guidance inline and preserves unsaved values instead of a generic server error.
- [ ] Test mutations, including actual derived care-progress changes, retain safe actor/target attribution without private care text.

## Timezone analytics

- [ ] Saved administrator timezone controls date labels, periods and daily groups, with visible timezone indicator.
- [ ] 7/14 days include local today so far plus preceding 6/13 dates; DST transitions are correct.
- [ ] Different admin timezones do not share incorrectly cached groups.
- [ ] Demos excluded by default; demo Pro is not counted as a paying subscription.
- [ ] Future event instants excluded from historical counts; keeper star day keys remain original.

## Maintenance rehearsal (only in approved window)

- [ ] Upcoming announcement can change independently of maintenance and is plain text.
- [ ] Start shows shared 60-second deadline; refresh and repeated start do not extend it.
- [ ] Save succeeds before cutoff, and newly admitted reads/writes fail at cutoff.
- [ ] Delayed upload cannot attach a photo after cutoff; blocked save does not falsely report success or silently discard the form.
- [ ] Super admin can navigate/test while active; direct demo login and ordinary admin cannot bypass.
- [ ] Public status contains no identity data; static fallback works on settings/database failure.
- [ ] Signed billing/deletion callbacks retain validation and truthful retry behavior; billing cron pauses.
- [ ] Reopen is explicit; restore test announcement/state without overwriting concurrent human changes.

## Final evidence

- [x] Production-review fix batch verified locally September 23, 2026: 708 tests passed, TypeScript and ESLint passed, Prisma schema validation passed with inert localhost URLs, `git diff --check` passed, the webpack production build passed, and `npm audit --omit=dev` reported zero vulnerabilities. Independent re-review found no remaining issue in the approved fix scope. The batch adds an unapplied RLS/revoke migration for pending email verification, completes private-photo ownership, makes spood write admission transaction-scoped, promotes the oldest active Free spood after memorialization, bounds care reconciliation to affected days and reminder horizons outside ordinary page reads, bounds deletion media discovery, verifies an accessible private storage bucket in health, makes checkout return copy entitlement-aware, and repairs the reviewed UI semantics. No database command, deployment, commit, push, seed/reset, or production access occurred for this batch.
- [x] Unit tests, TypeScript, lint and offline Prisma checks pass locally; latest exact evidence after the Test-as acceptance fixes is 692 passing tests. The webpack production build also passes.
- [x] Guarded staging integration fixtures passed on September 23, 2026 and were cleaned up by exact IDs. Read-only verification confirmed zero fixture users, three minimal completed deletion receipts/audits, intact owner eligibility/binding and no maintenance deadline.
- [x] Independent whole-feature code/security review findings were resolved and independently re-reviewed before the staging migrations or deployment.
- [x] Approved local production-mode staging build passed September 23, 2026. Approved CLI deployment `dpl_5Fb8QPxJi5hutJC8R74DDxC3oXmN` reached READY on the separate staging project; Vercel inspect confirmed `staging.spoodlyspace.com` points to that exact deployment and the health route returned `{"ok":true}`.
- [x] Approved read-only browser smoke test passed September 23, 2026 on `staging.spoodlyspace.com`: the protected owner rendered as Super administrator; Overview, Accounts, Operations, Demo accounts, Maintenance and Audit history loaded in `America/Los_Angeles` without an application error. The owner detail was visible but non-editable, while an ordinary account exposed the expected profile, verified-email, suspension, role and deletion controls. Maintenance remained Open, the announcement remained off, and no form, filter or state-changing control was submitted.
- [x] Approved guarded staging maintenance rehearsal passed September 23, 2026. The control displayed Save window with the fixed server deadline, then Maintenance active with an explicit Reopen site control. The public identity-free status endpoint reported active after cutoff, the protected super administrator retained admin access, the version-owned automatic restoration completed, and both the endpoint and browser returned to Open with a null deadline and the announcement still off. Exact-ID disposable fixtures were cleaned by the guarded script. This rehearsal did not independently exercise an ordinary authenticated browser, delayed upload, signed callbacks, Test-as, static fallback or a human Reopen submission; those compound checklist items remain open.
- [x] Approved ordinary/Demo/Test-as browser acceptance passed its scoped September 23, 2026 checks. A dedicated disposable account signed in directly, could not access `/admin`, received the one-minute warning and active maintenance block, and recovered after reopening. The protected owner designated that same exact account as Free and Pro, verified both Test-as banners and entitlements, and returned to the owner context. Acceptance exposed two Test-as presentation failures: direct `/admin` produced a generic server error and Settings showed identity controls that the server correctly rejects. TDD fixes map the typed testing-context error to safe 404, hide email/provider/password controls behind an explanatory card, and reuse one guarded user/identity admission so expiry cannot create another generic Settings error. All 692 tests, TypeScript, lint and a webpack production build pass; independent re-review passed with 26 targeted tests and six injected direct/demo/recovery scenarios. Approved deployment `dpl_BRMBAH27YxXqmUCFNqTzJsmj7mpS` reached READY, owns `staging.spoodlyspace.com`, and returned `{"ok":true}` from `/api/health`. The deployed browser retest passed both fixes. The owner then separately confirmed removing Demo and permanently deleting the exact empty, unbilled disposable account; its detail now returns 404, inventory reports zero demos, and protected super-admin access remains intact.
- [ ] Owner accepts feature before full production-release peer review resumes.

## Complete specification coverage map — local evidence only

The checked status in this table means the requirement has implementation and offline evidence, not staging acceptance. Source paths are relative to this worktree. Consult nearby tests for exact assertions; none execute the real protected owner destructively.

| Requirement | Local evidence | Unperformed checkpoint |
| --- | --- | --- |
| Roles, verified immutable owner, live revocation, protected self/owner, five-minute proof | [x] `admin/policy`, `actor`, `reauth`, `reauth-store` tests; owner/role/demo SQL constraints; raw-session credential checks | Owner selection/bootstrap, runtime role SELECT/grants, isolated disposable SQL invariant probes, forged direct requests and live provider proof |
| Admin entry, environment, account search/filter/pagination, safe summary fields and preferences | [x] `admin/shell`, `accounts`, `accounts-actions`, `presentation` tests; `/admin` shell/detail/actions | Browser role navigation, responsive layout, verified email delivery/uniqueness, live stale-version race |
| Email remains verified through target-bound flow; Facebook deletion remains provider-only | [x] Email-change/social/provider-deletion tests and Task 3 review; safe audit metadata | Complete admin preparation→confirmation audit integration evidence and safe Facebook provenance enum refinement remain deferred minors; provider browser workflows |
| Irreversible deletion impact/reason/typed target/fresh proof; resumable exact billing/storage cleanup | [x] `account-deletion`, `deletion-store`, `deletion-external`, `deletion-photos` tests; OwnedUpload ledger and checkout blocking | Real PostgreSQL locks/cascades, interrupted provider cleanup with approved fakes/disposable storage, in-flight upload recovery; no real billing calls |
| Dedicated demo designation, conservative subscription/checkout exclusion, Free/Pro across gates | [x] `demo-accounts`, `demo-integration`, billing service/reconciliation, effective entitlement/slots/write-policy tests; both checkout race winners via injected Stripe fakes | Fixture database execution, browser actual limits; staging Stripe remains disabled |
| Test-as actor/target isolation, max 60m, privilege/identity denial, stale forms/multi-tab, audit | [x] `test-session`, `test-session-store`, `test-session-integration`, mutation/form tests; expiration/revocation and immutable admission target | Browser cookies/two tabs, real private photos and direct routes, Return after missing/expired cookie |
| Overview/engagement/operations definitions, demo exclusion, no fabricated visits, bounded aggregates | [x] `metrics`, `metrics-presentation`, reporting tests; SQL contract tests; current badge eligibility | Execute actual PostgreSQL aggregates with all six event sources/corrections; query plans at realistic scale; match reward helpers |
| Personal timezone, DST 7/14 calendar dates, partial today/future exclusion, original keeper days, cache isolation | [x] `analytics-period`, `reporting`, `metrics-cache`, timezone select tests; @date-fns/tz boundaries | Live SQL timezone grouping/cache expiry; saved/browser prompt hydration; leap-day/changed-zone known fixtures |
| Versioned one-minute maintenance, independent announcement, no accidental extension, explicit cancel/reopen | [x] `maintenance-state`, `maintenance-controls`, `maintenance-controls-ui` tests | Approved shared-staging rehearsal; concurrent super-admin controls |
| Central no-bypass enforcement, uncached late write/attachment checks, truthful primary save/drain, signed callbacks | [x] `maintenance-policy`, `maintenance-access`, `maintenance-integration`, `maintenance-routes` and billing/upload/auth tests; entry-point inventory in `admin-entry-points.md` | Real PostgreSQL transactions, OAuth callbacks, delayed upload, DB outage, service retries, infrastructure drain |
| Browser warning, server-relative countdown, five-second polling, bounded access proof, dirty-form/focus preservation | [x] Site-status/polling/access tests and Task 9 reviewed fixes | Desktop/mobile, screen reader/keyboard, multi-tab, hidden/focus/sleep and slow-network browser acceptance |
| Audit survives deletion, safe fields, twelve-month cleanup; operations failures visible | [x] `audit`, reauth/action tests and guarded cleanup action; runbook retention/recovery sections | Actual grants/append-only trigger/retention transaction; operator responsibility for cleanup schedule |
| Additive private admin schema, no owner guessing; separate consumed-registration metadata cleanup; guarded fixture lifecycle | [x] Static admin migration atomicity/dollar/RLS/grant review and separate exact cleanup-predicate regression; registration→deletion and rollback tests; script guard/ownership/failure cleanup/version restoration tests | Explicit approval for both migrations including destructive auth cleanup, guarded status/apply, exact-ID fixture run, trigger/default-grant verification |
| Reviewed deployment/rollback boundaries and staging-first acceptance | [x] Handoff pending migration/configuration/rollback inventory and no-production boundary | Isolated production-mode build, explicit staging deploy approval, project/domain/deployment ID verification, owner acceptance, then production-release peer review |

### Additional acceptance details retained from review

- [ ] Confirm nullable `adminVersion` preserves a representative untouched pre-rollout credential fingerprint byte-for-byte; existing behavioral tests cover compatibility but the explicit equality regression is a deferred Task 1 minor.
- [ ] Validate runtime role permissions on ProtectedOwner and all internal tables, including inherited/default grants and trigger SELECT paths. Lexical SQL cannot prove deployed privileges.
- [ ] Verify current activity corrections, withdrawn badge eligibility, memorialized history, all six event sources, leap-day anniversaries and keeper-zone UTC fallback against actual SQL; inspect aggregate query plans and distributed cache refresh.
- [ ] Verify cancel cannot act after cutoff, repeated start cannot extend a deadline, public/private polling remains bounded across focus changes, stale positive bypass expires, and only a fresh server-active mode blocks browser interaction.
- [ ] Verify a confirmed primary care save drains earned completion under its captured keeper while new read-derived work is blocked; callback/mail/billing acknowledgments remain truthful after cutoff.
- [ ] Retain callback failure/retry evidence and prove all older deployments/in-flight work drained before incompatible migration. There is no automatic drain-complete signal.
- [ ] Record failure recovery when script process termination/ambiguous commit leaves fixtures or settings behind; never use broad email-domain cleanup or overwrite a newer settings version.
- [x] Offline delayed-repository regression: a 65-second delay in preparation/transaction/owner lookup/settings lock refuses start when fewer than 90 approved seconds remain, without writing. A permitted start derives its deadline from fresh locked admission; version-owned restoration remains possible after approval expiry. This does not mark the live rehearsal complete.

These pending checks are release blockers where they establish owner protection, subscription exclusion, actor isolation or maintenance enforcement. The named deferred minors are not being silently counted as completed tests. No critical/important finding may remain unresolved before enabling the controls.
