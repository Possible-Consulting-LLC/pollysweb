# Billing reconciliation and past-due access

## Scope

Keep cached Stripe entitlements current when webhooks are missed. A verified `past_due` subscription loses Pro immediately, with no grace period. Never remove existing spoods or care history. While the account is effectively Free, its first-created spood remains writable; all other spoods are read-only, including edits and deletions. Staging keeps Stripe disabled and production data is out of scope.

## Entitlement

Only approved-price `active` and `trialing` subscriptions grant Stripe-backed Pro. `past_due`, `unpaid`, `paused`, `incomplete`, `canceled`, and expired statuses do not. The app determines the first-created spood by ascending `createdAt`, then `id` for ties. A manually granted Pro plan without a Stripe customer remains Pro. Existing spoods and records remain readable; Free-plan creation and restore limits still apply. All mutations on spoods after the first are denied for an effective Free account. New Constellation care-day reviews cover only its writable spood, while prior streaks and badges remain visible. The upgrade/settings UI directs an existing Stripe customer with a past-due subscription to the billing portal, not a new checkout.

Stripe changes are observed through signed webhooks and a scheduled reconciliation. A webhook is the fast path; the scheduler repairs missed events. This is eventual observation, so a Stripe transition cannot be guaranteed to appear in the app before either channel succeeds. Pro-only writes should check freshness and fail closed when Stripe-backed status is more than 24 hours old, without deleting or hiding existing data.

## Scheduler

Add a Vercel Cron GET route authenticated with a nonempty `CRON_SECRET` bearer token, checked before data access. The route is disabled in staging and never uses staging Stripe keys. A small, indexed due queue of users with Stripe customer IDs lets each invocation handle a bounded number of customers. It reuses `reconcileStripeCustomer`, which verifies the stored customer and approved Price IDs and reads current Stripe state under the existing user-row lock. Successful checks record the time and next due time. Failed checks leave entitlement unchanged, record a failure and earlier retry time, and emit structured errors so persistent failure is visible. Vercel does not retry failed invocations, so later cron runs must retry failed customers.

The job must not mutate billing state on a partial Stripe response or ownership mismatch. Concurrent webhook and cron work must serialize on the user row. A stale status cannot indefinitely authorize Pro-only writes.

## Rollout and verification

Implement and unit-test the policy, job, write gates, and portal routing without any live Stripe calls. Add a migration for due/freshness metadata. Stage the migration and app only against staging. Since staging intentionally has no Stripe keys, test the job with injected fakes and verify its route is inert there. Production deployment and production database changes require a separate release decision; this work must not touch them.
