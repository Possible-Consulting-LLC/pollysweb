# Admin operations

Status: staging runbook, updated September 23, 2026. The reviewed migrations, owner binding, guarded fixture, deployment, maintenance rehearsal and scoped Test-as browser acceptance have run only on the isolated staging projects. Production requires its own approval and release plan.

## Environment and owner setup

Use the separate staging project first. The protected owner must be bound to an explicitly confirmed immutable account ID using [the bootstrap procedure](../security/admin-owner-bootstrap.md). Do not infer this ID from signup order or an email supplied to an admin form. Production setup requires its own approval.

The admin area must display its environment. Keep the protected-owner environment value and database binding consistent; disagreement blocks privileged access.

### Staging migration record and production approval boundary

The following two migrations were explicitly approved and applied to staging on September 23, 2026 after guarded history reconciliation:

| Migration | SHA-256 |
| --- | --- |
| `20260921010000_admin_foundations` | `8cea3a400ad5d2525b2f894cf32cd05df97142322558a3a0c46db028ecba9c98` |
| `20260922010000_remove_consumed_unbound_registration_challenges` | `c18ed887b81e2ee007f01f1cb07052a20ab9da2951edad4a7d17a53023478c17` |

Admin foundations remains additive and unchanged. The separate cleanup intentionally deleted only legacy `PendingEmailVerification` rows where `purpose = 'register' AND consumedAt IS NOT NULL AND userId IS NULL`; staging contained exactly one matching obsolete row. Pending/unconsumed challenges, bound challenges and all application/care data remained untouched. Production still requires explicit approval for this exact destructive scope and its reviewed backup/rollback procedure. Code rollback cannot restore removed metadata; stop if production history or impact differs from the reviewed staging evidence.

## Roles

- Admins can inspect metrics and manage ordinary accounts.
- Super admins can additionally delete accounts, change privileged roles, designate demos, test as demos, and control maintenance.
- The protected owner cannot be suspended, demoted, or deleted. Personal identity changes remain in the owner's own verified Settings flow.
- Role removal and suspension revoke existing credential sessions. Reinstatement allows a fresh sign-in; it does not restore an old session.

## Deleting an account

Deletion is irreversible after completion. Review the impact, type the exact account email, supply a reason, confirm, and complete recent reauthentication. Suspension alone does not cancel subscriptions.

The operation first blocks account access, then confirms billing cancellation, removes owned photos, and finally removes application records. Stripe financial records are not promised erased. A failed step remains pending; retry the same operation rather than creating a replacement. Photo batches retain confirmed progress.

Successful password registration now removes its exact claimed challenge in the same transaction as user creation; failed creation or proof removal rolls back both. Historical consumed unbound registration rows require the separately approved cleanup above before legacy-erasure completeness is claimed. Unproven same-email challenges must never be deleted by guessing an account association.

Facebook completion checks the submitted preview version under the User lock, removes provider links, and uses the trigger-updated version for its profile/credential write. It rereads the final version after bound-challenge cleanup for the audit. Existing last-sign-in, provenance, provider verification, repeated-receipt and rollback protections remain in force.

An uncertain upload must not be treated as finished just because its object is currently absent. If the operation requests support review, inspect application and storage logs to establish that every outstanding request has ended. Only then use the super-admin attestation control with a reason and fresh authentication. This releases the reservation for cleanup; it does not itself prove the object was removed. The recorded key remains until strict cleanup succeeds.

## Checkout recovery

Pending checkout intent must be resolved before demo designation or account deletion. A retry uses the original request parameters and key. Stripe may discard idempotency keys after 24 hours, so the implementation uses a shorter replay window; older uncertain requests require provider investigation rather than a new automatic request. [Stripe idempotency reference](https://docs.stripe.com/api/idempotent_requests).

## Before staging activation

See [the acceptance checklist](admin-acceptance.md) and [migration/configuration handoff](main-to-staging-handoff-2026-09-19.md#17-admin-demo-and-maintenance-local-preparation-september-22). Reverting to older application code is not security-equivalent: old code ignores new suspension, maintenance, and demo restrictions. Preserve the additive schema; do not drop security tables/triggers or clear settings as a rollback shortcut. Old processes and deployments must be drained or isolated before relying on new controls.

The first production rollout cannot use a maintenance switch that the currently deployed production code does not yet implement. The separately approved release plan must account for that bootstrap step, as well as draining older deployments and signed callbacks. Enabling maintenance in staging does not close the production site.

## Maintenance drain contract to verify

The shared deadline stops newly admitted ordinary saves. Primary transactions recheck the deadline before completion, and remote uploads must recheck before attaching an image. An upload reservation does not exempt a late attachment.

A primary care record confirmed before the deadline may finish its dependent care-star/reward updates afterward against the captured account. This avoids reporting a saved event as failed or deliberately losing earned progress. That continuation is limited to the already-saved operation; it does not permit a new save or a fresh read-triggered recalculation.

Consequently, reaching the deadline does not mean database traffic is zero. Drain admitted work and account for signed service callbacks before beginning an incompatible migration. This must be tested during a separately approved staging rehearsal.

## Reporting contract to verify

Each administrator's saved IANA timezone controls the dashboard's date boundaries and timestamps. A seven-day view includes today so far and the previous six local calendar dates; fourteen days includes the previous thirteen. Today's totals are partial. An unset timezone must be clearly identified and offer a preference, rather than silently presenting server-local dates.

Activity measures current recorded care history, including corrections, rather than site visits or logins. Future event instants are excluded. Demo activity is excluded by default, and demo Pro does not count as a paying subscription. The implementation must document exactly which care types it counts.

Care-day keys retain the keeper's original date semantics. Administrative timezone changes only affect completion-time presentation; they must not recalculate keeper streaks. Badge participation comes from current qualifying records, so withdrawn badges do not remain counted merely because a celebration was once shown.

## Implemented analytics definitions (Task 7; awaiting staging SQL/browser acceptance)

The Overview combines inventory and engagement. Inventory includes **all current accounts**, including demos, unverified/suspended accounts and accounts awaiting deletion. Ordinary means non-demo, irrespective of administrative role. Active spoods have `memorializedAt = null`; memorialized spoods have that timestamp set. These are current counts, not historical point-in-time inventory.

Effective Free/Pro uses the same entitlement rules as account search and the shared `effectivePro` resolver: a demo's selected plan overrides billing; ordinary manual Pro without a Stripe customer remains Pro; Stripe-backed Pro requires active/trialing status and a non-future successful billing check within 24 hours. “Paying customers (recorded active Stripe)” counts non-demo users with both customer and subscription IDs and recorded `active` status. It excludes trials and demo overrides. It is a stored subscription count, not measured revenue, payment verification or a live Stripe query.

The 7/14-day engagement filter includes today so far plus 6/13 preceding local calendar dates in the viewing administrator's saved IANA timezone. `@date-fns/tz` with date-fns calendar operations computes local midnight across DST. The last instant is the current server time (inclusive for today's partial interval). Future events are excluded. Date-only explicit-range utilities, although not exposed in the current UI, validate dates, reject future/reversed ranges, cap intervals at 366 dates, and use exclusive next-local-midnight for closed end dates. See [date-fns timezone documentation](https://github.com/date-fns/date-fns/blob/main/pkgs/core/docs/timeZones.md).

“Include demo activity” applies to registrations, care logs, distinct active keepers, top keepers, care stars and badges. Demos are excluded by default. Inventory cards remain explicitly labelled as all-account totals. Registration counts use current users' `createdAt`; deleted accounts no longer contribute. A care log is one current row in any of these six sources:

| Care type | Event instant | Inclusion |
| --- | --- | --- |
| Feeding | `FeedingEvent.date` | All feeding outcomes |
| Misting | `MistingEvent.date` | All misting records |
| Molt | `MoltEvent.moltDate` | Successful and unsuccessful molts |
| Observation | `ObservationEvent.date` | All observations, including optional play/interaction |
| Body condition | `BodyConditionEvent.date` | All body-condition records |
| Enclosure maintenance | `EnclosureMaintenanceEvent.date` | All maintenance kinds, through enclosure → spood ownership |

A distinct active keeper is the current owner of one or more qualifying logs in that interval. The schema has no separate care-author field; Test-as changes contribute to the effective demo keeper when demos are included. Memorialized spoods' history remains included. Correcting a log's date moves it between buckets; deleting it removes its contribution. Daily counts reflect **current recorded history**, never `updatedAt`, site visits, sessions or inferred login activity. Photos are separate records and contribute to photo badges, not care-log totals. Database timestamps are UTC stored in Prisma `TIMESTAMP(3)` columns: grouping first interprets them as UTC, then converts to the viewing zone.

Care stars are currently non-invalidated `CareDay` completions within the selected interval, bucketed by the actual `completedAt` instant. Lifetime badge participation counts **distinct eligible keepers per badge**, regardless of the selected activity interval. It is derived from current qualifying records, including memorialized spoods, and never from `CelebratedReward`. Streak badges use the best consecutive run of original saved `CareDay.dayKey` values with `invalidatedAt = null` and `completedAt <= now`. Changing viewer or keeper timezone does not rewrite those keys or remove a previously completed Tokyo date merely because Los Angeles is still on the preceding day. Existing care mutation reconciliation maintains invalidation; metrics do not run per-keeper reward writes.

Story badges match the current reward rules: uploaded photo `createdAt`; non-play observation **or body-condition** record for Sharp Eyes; new-hammock observation; successful molt; rehouse maintenance; and one year from acquisition (or spood creation). Event instants must be at or before server now. Date-only UTC-midnight acquisition dates retain their original calendar date; legacy instant dates use that keeper's saved timezone. Leap-day anniversaries use the existing March 1 rollover rule. Keeper zones are resolved case-insensitively against PostgreSQL's timezone names. Unset/invalid keeper zones use UTC because an administrator cannot know another keeper's browser timezone; this can differ from that keeper's own browser fallback near midnight and is disclosed on the dashboard.

Only badge-count aggregates are cached, with a 60-second revalidation interval and an explicit as-of timestamp. The shared Next data-cache key and immediate-refresh tag include viewer timezone, local range and demo filter. Cache refresh rechecks the live administrator under the existing mutation/HMAC boundary and immediately expires the matching tag across workers. The displayed as-of timestamp remains authoritative if background revalidation is delayed. Other counts are queried fresh. Database results contain bounded daily/type aggregates, at most ten top keepers, and at most twelve badge counts; full keeper histories never reach the browser.

All administrative date presentation uses the viewer's saved timezone (including account, audit, provider-deletion, checkout and billing dates). Unset/invalid preferences visibly use UTC and prompt with the browser zone preselected after hydration. The inline preference action edits only the live actor's own timezone; both administrator roles and the protected owner can use it. My settings remains available. Browser cookies and query/form timezone overrides cannot change reporting boundaries. Refresh and preference mutations reject Test-as/stale contexts and preserve form values on returned errors.

### Deferred acceptance evidence

No SQL has been executed against a database for Task 7. Unit tests verify local boundaries, emitted parameterized Prisma/SQL contracts, entitlement fixture predicates, aggregate DTOs, cache key/tag contracts, action authorization wiring and rendered markup. They do not prove PostgreSQL execution or query-plan performance. At the authorized staging checkpoint, execute known fixtures for corrected/withdrawn records, all six event types, demo versus paid Pro, memorialized spoods, changed keeper zones and leap-day anniversaries; compare actual SQL output with `readRewardState`/`summarizeStreak`. Inspect query plans on realistic history volume and verify cache expiry/refresh, focus, responsive chart/table and browser timezone hydration in the deployed Next runtime.

## Maintenance server semantics and release limits (Task 8)

The implementation and migrations are active on isolated staging, and the approved rehearsal returned staging to Open. This does not authorize any production migration, deployment or maintenance action. Obtain separate production approvals and preserve the drain/rollback boundaries below.

- The private singleton starts open with no announcement. Missing settings/auth/database services fail closed for application traffic; they do not synthesize an open state. Static maintenance, login and legal content remain reachable, but a database outage cannot support super-admin authentication or testing.
- Starting uses server time plus exactly 60 seconds. The shared optimistic version rejects stale controls. Repeated start with the current version retains the original deadline; concurrent controls cannot silently overwrite. **Cancel** clears the deadline only while the server still derives countdown mode. After cutoff, even a cancellation form with a current settings version is rejected; a super admin must separately confirm **Reopen site**. Reopen succeeds only in active mode. Announcement enable/text is independent, plain text, at most 500 characters, and cannot start/schedule maintenance.
- Controls require live super-admin role, valid current credentials, five-minute proof, context/origin protection and an audit record in the same transaction. A demo flag or client parameter cannot confer bypass. Only a live super-admin actor with a still-valid Test-as session bypasses while keeping the demo target and its real tier limits.
- New primary writes check uncached state immediately before transaction work and again before commit on the same database connection. Cutoff rejection is a typed inline failure. It does not report saved or clear the form. A primary event confirmed before cutoff may finish its bounded care-star/reward completion afterward; this completion preserves the captured keeper identity. A new read-derived update has no such exception.
- OAuth account creation, account update and provider linking each check maintenance on their own transaction connection before work and before commit. A cutoff rolls back that write. Auth.js remains a multi-step flow: a previously committed step is not rolled back by denial of a later step. JWT session bookkeeping does not recursively resolve maintenance authentication.
- Remote uploads require fresh admission and **fresh attachment** checks. A preexisting OwnedUpload reservation is not an exemption. If attachment is rejected, settled/unattached owned objects are removed with strict provider acknowledgment before removing the ledger. Provider/database uncertainty, unsettled uploads and attached objects keep their ledger for explicit recovery; absence is never proof that a remote request ended.
- Billing has durable phase admission. An admitted Stripe request and its acknowledgment may finish after cutoff. Later phases recheck, retaining unresolved intent instead of clearing it or issuing a new request. Mail/feedback requests similarly gate immediately before send and report the admitted send truthfully.
- Signed Stripe and Facebook callbacks still verify their signatures. While active or unavailable they return retryable 503 with no success acknowledgment/receipt. Processing is delayed until reopening. Verify Stripe delivery retries and investigate/replay exact failed deliveries as required. Do not assume Facebook retries; preserve upstream/server failure records and arrange a retry of any unrecorded request. Existing public deletion status stays reachable.
- Billing cron pauses new work while active. Already admitted callback/billing phases, care completion, auth-session expiry/exit, audits and strict upload cleanup may still write. **The deadline is not proof of zero database traffic.** Before an incompatible migration, drain/inspect in-flight requests and remote operations, account for callbacks and cleanup, and follow infrastructure-level migration controls. Maintenance is not a database lock, backup or rollback system.
- Browser status polling runs at most once every five seconds while visible, preserves that bound across brief tab switches, and times out stalled public/private requests after eight seconds. A positive private super-admin bypass proof expires after ten seconds without renewal. Sleeping/background clients may not see a full minute. Do not navigate dirty forms away when the deadline arrives. The browser displays the countdown from the server timestamp and monotonic elapsed time after receipt; it may show zero briefly, but blocks interaction only after a fresh public response reports active. The server cutoff remains exact, and a denied save stays inline with its unsaved form values.
- Reopening is an explicit super-admin **Reopen site** action after service recovery. Stop Test-as/logout are recovery exceptions, never permission to save stale keeper forms. A self password/email/provider credential rotation can complete under the locked actor transaction, but unrelated preexisting credential revocation remains denied and the old login cannot bypass on later requests.
- If Test-as expires or is revoked on an already-open page during active maintenance, **Return to admin** remains reachable inside the blocking modal and uses the actor-bound Stop action. Its warning explains that returning leaves the page and discards unsaved values. The modal remains nondismissable, and returning never resubmits or grants permission to save a stale form.

## Delegation and recent identity confirmation

Start with only the explicitly bound owner. Use Accounts to grant a verified, active, non-demo ordinary account `admin` or `super_admin`; enter the displayed confirmation and a non-sensitive reason after fresh identity proof. Admins cannot manage privileged targets or grant roles. Only super admins can delete, designate demos, delegate, test as, and control maintenance. No self-demotion/suspension or owner-target editing through administration. Personal Settings remains the owner's identity-edit route.

Proof expires after five minutes and is bound to current credentials. Password accounts confirm their own password; social-only accounts use the explicitly linked provider challenge. Role/suspension/deletion/designation changes invalidate old credentials. Test-as does not turn a demo into an admin or extend the actor's proof. Do not place private names, email addresses, tokens, or care notes in audit reasons.

## Demo accounts and Test as

Designate only an explicitly dedicated ordinary test account after the disclosure that super admins may access and change its records. Choose Free or Pro (no Breeder option); label it clearly. A stored subscription ID, including canceled history, prevents designation. A customer association requires full subscription/checkout verification; pending or uncertain checkout, remote error, and unresolved durable intent fail closed. Do not erase billing IDs to make a target eligible. Staging Stripe stays disabled; customer-associated cases are exercised with injected fakes locally, not live payment calls.

Demo plans apply actual entitlement limits. Pro grants Pro features without a subscription; Free enforces actual Free limits. Normal demo login and Test-as both reject real checkout/portal. Removing demo clears plan/label and ends eligible test access; it does not alter a real Stripe subscription.

Test as lasts at most 60 minutes and requires a currently valid super-admin actor plus an active tagged ordinary target. The banner identifies the demo and tier; changes are real demo records and shared cookies affect other tabs. Return to admin stops the context; logout ends the real login. Account credentials, email/provider identities, billing and admin actions are unavailable inside Test-as. Use a dedicated direct login outside maintenance for those flows. Direct demo login has no maintenance bypass.

Expired/revoked/changed contexts reject stale forms with inline recovery guidance; no write falls back to the actor. An already admitted action may finish for its original captured target after Stop; Stop is not cancellation. Verify two-tab behavior explicitly. Each test mutation records safe actor/target attempt and confirmed-outcome metadata; failed attempts do not claim a saved change.

## Audit retention and recovery receipts

Audit history is append-only through the application and survives target deletion. Retain events for twelve calendar months. In `/admin/audit`, a freshly reauthenticated super admin confirms **DELETE EXPIRED EVENTS**. The server computes UTC time one calendar year earlier, clamping leap-day to the target month's last day; deletes strictly older rows; and writes `audit.cleanup` (cutoff and deleted count) in the same transaction. Failure to record that receipt rolls deletion back. This is a deliberate operator action, not a configured scheduled purge. Establish an operator reminder outside this implementation if monthly cleanup is desired.

Do not delete pending deletion operations, unsettled OwnedUpload entries or unresolved checkout intents as “audit cleanup.” They are recovery authority. Completed account-deletion receipts retain minimal opaque target/operation references, counts, stage and completion timestamp; customer/subscription values and manifests are cleared on completion by the application service. No automatic retention purge of those receipts or terminal test sessions is implemented; assess a separately reviewed minimal-retention policy without removing retry evidence. Audit must never contain secrets, full private notes, or raw provider payloads.

## Ordered maintenance drain and reopening

1. Verify the deployed code implements these controls on every serving deployment. Obtain the separate shared-staging window before rehearsal. Capture singleton version, announcement enabled/text and deadline; preserve safe operator evidence. An announcement alone does not schedule downtime.
2. Save any desired upcoming announcement independently. Freshly reauthenticate, confirm Start, and record the server deadline (60 seconds). Do not repeat Start to extend it. A countdown may be canceled only before cutoff; active maintenance requires explicit Reopen.
3. Before cutoff, ordinary saves may complete. At cutoff, confirm denial using disposable ordinary/admin/direct-demo sessions and confirm live super-admin plus Test-as access. Check typed inline failures leave dirty forms intact; a local timer reaching zero alone does not establish server mode.
4. Drain requests on **all** current/older deployments. Inspect care completion, pending uploads and strict cleanup, admitted billing/mail requests and acknowledgments, callbacks, session exit/expiry bookkeeping and audit work. Pause workers/cron at infrastructure level if the migration requires zero writes. There is no built-in “drain complete” telemetry or lock; a zero-second countdown is not proof. Never start an incompatible migration until the approved infrastructure procedure establishes quiescence.
5. Capture callback failures and retry obligations. Stripe/Facebook signatures are still checked before retryable 503; do not treat that response as successful processing. Check Stripe retries and arrange Facebook recovery explicitly because the app cannot promise provider retry. Reconcile admitted remote operations after recovery; never clear uncertain intent on list absence.
6. Apply only the separately approved migration/deployment after backup/recovery planning. Verify health, auth, private photos, demo plan limits and known analytics fixtures while maintenance remains active. Database outage blocks even super-admin authentication; use infrastructure recovery rather than trying to bypass the guard.
7. Reopen explicitly after service recovery and checks. Restore announcement/state only with the last version owned by this test; if another operator changed it, stop restoration and inspect together. Verify ordinary login/read/write, cron and callback catch-up, and expired Test-as recovery. Record actual deployed ID and browser evidence.

## Guarded integration script — authored, not run

After explicit staging migration and fixture-run approval, the intended command is `node --import tsx scripts/staging-admin-check.ts` from this worktree. It loads `.env.local` with override/quiet, immediately neutralizes `EMAIL_RESEND_API_KEY` and `RESEND_API_KEY` only in that CLI process, then requires explicit `SPOODLY_ENV=staging`, verifies staging URLs via `assertStagingEnvironment`, requires the confirmed owner ID, and refuses Stripe credentials. The mail-disabled guard remains in place before Prisma construction. Leave the local environment file and deployed email configuration unchanged; app email credentials may remain configured there. No mail client is imported or invoked by the script. Do not copy production values.

Every run preallocates random `@example.invalid` ordinary/admin/demo IDs and prints them **before** the first write; retain that output in the checkpoint evidence. It reads the real owner only, verifies scoped preference-version changes and demo Free/Pro/removal without payment, then cleans all captured IDs in `finally`. The cleanup locks each exact account, checks the current owner binding and exact email, and requires zero billing/storage/sign-in/care/recovery associations. Proven-empty fixtures use the guarded receipt → access block → billing-canceled → photos-removed → exact transaction-local deletion → completed receipt sequence. It never invokes external deletion or uses an email-domain/prefix cleanup selector. Unexpected associations refuse cleanup and retain evidence for the normal reviewed resumable deletion workflow. A failed/ambiguous create still has a captured ID; a terminated process can leave fixtures and requires exact-ID investigation. Do not delete audit/receipt evidence to make the run appear clean.

This infrastructure harness does not issue real actor sessions or simulate recent proof. Its passes establish only the tested fixture database contracts, not request authorization, Test-as/browser isolation, remote cancellation, or all analytics queries. Expiry, owner-destructive policy and subscription/designation races use the dedicated injected repository/unit suites; real browser request acceptance stays unchecked until executed.

**Default execution never reads or changes global maintenance.** `--maintenance-rehearsal` additionally requires `STAGING_ADMIN_MAINTENANCE_APPROVAL_FILE` naming an operator-created local JSON marker, created only after a separate explicit approval and agreed window. The marker contains `purpose: staging-admin-maintenance-rehearsal`, `environment: staging`, `projectRef: nfdecdylxcmuypxodppe`, nonempty `approvedBy` and `approvalReference`, and ISO `startsAt`/`expiresAt`. Window length must be at most 15 minutes, current, with at least 90 seconds remaining before activation. The file is an execution interlock, not evidence that a user consented; preserve the actual approval separately. No marker has been created.

The optional rehearsal refuses an existing deadline. After all preparation, transaction acquisition, owner lookup and the SiteSettings row lock, it revalidates the full approval and at least 90 seconds remaining at the actual start admission. Insufficient time refuses without a settings write. The 60-second deadline uses that same fresh admission timestamp, with optimistic version comparison; the announcement stays unchanged. Restoration is attempted after 70 seconds only if its acknowledged version still matches, and remains permitted after approval expiry. It never resets the version backward. A failed initial comparison cannot authorize restoration. Concurrent edits, process termination, database failure, or ambiguous commit acknowledgment require operator inspection; automatic cleanup cannot guarantee reopening. Monitor the window interactively and record browser checks independently—waiting 70 seconds is not acceptance evidence. Do not leave the script unattended.
