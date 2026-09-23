# Admin dashboard, demo testing, and maintenance

Status: approved by the owner in conversation, including administrator-local reporting timezones. Local implementation is in progress under the approved implementation plan. Staging migration, owner binding, maintenance rehearsal, and deployment remain separate approval checkpoints; production work is not authorized.

## Purpose and release boundary

Give the owner and delegated administrators a secure way to manage accounts, understand usage, and test releases before reopening the app. Build and verify in the separate staging project first. Resume the full release peer review only after this feature is complete. Production access, migration, deployment, and any push to main remain separate approval steps. Do not run seed commands.

## Agreed requirements

- Multiple admins; the owner's account initially is the only super admin.
- Admins may edit ordinary accounts, never admin or super-admin accounts. Only super admins may delete accounts or change administrative privileges.
- The owner's immutable account ID is protected against deletion, suspension, or demotion by anyone.
- Only super admins may designate demo accounts and select their test plan. Demo plans grant actual tier features without a Stripe subscription.
- An account with a real Stripe subscription cannot become a demo account. Demo accounts cannot initiate real checkout.
- Only tagged demo accounts may be entered using “Test as.” Only super admins may do so.
- Super admins retain full access during maintenance, including testing demo accounts under their actual plan limits.
- Starting maintenance gives existing users a one-minute save window, followed by server-enforced maintenance.
- A separate editable upcoming-maintenance announcement has its own on/off switch.

## Architecture and alternatives

Use a protected `/admin` area inside the existing Next.js app. Reuse authentication, components, and shared domain services. This avoids duplicate authentication and business rules. A separately deployed admin site could isolate deployments but would add infrastructure and shared-policy synchronization; defer it. Direct database administration cannot provide the requested permission checks, confirmations, or safe testing workflow.

Separate modules own authorization, account management, account deletion, metrics, demo sessions, and maintenance. Shared session resolution distinguishes the authenticated actor from the effective demo user. No browser-submitted actor ID, role, plan, or maintenance exemption is trusted.

## Roles and protected owner

| Action | Admin | Super admin |
| --- | --- | --- |
| View metrics and account summaries | Yes | Yes |
| Edit ordinary account profile/preferences | Yes | Yes |
| Initiate verified email change for ordinary account | Yes | Yes |
| Suspend/reinstate ordinary account | Yes | Yes |
| Edit other privileged accounts | No | Yes, subject to owner protection |
| Delete accounts | No | Yes, except protected owner |
| Grant/revoke administrative roles | No | Yes, except owner demotion |
| Designate demo and select test plan | No | Yes |
| Test as demo / control maintenance | No | Yes |

Roles are `user`, `admin`, and `super_admin`; default existing accounts to `user`. A server-only, environment-specific protected-owner ID identifies the owner and confers super-admin authorization. Never infer ownership from row order, signup age, email supplied by the browser, or “user 1.” Owner binding must be explicitly verified before staging activation and again before production rollout. Ordinary admin UI cannot change that binding. Only the owner may edit their own profile or identity through existing verified settings flows.

Super admins can grant admin or super-admin roles to other existing verified, non-demo accounts after recent reauthentication and confirmation. Prevent self-demotion/suspension through the admin UI. Demo accounts cannot hold privileged roles, and privileged accounts cannot be tagged demo. Protect these invariants in shared mutation services and database constraints/triggers where appropriate, not just buttons. This protection concerns app operations; database infrastructure owners necessarily retain direct database powers.

Check current actor role and suspension on every privileged request and again inside mutations after acquiring locks. Role removal or suspension takes effect for existing sessions; do not rely on a long-lived JWT role claim. Invalidate affected credential sessions using the existing fingerprint/version mechanism. CSRF/origin protection, rate limits, validated fields, and recent reauthentication (five minutes) apply to destructive and privilege-changing actions.

## Pages and metrics

- **Overview:** total accounts, ordinary/demo split, active and memorialized spoods, effective Free/Pro counts, new registrations, and keepers recording care in the last 7/14 days. Demo overrides never count as paying customers.
- **Accounts:** paginated searchable list; filters for role, demo, suspension, email verification and entitlement. Detail shows profile/preferences, joined date, latest recorded activity, sign-in method names, spood/event counts, and billing summary. Never display passwords, password hashes, provider tokens, or secret keys.
- **Engagement:** daily registrations and care-log counts, activity by type, most active keepers, care stars and badge participation. Exclude demo activity by default with a clearly labeled inclusion filter. “Active” means at least one qualifying care log in the selected reporting interval in the viewing administrator's preferred timezone; use the same definition everywhere. Label historical corrections as current recorded history, not measured site visits. Badge metrics use current eligibility, not the celebration ledger.
- **Operations:** pending Facebook deletion requests and billing reconciliation failures/last successful checks. Link to existing external analytics and billing dashboards; embedded Vercel traffic or Stripe revenue analytics are not part of v1. No fabricated login/visitor metrics: the current schema does not record last login.
- **Demo accounts:** designation, label, plan selector, and Test as entry point for super admins.
- **Maintenance:** announcement editor, preview, start/cancel countdown, current status and reopen control.
- **Audit history:** paginated/filterable actor, target, action, timestamp, reason and safe field changes. Audit records survive target-account deletion and cannot be edited through the app.

Use existing visual styling with a desktop sidebar and compact mobile navigation. Always display the environment. The admin entry appears only to authorized users; hiding it is not an authorization mechanism.

### Administrator timezone and reporting dates

Every admin and super admin can select their own preferred IANA timezone in their personal settings, including admins who cannot edit other privileged accounts. Reuse the existing account timezone preference. If unset, prompt for a timezone with the browser-detected zone preselected; visibly label any UTC fallback. Display the active reporting timezone beside date filters. Changes affect that administrator's view, not other administrators or the timestamps stored for keepers.

All in-app analytics timestamps, daily chart buckets, date filters, account activity dates, and audit timestamps use the viewing administrator's selected timezone. The default 7/14-day periods include today so far and the preceding 6/13 local calendar days. Convert local date boundaries to UTC instants for database queries with daylight-saving-aware conversion; do not subtract fixed 24-hour multiples to find local midnights. Explicit date ranges use inclusive local start dates and exclusive next-local-midnight end boundaries, capped at the current server instant. Label today's bucket as partial. Exclude genuinely future-dated events from historical activity metrics; timezone conversion changes presentation, not the event's actual instant. Key aggregate caches by timezone, date range and other filters so different administrators never share incorrectly grouped results.

Care stars and streaks retain the keeper's original care-day timezone and date-only semantics. Do not reinterpret a saved day key as UTC midnight or recalculate badge eligibility using the administrator's timezone. Display actual completion timestamps in the administrator's timezone while labeling original keeper care-day dates as such. External Vercel/Stripe dashboards retain their own timezone settings; this preference governs the app's admin analytics.

## Account edits and deletion

Editable fields are name and existing preferences (timezone, date format, measurement, theme, care intervals). Admin-initiated email changes use a target-bound verified-email flow, retain uniqueness checks, and do not mark an address verified just because an admin entered it. Reuse validation/token primitives, not an action that assumes the actor is the target. Administrators cannot view or assign passwords. Normal billing remains Stripe-authoritative; v1 provides billing status and an external management link, not arbitrary plan/status writes.

Suspension blocks app access and credential use; reinstatement permits a fresh sign-in. Suspension does not silently cancel a paid subscription, and the confirmation explicitly explains that distinction.

Deletion requires super-admin reauthentication, an impact preview (spoods, logs, photos, subscription), typing the target email, a reason, and final confirmation. Recheck actor/target permissions and account version at submission. The protected owner cannot enter this workflow.

Deletion is a resumable operation rather than a single cascading delete: lock/mark the target as deleting and revoke access; prevent new checkout and writes; verify and cancel any billable subscription without automatically issuing refunds; collect and remove only that account's owned private-storage objects; delete account-owned application records; retain a minimal audit/operation receipt. A failed external step remains visibly pending with safe idempotent retry; never report success while billing or photo cleanup is unresolved. Do not delete shared branding or unrelated objects. Stripe financial records are not promised erased. Coordinate concurrent checkout, webhooks and deletion through the same account-level locking/policy boundary.

Facebook requests remain provider-data-only, separate from full-account deletion. Show the existing reviewed workflow and allow audited completion only after the actual provider-link/data cleanup and last-sign-in-method checks. Ordinary admins may handle ordinary targets; privileged targets require a super admin, and owner identity changes remain owner-controlled. Uncertain field provenance requires user confirmation; a completion button alone is not data erasure.

## Demo designation and test plans

Store demo status/label and `demoPlan` separately from real billing fields. Initial options are Free and Pro; do not expose Breeder until the app implements that tier. All limits and feature gates use a shared effective-entitlement resolver. Free demo accounts get the real Free restrictions; Pro demos receive Pro features without a Stripe purchase. Removing demo status clears the override and restores ordinary billing rules immediately.

Demo designation requires recent super-admin authentication and confirmation that the target is a dedicated test account. Never auto-tag accounts. This permission makes a tagged account accessible for testing, so the confirmation must state that consequence.

Conservative subscription rule: reject designation if any recorded Stripe subscription exists, including canceled historical subscriptions. If a customer ID exists, check Stripe for subscriptions and pending checkout as well; use complete pagination. Reject pending checkout and fail closed if verification is unavailable. Serialize designation with checkout, reconciliation and webhook processing; an in-flight checkout must not create a subscription after designation passes. A customer record alone, with no subscriptions or pending checkout, does not grant paid entitlement or automatically prohibit demo designation. Do not erase billing identifiers to pass this check.

Both normal demo login and Test as prohibit real checkout/portal purchase actions. Unexpected Stripe events for a demo account are surfaced for investigation and cannot silently overwrite its test plan. No demo tagging action changes or cancels a real subscription.

## Test-as sessions

Create a short-lived server-side test session (maximum 60 minutes) bound to the initiating super admin's current credential version and a tagged demo target. Use an opaque secure HttpOnly cookie; retain the real actor session separately. Check actor privilege, credential validity, target demo status and target suspension/deletion on every request. Un-tagging, actor demotion, logout or expiration ends access immediately. No nested testing sessions.

Show “Testing as [demo name] — [plan]” plus Return to admin on every app page. Warn that testing changes real demo records and the context applies across tabs using the same browser cookies. Server authorization scopes normal app data and photos to the demo account; it never gives the demo target the actor's admin rights. Admin endpoints reject actions while in test context except the explicit stop-testing action. Account credentials, provider links, email identity and real billing cannot be changed through Test as; test those flows using a direct dedicated-account login outside maintenance when needed.

Maintenance bypass belongs to the live super-admin actor and their validated test session, not to the demo tag. Direct demo logins remain blocked during maintenance. Audit session starts/ends and attribute test mutations to both actor and target. An expired/revoked test context must not silently submit a demo form against the actor's own account; reject the stale operation and require reload.

## Maintenance state and enforcement

Use one shared durable setting with a version, announcement enabled/message, maintenance deadline, and actor/timestamps. Modes derive as open, countdown, and active. Start atomically sets a deadline 60 seconds in the future. Refreshing, concurrent admins and repeated start clicks cannot extend it inadvertently. Turning off explicitly clears the deadline; canceling during countdown is supported. Announcement state is independent and does not schedule maintenance automatically.

An app-wide status component polls at most every five seconds, refreshes on focus/visibility, and calculates countdown from server time/deadline. Display an accessible persistent save warning without clearing form input. Background/sleeping browsers cannot be guaranteed a full minute of visible warning. All ordinary saves remain allowed before the deadline; at/after the deadline server guards reject new application operations. Check again immediately before writes, including uploads. Handle rejection inline before navigating away so a failed save is not presented as saved. Previously admitted in-flight work must drain before database migration starts.

Guard authenticated pages, server actions, photo routes, and other data endpoints centrally with explicit exceptions. Maintenance page/status, minimal static assets, legal/privacy/deletion-status pages, and authentication needed for super-admin entry remain reachable. Ordinary logins, including OAuth callbacks, cannot bypass the gate. Return appropriate maintenance responses (HTTP 503/Retry-After for data routes) and avoid caching personalized data or privileged bypass responses publicly.

Super admins retain full app access and see a persistent maintenance-active banner. During Test as they retain only the maintenance bypass, with the demo plan's normal permissions. Admins and ordinary users are blocked.

Signed Stripe webhooks and Facebook deletion callbacks remain reachable with their existing authentication, signature and idempotency checks. Maintenance is not proof of zero database traffic: callback processing must be accounted for in the release runbook. Pause billing cron work during active maintenance; callbacks that cannot safely process during a migration must return retryable failure, never false success. Health endpoints expose no sensitive details.

Database/settings lookup failure must not fail open for ordinary requests. Serve a static maintenance/unavailable fallback. Super-admin access still depends on working authentication and database services: this feature cannot guarantee login or app testing while the database itself is offline. Reopen only after service recovery and explicit super-admin action. Maintenance is a release control, not a backup or rollback mechanism.

## Data and implementation boundaries

Additive schema changes introduce user role/suspension/demo fields, singleton site settings, expiring test sessions, admin audit records and deletion-operation tracking. New internal tables are server-only with RLS/grants consistent with existing private tables. No destructive backfill, no changes to existing care ownership, no automatic owner guessing, no production commands. Store only safe audit metadata; no session tokens, passwords, raw OAuth payloads, or full private notes. Retain administrative audit events for 12 months with documented cleanup; deletion receipts retain only the minimum reference needed for support and retries.

Integrate with `src/lib/session.ts`, Auth.js credential invalidation, `effective-entitlement.ts`, billing services/actions/webhooks, account/email services, private photo routes, and existing Facebook deletion policy. Inventory every data entry point before implementation so public/API/server-action paths cannot bypass UI guards. Use database-side aggregates/pagination for dashboard queries; no unbounded browser payloads or full-history scans on every dashboard request. Expensive badge aggregates may be cached briefly with an explicit “as of” timestamp and refresh action.

## Verification and acceptance

1. Role matrix tests cover forged IDs/roles, all target roles, owner protection, concurrent role changes, stale sessions and direct server requests.
2. Only super admins can tag/test demos; subscription/pending-checkout restrictions survive races and Stripe failures. Demo plans affect every entitlement gate and never paid revenue counts.
3. Test-as scope isolates account data/photos and blocks privilege escalation, non-demo targets, stale forms, nested sessions, expiration and revoked actors/targets.
4. Account edits preserve email verification; deletion tests cover confirmation, owner rejection, billing/storage failures, idempotent recovery and exact account cleanup.
5. Maintenance tests cover deadline boundaries, clock skew, concurrent controls, multiple tabs, ordinary login/callback paths, actions/uploads, failure-closed behavior, super-admin bypass and direct-demo denial.
6. Verify signed service callbacks remain appropriately handled and no maintenance status endpoint leaks account details. Explicitly rehearse draining and service failure.
7. Metrics tests use known fixtures for administrator-selected 7/14-day local boundaries, UTC date crossings, daylight-saving transitions, different administrators' timezone/cache isolation, partial today and future-event exclusion, demo exclusions, corrected logs and badge eligibility. Verify that original keeper care-day dates and streaks remain unchanged. No inferred “last login” from updatedAt.
8. Browser checks cover responsive admin pages, confirmations, focus management, accessible countdowns and test-context banners.
9. Use only guarded staging fixtures, clean up exact fixture IDs, run relevant unit/integration/build checks, then independent security/code review before staging acceptance.

## Review and delivery sequence

Approve this written specification first. Then prepare a separately reviewable implementation plan: (1) permissions/owner/audit foundations, (2) account and operations UI with deletion workflow, (3) demo entitlements and test sessions, (4) maintenance enforcement and announcements, (5) integration testing and peer review. Confirm the actual staging owner ID before enabling privileged access. Production owner binding is deferred to the separately approved release process. No commits or deployment are part of this specification-writing step.
