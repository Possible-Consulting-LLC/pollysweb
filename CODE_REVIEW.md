# Spoodly Space code review

Reviewed September 14, 2026. Scope: all application source, components, routes, actions, schema and migrations, scripts, configuration, tests, dependency manifests, and asset references in this checkout. Third-party dependency implementations and deployed infrastructure were not audited.

No seed, reset, or database migration commands were run. No application code was changed. P1 means high priority; P2 means normal priority; P3 means lower priority. Findings are based on source inspection unless a reproduction or deployment condition is explicitly stated.

## High-priority findings

### 1. [P1] Billing reconciliation is an unauthenticated server action

**Location:** `src/app/actions/billing.ts:143–150`.

`applyStripeSubscription` accepts a caller-supplied user ID and subscription ID, fetches the subscription with the application’s Stripe secret, and writes its plan/status to that user without authentication or customer ownership checks. Although no source caller exists, the completed Webpack production build registers this export in the server-action manifest for the upgrade route and contains its callable implementation. A caller who knows suitable IDs can change another account’s billing state or attach an unrelated subscription. The database uniqueness constraint does not establish ownership.

**Fix:** Remove this helper from the `use server` module and keep reconciliation in a server-only module invoked by verified webhook handlers. Any client-triggered reconciliation must authenticate the current user and verify subscription/customer ownership. No billing mutation was attempted. See [Next.js action security](https://nextjs.org/docs/15/app/guides/data-security).

### 2. [P1] Demo seeding deletes every keeper's spider data

**Location:** `prisma/seed.ts:10–20`.

The script calls unfiltered `deleteMany()` on all care-event tables, photos, reminders, enclosures, and spiders. Only the final user deletion is restricted to the demo email. Running the documented `npm run db:seed` against a populated database therefore erases every keeper's collection and history while leaving their accounts and subscriptions behind. A failure halfway through also leaves partial deletion.

**Fix:** Restrict replacement to the demo user's records, use a transaction, and require an explicit development/demo database guard. Source inspection only: this script was never executed.

### 3. [P1] A clean dependency install fails

**Location:** `package.json:19`, `package.json:32–34`, `package-lock.json`.

The manifest declares `@supabase/supabase-js`, `resend`, `server-only`, and `stripe`, but the lockfile omits them and their transitive dependencies. **Reproduced:** `npm ci` exits with `EUSAGE` and reports the missing packages. Any CI or deployment using a clean locked install fails before compilation.

**Fix:** Regenerate and commit a matching lockfile, then verify `npm ci` in CI. Review validation installed dependencies without modifying either committed manifest.

### 4. [P1, deployment-dependent] The migration disables the database's row protections

**Location:** `prisma/migrations/20260907140000_init_postgres/migration.sql:242–253`.

Every application table, including `User` with password hashes and billing fields, explicitly has row-level security disabled. There is no compensating revocation of API-role grants in the repository. If the Supabase Data API exposes these tables and `anon` or `authenticated` has grants, callers can bypass the application's ownership checks. The severity includes account and private-data compromise where writes are granted.

**Fix:** Verify deployed grants and API exposure immediately; enable RLS without public policies for server-only tables, revoke unnecessary API access, or move these tables to an unexposed schema. Prisma's privileged database connection does not require public API access. **Live grants and actual exposure were not verified.** See [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 5. [P1] Checkout can create multiple paid subscriptions for one account

**Location:** `src/app/actions/billing.ts:60–100`.

`startCheckoutAction` loads the billing profile but never rejects an existing active subscription or reuses an outstanding checkout. Two upgrade tabs can each create and complete a checkout, or a stale upgrade page can start another subscription after the first succeeds. Disabling the currently clicked button does not protect separate tabs. The database stores only one subscription ID, even though Stripe can continue charging both subscriptions. Concurrent initial checkouts can also create separate Stripe customers.

**Fix:** Enforce subscription eligibility on the server, serialize customer creation, and reuse or expire outstanding checkout sessions. Add idempotency for retries and reconcile existing customer subscriptions before creating another.

### 6. [P1] Out-of-order subscription events overwrite newer billing state

**Location:** `src/app/api/stripe/webhook/route.ts:74–82`; `src/lib/stripe.ts:85–98`.

The webhook writes each subscription snapshot directly to the user without checking event freshness or whether the subscription is still the account's current subscription. A delayed active update after cancellation can restore Pro incorrectly. A deletion for an older subscription after a replacement becomes active can downgrade a paying keeper. Stripe explicitly does not guarantee [event delivery order](https://docs.stripe.com/webhooks).

**Fix:** Reconcile current authoritative subscription state and customer ownership; handle replacement subscriptions explicitly, and serialize or version updates so older events cannot overwrite newer state.

## Data integrity and core behavior

### 7. [P2] Editing an activity can silently change its timestamp

**Location:** `src/lib/spiders.ts:283`; `src/components/activity/activity-editor.tsx:127`; `src/components/ui/datetime-field.tsx:27–48`; `src/lib/utils.ts:131–140`.

Edit defaults are formatted in the keeper's saved display timezone. `DateTimeField` always submits the browser timezone, and the server prioritizes that zone. If the two differ, saving only a note changes the event's instant. **Reproduced:** an event at `2026-09-08T16:00Z`, displayed in New York and saved from Los Angeles without changing the time field, becomes `19:00Z`.

**Fix:** Pass the timezone associated with each edit value through the form, or pass an ISO instant and convert both display and submission consistently in the browser. Test a saved timezone different from the device timezone.

### 8. [P2] Calendar-day care calculations use the server's timezone

**Location:** `src/lib/utils.ts:202–205`; `src/lib/spiders.ts:99–113`.

`daysBetween` uses host-local date getters and never accepts the keeper's timezone. Display formatting uses the keeper's zone, but reminder intervals and recovery expiry do not. **Reproduced on a UTC host:** 9 a.m. and 6 p.m. on the same Los Angeles date count as one day apart. The existing calendar-day test also fails on this machine's Los Angeles timezone (`1 !== 0`).

**Fix:** Compute calendar dates in the intended keeper timezone explicitly. Run date tests in multiple host and user zones, including DST boundaries.

### 9. [P2] Date-only profile fields shift to the previous day

**Location:** `src/app/actions/auth.ts:186–189`; `src/app/actions/care-habitat.ts:36–38`; `src/lib/utils.ts:28–35`; `src/components/spoods/about-form.tsx:187–198`.

Creation parses `YYYY-MM-DD` with `new Date`, producing midnight UTC. The browser then displays and edits that timestamp using local date getters. **Reproduced:** entering September 8 displays September 7 in Los Angeles. Saving the About form can persist that shifted date. Enclosure setup dates use the same pattern; other paths use server-local noon, making date-only handling inconsistent.

**Fix:** Treat calendar dates as dates rather than instants, using a consistent database and serialization representation. Apply the same rule to create, edit, display, and memorial dates.

### 10. [P2] Historical or deleted molts leave the current instar and status wrong

**Location:** `src/app/actions/care-events.ts:222–269`; `src/app/actions/activity.ts:207–215`, `299–300`.

Logging a molt always updates the current instar, even when the molt is historical or marked unsuccessful. Editing any successful old molt also overwrites the current instar and status: editing an old i5 molt can downgrade a current i8 profile and clear its current Premolt state. Deleting a molt removes only the event, leaving the instar resulting from that event behind.

**Fix:** Define how current state is derived from the latest applicable successful molt versus manual status changes. Reconcile that state transactionally after create/edit/delete, and do not advance instar for unsuccessful molts.

### 11. [P2] Backfilled molts produce incorrect stored intervals

**Location:** `src/app/actions/care-events.ts:234–238`; `src/app/actions/activity.ts:173–205`.

The create action selects the latest molt overall, not the latest molt before the entered date. Backfilling August 1 when September 1 already exists stores a negative interval. Adding, editing, or deleting earlier events also fails to recompute the following molt's stored interval; changing feeding history leaves stored fasting durations stale. Story prefers non-null stored gaps over its calculated fallback.

**Fix:** Find the chronological predecessor using a date bound and recompute affected derived values after history changes, or compute them from history on read.

### 12. [P2] Maintenance history and enclosure summaries diverge

**Location:** `src/app/actions/care-habitat.ts:94–109`; `src/app/actions/activity.ts:233–253`, `305–306`.

Logging or editing a backdated cleaning unconditionally overwrites `lastCleaned`, even if a newer cleaning exists. Changing a cleaning to another kind leaves the old cleaning timestamp behind, and deleting a cleaning or rehouse never repairs either summary field. The enclosure can therefore claim a deleted cleaning happened or show an older date despite newer history.

**Fix:** Recompute the maximum remaining date for each maintenance kind after create/edit/delete, in the same transaction as the event mutation.

### 13. [P2] Story silently drops older history

**Location:** `src/lib/spiders.ts:181–192`; `src/app/(app)/spoods/[id]/story/page.tsx:51–54`.

Story uses `getSpiderCare`, which fetches only 50 feedings, mistings, molts, observations, and body-condition entries, plus 20 maintenance entries. There is no pagination or older-history route. A daily hydration log begins disappearing from the scrapbook after 50 entries. Activity is capped too, so it does not provide access to the missing older records.

**Fix:** Give Story a dedicated paginated history query and a visible way to load older entries. Recent dashboard limits should not constrain the lifetime scrapbook.

### 14. [P2] Latest successful feeding is calculated from an incomplete sample

**Location:** `src/lib/spiders.ts:84–86`, `118–125`, `185`; `src/lib/care.ts:112–115`.

The dashboard loads 20 feedings and then searches those for the last success; the profile loads 50. After 20 refused/ignored offers, the dashboard forgets a real earlier successful meal and falls back to the latest failed offer, potentially resetting the feeding-due interval. The profile can disagree with the dashboard for the same spider.

**Fix:** Fetch the newest successful feeding independently with an outcome filter. Define the no-success fallback explicitly without letting query truncation masquerade as no successful history.

### 15. [P2] Uploaded photos break Story's optimized image path

**Location:** `src/app/(app)/spoods/[id]/story/page.tsx:281–286`; `next.config.ts:40–51`.

Story renders photo URLs with `next/image`, including Supabase URLs returned by uploads. Configuration permits only local patterns and defines no `remotePatterns`. Profile and gallery use plain images, so an upload can work there but fail when viewed in Story. See Next.js's [unconfigured image host error](https://nextjs.org/docs/messages/next-image-unconfigured-host).

**Fix:** Allow the specific Supabase storage host/path in `remotePatterns`, or use the existing `SpoodImage` consistently. Verify Story with a real uploaded image, not only bundled SVGs.

### 16. [P2] Free-plan limits are vulnerable to concurrent requests

**Location:** `src/app/actions/auth.ts:124–126`, `176`; `src/app/actions/care-habitat.ts:329–339`.

Create and restore independently count active spiders and then write later, without a lock or serializable transaction. With one free slot available, simultaneous creates/restores can both pass and leave two active spiders. The create flow may spend significant time uploading between the check and insert.

**Fix:** Serialize limit checks and writes per keeper, such as with a transaction locking the user row. Cover create-versus-create, restore-versus-restore, and create-versus-restore races.

### 17. [P2] Feedback can only be sent once until the app shell remounts

**Location:** `src/components/feedback/feedback-button.tsx:65–68`, `85–90`, `202`.

After success, the dialog closes but the `useActionState` success value remains in the persistent layout. Reopening it still renders “Sent” and disables submission. Changing the form key does not reset the hook. A keeper cannot send a second report without a full reload/remount.

**Fix:** Put the action state in a dialog component that remounts for each opening, or explicitly reset the submission state for a new message.

### 18. [P2] Clearing enclosure fields does not clear stored values

**Location:** `src/app/actions/care-habitat.ts:31–38`.

Blank name, dimensions, notes, and setup date become `undefined`, which Prisma omits from an update. Clearing a previously entered note, submitting, and reloading restores the old note despite the success message.

**Fix:** Use `null` for explicitly cleared nullable fields on update; reserve `undefined` for fields that were not submitted.

## Security and user-facing gaps

### 19. [P2] Changing a password does not invalidate existing sessions

**Location:** `src/app/actions/auth.ts:289–293`; `src/lib/auth.ts:17`, `57–69`; `src/lib/session.ts:22–28`.

Password changes only replace the hash. JWT acceptance checks that the user still exists, but not whether credentials changed after the token was issued. An existing session remains usable after a keeper changes their password to regain control of an account.

**Fix:** Track a session version or password-change timestamp and verify it on authenticated requests; rotate or revoke sessions when credentials change.

### 20. [P2] Upload validation trusts client-provided type and filename

**Location:** `src/lib/uploads.ts:47–59`.

Any nonempty file under 5MB is accepted. An unsupported extension is renamed `.jpg`; any claimed `image/*` MIME is forwarded, with no byte signature check or decode. Non-images and unsupported image formats can be stored as successful uploads, producing broken albums and consuming storage. Whether active image content is accepted/served depends on bucket configuration, which was not inspected.

**Fix:** Validate an explicit raster format allowlist using decoded bytes or signatures, enforce size/dimension limits, and derive extension/MIME from the verified content.

### 21. [P2] Authentication and paid-resource actions lack application rate limits

**Location:** `src/lib/auth.ts:29–43`; `src/app/actions/auth.ts:33–70`; `src/app/actions/feedback.ts:111–159`; `src/lib/uploads.ts:37–72`.

No application limiter protects credential verification, registration, feedback email sends, or upload volume. A caller can repeatedly attempt passwords; a registered account can repeatedly consume email/storage resources. Per-file and message-length caps do not cap request volume. Any external WAF protections are outside this review.

**Fix:** Add durable account/IP-aware throttling and per-user resource quotas at the server boundary, including the credentials provider itself rather than just the login form action.

### 22. [P2] Modal dialogs do not manage keyboard focus

**Location:** `src/components/spoods/photo-gallery.tsx:72–102`; `src/components/feedback/feedback-button.tsx:70–83`, `128–142`.

Both dialogs advertise `aria-modal`, but neither moves focus into the dialog, traps Tab, makes background content inert, or restores focus to the opener. Keyboard users can remain on or navigate to hidden controls behind the overlay, despite the visible modal and scroll lock.

**Fix:** Use an accessible dialog primitive or implement the focus lifecycle and inert background explicitly; verify keyboard-only opening, cycling, closing, and focus restoration.

### 23. [P3] Settings expose preferences that do not affect behavior

**Location:** `src/app/(app)/settings/page.tsx:98–130`; `src/lib/spiders.ts:130–140`; `src/lib/care.ts:76–119`.

Cleaning interval, date format, and measurement preference are persisted but have no functional consumers beyond loading/displaying the settings. There is no cleaning-due calculation; date displays use hardcoded formatting; enclosure dimensions remain free text with an inches placeholder. Saving these preferences gives an expectation the application does not fulfill.

**Fix:** Wire each preference into the relevant behavior or remove/label it until implemented. This is distinct from the README's explicitly future push-notification delivery.

### 24. [P3] Deployment configuration references a missing script

**Location:** `vercel.json:2`.

`ignoreCommand` invokes `node scripts/vercel-ignore.js`, but the repository contains no such file. The configured deployment decision cannot run and will produce a module-not-found error. This is not necessarily a build blocker because nonzero ignore-command exits can proceed with deployment, but the intended skip behavior is absent.

**Fix:** Restore the intended script or remove the stale configuration.

## Additional risks and follow-up checks

- Uploads use public Supabase URLs, while the landing page promises “Private by default.” Anyone obtaining a photo URL can access the object outside the authenticated app. Confirm the intended photo-sharing policy; use a private bucket and authorized signed URLs if photos should be private.
- Anonymous-key storage configuration has no accompanying storage policies in this repository. The app uses Auth.js rather than Supabase user sessions, so ordinary Supabase authenticated-user policies do not automatically identify keepers. Verify storage writes cannot be performed directly outside the app's authorization and size checks.
- `/upgrade?success=1` displays an unconditional Pro success message but does not reconcile checkout or poll until the webhook changes the plan. Delayed or misconfigured webhooks can leave a paying user on Free while displaying “Welcome to Pro.” Billing readiness also omits the webhook secret.
- Several related writes are separate database operations: molt/event plus profile, maintenance/event plus enclosure, and photo plus profile. Partial failure can persist a record while reporting failure, and retries can duplicate it. Use transactions for coupled database state, plus cleanup/retry handling for storage.
- `persistResolvedStatuses` writes during reads and updates by ID without checking that status is still the value it read. A concurrent manual status change can be overwritten. Resolve presentation status without writes, or use a conditional update.
- Form validation is inconsistent: arbitrary status strings and unchecked reminder intervals can be persisted; invalid date input can silently fall back to now or normalize to another date. February 30 was reproduced as March 2. Validate enumerations, positive bounded integers, and actual calendar dates at the action boundary.
- `maximumScale: 1` in `src/app/layout.tsx:40` restricts zoom in browsers that honor it. Remove the cap for low-vision users.
- Status filtering occurs before expired recovery statuses are resolved (`src/lib/spiders.ts:154–170`), so a direct Normal filter can omit a spider that would be shown as Normal on an unfiltered visit.

## Test coverage priorities

The repository contains two unit-test files for date/care helpers. No integration tests or CI workflow were found. Prioritize:

1. Cross-user access denial for all mutations, and database/storage API grant checks.
2. Checkout concurrency, duplicate subscriptions, delayed webhooks, and reordered events.
3. Create/edit/delete of historical molts and maintenance, with transactional failure cases.
4. Date-only round trips, saved-zone/device-zone differences, and multiple server timezones.
5. More than 50 history entries, more than 20 unsuccessful feeds, remote Story images, and repeated feedback submissions.

## Validation

- `npm ci`: failed because manifest and lockfile are out of sync.
- Dependencies installed for review with `--ignore-scripts --package-lock=false --no-save`; local Prisma client generated for type-checking. Generation does not run seeds or migrations.
- `npm test`: 16 passed, 1 failed; calendar-day assertion at `src/lib/care.test.ts:27` in the machine's Los Angeles timezone.
- `npm run lint`: passed with two existing `no-img-element` warnings in `avatar-picker.tsx`.
- Additional date reproductions executed from the repository's utility functions without a database connection: cross-zone edit shift, same-local-day counted as one day, date-only previous-day shift, and invalid-date normalization.
- `tsc --noEmit`: passed after generating the local Prisma client.
- `npm run build -- --webpack`: passed after local client generation. The standard Turbopack build could not complete because of local font-network/OS port-binding restrictions; its result is not a confirmed application defect.
- The same 17 unit tests all pass when run with `TZ=UTC`, confirming that the local failure depends on host timezone.
- The completed build’s server-action manifest and implementation confirm the exported unauthenticated billing helper in finding 1.
- No live database, Stripe payment, storage mutation, email send, seed, reset, or migration was used to validate this review. Deployment-specific exposure and end-to-end behavior still require a controlled test environment.
