# Spoodly Space: production `main` to deployed staging handoff

**Prepared:** September 19, 2026

**Care and badge update:** September 20, 2026

**Production baseline:** `main` at `12aee653c3cb81de0a794b1d0f7b6116a811e4e7`

**Staging worktree branch:** `codex/staging-setup` at `108afab2f0604fc70bb3620b4816966b31071347`
**Staging site:** `https://staging.spoodlyspace.com`

## Critical repository-state warning

The deployed staging application is **not reproducible from the staging branch HEAD alone**. Only three documentation commits are currently ahead of `main`; almost all implementation work is still present as uncommitted modifications and untracked files in `.worktrees/staging`.

At the original September 19 snapshot (these counts exclude subsequent care and badge updates):

- 67 tracked files differ from `main` (about 2,105 additions and 1,107 deletions).
- More than 100 implementation, migration, documentation, and test files are untracked.
- The live staging deployment was created from this complete dirty worktree.

Any agent porting this work must compare against or copy from the worktree itself, not just run `git diff main..codex/staging-setup` or check out the branch. Before the web changes are promoted, the work should be organized into reviewed commits on a non-`main` branch.

No production database commands were used to prepare this document. The production database has not been migrated or inspected as part of this work.

## Executive summary

Staging has grown beyond a visual refresh. It changes the authentication model, subscription enforcement, photo security, database schema, care-history calculations, date handling, and free-plan write permissions. It also adds social sign-in, email verification and email changes, shared care streaks and badges, optional play logs, private photos, legal pages, durable rate limiting, and scheduled Stripe reconciliation.

For a separate native app repository, the highest-impact changes are:

1. The app must use the new identity rules and cannot identify or merge users by email alone.
2. Photos are private and must be fetched with an authenticated session through an ownership-checking endpoint.
3. A free or delinquent user may read every spood but may write only to their first-created spood.
4. Care timestamps are keeper-timezone values and future events are rejected.
5. Streaks are shared across the keeper account and depend on completing the whole day's required care.
6. The current web server actions are not a stable native JSON API. The native app needs a deliberate API/session contract.
7. Purchases remain web-only for the invite-only mobile beta.

---

## 1. Environment and deployment isolation

### Separate staging infrastructure

- Staging uses a separate Vercel project and a separate Supabase project.
- The expected staging Supabase project reference is `nfdecdylxcmuypxodppe`.
- `src/lib/staging-guard.ts` validates staging configuration during builds.
- Staging is detected with `SPOODLY_ENV=staging` or the known staging Vercel project ID.
- In staging, database URLs, Supabase URLs, and Supabase keys must point to the staging Supabase project.
- The build rejects production Stripe variables, public Stripe variables, and the production-style `RESEND_API_KEY` in staging.
- Staging email delivery requires a dedicated sender, HTTPS origin, and recipient allowlist.
- Stripe checkout is deliberately disabled on staging even if Stripe variables are accidentally supplied.

### Web and crawler controls

- `next.config.ts` runs the staging guard at build time.
- Global headers now include:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Staging adds `X-Robots-Tag: noindex, nofollow, noarchive` to all responses.
- `/robots.txt` disallows all crawling on non-production hosts.
- Production robots rules allow the public landing/brand surface and disallow authenticated, auth, API, and upload areas.
- The health route now reports only coarse service availability, uses no-store caching, and does not expose environment or secret details.
- `.vercelignore` was added.
- Vercel is pinned to the `pdx1` region.
- A billing reconciliation cron runs every six hours at `/api/cron/reconcile-billing`.

### Email configuration split

New dedicated variables separate transactional account email from other app email:

- `EMAIL_RESEND_API_KEY`
- `EMAIL_FROM_EMAIL`
- `EMAIL_VERIFICATION_ORIGIN`
- `EMAIL_ALLOWED_RECIPIENTS`
- `PASSWORD_EMAIL_VERIFICATION_GRACE_START`

`EMAIL_VERIFICATION_ORIGIN` lets staging email links use `https://staging.spoodlyspace.com` while Auth.js/OAuth can retain the callback origin required by the provider configuration.

### Legal and public pages

- Added `/privacy` and `/terms` pages.
- Added a small standalone `legal-site/` artifact for cases where the legal pages need to be hosted independently.
- The public landing page now links to the legal pages.

---

## 2. Database schema and migrations

The Prisma schema now contains the following additions.

### `User`

- `emailVerified DateTime?`
- `image String?`
- `passwordHash` is nullable to support social-only accounts.
- `authVersion` is a UUID used to revoke existing sessions.
- `emailChangeVersion` is an optional UUID used to bind and invalidate email-change attempts.
- Billing reconciliation state:
  - `billingLastCheckedAt`
  - `billingNextCheckAt`
  - `billingCheckFailures`
  - index on `(billingNextCheckAt, id)`
- Relations to `Account[]`, `CareDay[]`, `CareCheckin[]`, and `CelebratedReward[]`.
- `Spider` also has a relation to `CareCheckin[]`.

### New `Account` model

Auth.js provider identity storage, including `provider`, `providerAccountId`, standard OAuth token fields, a unique provider/account identifier pair, and cascading deletion with the user.

### New `CareDay` model

Stores shared daily-care completion:

- `userId`
- local `dayKey`
- IANA `timeZone`
- `completedAt`
- JSON completion snapshot, including saved care policy/manual reviews for new completions
- nullable `invalidatedAt` for reversible withdrawal after history corrections
- unique `(userId, dayKey)` constraint
- cascading deletion with the user

### New care-progress and celebration models (September 20)

- **`CareCheckin`** stores partial manual check-ins and feeding/misting deferral explanations in `deferred` JSON. Its primary key is `(userId, dayKey, spiderId)`; user and spood relationships cascade on deletion. Automatic progress is derived from care records rather than copied into this table.
- **`CelebratedReward`** stores claimed notification keys and `createdAt`, with primary key `(userId, key)` and cascading deletion with the user. It prevents repeated/concurrent badge notifications and records the initial reward baseline. It is a notification ledger, not the source of reward eligibility.
- Both tables have RLS enabled and all access revoked from `PUBLIC`, `anon`, and `authenticated`; trusted server code accesses them.

### New `RateLimitBucket` model

Stores shared, atomic rate-limit counters in Postgres instead of process memory:

- bucket identifier
- count
- expiry
- expiry index

### New `PendingEmailVerification` model

Supports signup verification and email changes without storing raw tokens:

- hashed token
- proposed email and optional previous email
- credential snapshot
- proposed display name
- optional user relationship
- purpose
- expiry and consumption timestamps

### Migration inventory

1. `20260915120000_harden_application_tables`
   - Enables RLS on application tables.
   - Revokes application-table privileges from `PUBLIC`, `anon`, and `authenticated`.
   - The migration header calls it a review copy, but staging setup records show that this SQL was applied to staging and its checksum registered. Do not edit it after application.
2. `20260915130000_add_rate_limit_buckets`
3. `20260916120000_care_days`
4. `20260916150000_social_accounts`
5. `20260917120000_email_verification`
6. `20260917121000_billing_reconciliation`
7. `20260918100000_email_change`
8. `20260918110000_email_change_credential_snapshot`
9. `20260920120000_care_celebrations`
   - Creates only `CareCheckin` and `CelebratedReward`, with RLS and restricted grants.
   - Applied through the guarded staging migration entry point to `nfdecdylxcmuypxodppe`.
   - Preserves existing care records and earned care days. Rolling back this feature’s code does not require dropping these additive tables.

These migrations add tables/columns/indexes or change authentication fields; they do not delete existing spoods, photos, or care history. They have only been exercised against staging in this development effort. Production still requires a separately reviewed migration and backup/rollback procedure.

Latest additive migration: `20260920180000_revalidate_care_days` adds `CareDay.invalidatedAt`; no care records are deleted.

### Supabase access model

- The staging Data API was disabled for application tables.
- RLS is enabled and direct `anon`/`authenticated` grants were revoked.
- Default grants were corrected to keep new application tables from becoming directly accessible.
- The application continues to use its trusted server-side database connection.

---

## 3. Authentication and account security

### Password policy and hashing

- New and changed passwords require 15–128 Unicode code points.
- Spaces and passphrases are allowed.
- There is no forced upper/lowercase, digit, or symbol composition rule.
- The UI shows the rule beside password fields and includes password confirmation during signup/password setup.
- New hashes use the `spoodly-password-v2$` format.
- Passwords are domain-separated and SHA-256 prehashed before bcrypt cost 10, preventing bcrypt's 72-byte truncation from weakening long passphrases.
- Existing bcrypt hashes remain valid so current users are not forced to reset immediately.

### Verified-email signup

The signup flow no longer creates a usable account immediately:

1. The visitor submits name and email.
2. Email is normalized to lowercase.
3. The server creates a single-use challenge using a hashed token.
4. The response is generic to prevent account enumeration.
5. The verification email links to `/verify-email` and expires after 30 minutes.
6. The visitor enters and confirms their password after following the link.
7. The account is created only after successful verification.
8. The app automatically signs in with credentials and routes to `/home`.
9. If automatic sign-in fails, it redirects to `/login?created=1` instead of leaving the visitor at an instructional message.

Pending signup data does not include a plaintext or password hash before the email is verified.

### Existing password accounts

- Existing password users receive a seven-day verification grace period after the configured activation timestamp.
- Home and Settings show a verification notice and resend control.
- Once the grace period expires, unverified password/JWT sign-in is blocked until the email is verified.
- Resend endpoints use rate limiting and generic responses.

### Social authentication

Google, Facebook, and Apple providers are supported when their required environment variables are configured. Instagram was intentionally excluded.

Identity rules are deliberately strict:

- Provider identity is the `(provider, providerAccountId)` pair.
- The app never silently merges or signs into an existing user because the provider returned the same email.
- Connecting a provider to an existing account requires a current valid signed-in session and an explicit Settings action.
- An ordinary social sign-in clears the current session before starting OAuth, reducing accidental account linking or landing in a previously signed-in user's account.
- Google signup requires a provider-verified email.
- Facebook's missing/unavailable email case returns an actionable error.
- Email lookups are case-insensitive and stored emails are normalized.
- Provider access/refresh tokens are not persisted by the Auth.js account callback.

### Session cookies and revocation

- HTTPS deployments use the `__Secure-authjs.session-token` cookie.
- It is `Secure`, `HttpOnly`, and `SameSite=None` to support provider flows such as Apple's POST callback.
- Local HTTP development uses `SameSite=Lax` without the secure prefix.
- JWT sessions contain an HMAC fingerprint derived from the current password/auth/email-change version.
- Password changes rotate credentials and invalidate all existing sessions.
- Confirmed email changes rotate auth state and force a fresh login.
- Deleted-user and stale-version sessions fail closed.
- The stale-session clearing route no longer lets a cross-site GET sign out a valid user.

### Email-address changes

- A password user must provide their current password.
- A social-only user must complete a recent provider reauthentication; the window is five minutes.
- The current address remains active until the new address is confirmed.
- The response uses privacy-preserving wording: “If that email address is available…”
- The token is hashed, single-use, expiring, and bound to the credential snapshot that requested it.
- Availability is checked again when the link is redeemed.
- Failed delivery does not mutate the active account.
- A notice to the old address is best effort; confirmation at the new address controls the change.

---

## 4. Durable rate limiting and validation

Rate limits now use atomic Postgres buckets and fail closed if the limiter cannot run. There is no in-memory fallback that would reset across serverless instances.

| Operation | Per account/identifier | Per IP | Window |
|---|---:|---:|---|
| Login | 10 | 60 | 15 minutes |
| Registration | 3 | 10 | 1 hour |
| Email verification | 3 | 30 | 1 hour |
| Email change | 3 | 30 | 1 hour |
| Feedback | 5 | 20 | 1 hour |
| Photo upload | 50 | 150 | 1 day |
| Password change | 5 | 20 | 15 minutes |
| Care writes | 120 | 400 | 1 day |

- On Vercel, client IP is taken from the Vercel-controlled forwarded-for header rather than an arbitrary caller-supplied header.
- A future self-hosted deployment needs an explicit trusted-proxy/header configuration.
- User, spood, care, and note inputs have server-side length bounds.
- Reminder intervals must be integers from 1 to 365 days.
- Hydration accepts at most eight methods with at most 120 characters each.
- Care notes are generally capped at 1,000 characters; constellation deferral notes at 240.
- Statuses, outcomes, and other enumerations are allowlisted.
- Impossible calendar dates are rejected.
- Every activity/event write rejects future timestamps on the server; the UI also applies a maximum datetime.

---

## 5. Billing and entitlement behavior

### Checkout and customer ownership

- Billing logic moved into server-only service modules.
- The previous unauthenticated reconciliation server action was removed.
- Reconciliation verifies that the Stripe customer belongs to the signed-in application user using the stored customer ID and Stripe metadata.
- User-row locking serializes checkout and webhook-related state changes.
- Customer creation uses deterministic idempotency.
- The app looks for and reuses an open checkout instead of creating concurrent duplicate sessions.
- It checks all pages of existing subscriptions and recent completed checkouts before starting another subscription.
- Only configured monthly/yearly price IDs and explicitly allowlisted legacy IDs are accepted.
- An unrecognized app-origin subscription price stops automatic reconciliation for manual review.

### Webhooks and order safety

- Stripe signature verification is mandatory.
- Event metadata is never trusted to choose the local user.
- A webhook triggers a fresh read of the customer's current Stripe state rather than applying the potentially stale event snapshot.
- Delayed/out-of-order events therefore cannot overwrite a newer subscription state with older status data.

### Effective Pro policy

- Only `active` and `trialing` grant Stripe-backed Pro access.
- `past_due` and `unpaid` revoke Pro immediately; there is no grace period.
- All spoods and history remain retained and readable after downgrade.
- A Stripe-backed Pro entitlement must have a successful reconciliation no more than 24 hours old.
- Manually granted Pro without a Stripe customer remains supported.

### Scheduled reconciliation

- Vercel calls `/api/cron/reconcile-billing` every six hours.
- A run processes at most 20 due accounts.
- Failures use exponential retry scheduling.
- Compare-and-update logic prevents a slow/failed older run from overwriting a newer webhook or reconciliation result.

### Free-plan and delinquent write policy

- Free users have one active spood slot; memorialized spoods do not consume the slot.
- Slot creation/restoration is serialized with a user-row lock.
- After Pro loss, all existing spoods and histories stay visible.
- Only the first-created spood remains writable, ordered by `createdAt` and then `id` as a deterministic tie-breaker.
- Later spoods become fully read-only, including new logs, edits, deletions, profile changes, and related mutations.
- Memorializing the first spood does not promote a later spood into the writable position.

### Mobile beta implication

Purchasing is intentionally absent from the invite-only mobile beta. The native app should show existing effective entitlement and downgrade/read-only behavior, but should not start App Store, Play Store, or Stripe purchases yet.

---

## 6. Dates, time zones, and care calculations

### Time model

- The keeper's IANA timezone is stored and can be auto-detected from the client.
- Wall-clock event input is parsed in the submitted/saved timezone, including daylight-saving boundaries.
- Activity editors preserve the timezone that generated the displayed wall-clock value, so editing a note does not move the event instant.
- Calendar-day calculations use the keeper's timezone rather than raw 24-hour differences.
- Date-only values such as hatch, acquisition, enclosure setup, and passed-away dates round-trip as UTC calendar dates so they do not shift a day in local display.
- Acquisition defaults to the keeper's current local calendar day.

### Feeding and molt calculations

- A successful meal is either “Ate normally” or “Ate partially.”
- The last successful feeding is queried independently with a database aggregate, so it is not missed because it falls outside a recent activity sample.
- The last successful molt is queried independently for the same reason.

### Molt phases and reminders

Stored phases are:

- `Normal`
- `Possible premolt`
- `Premolt`
- `Molting`
- `Post-molt recovery`

UI wording maps `Premolt` to “In premolt”; `Molting` stays “Molting.” A successful recent molt starts post-molt recovery, which returns to Normal after five keeper-calendar days.

Feeding reminders pause during possible premolt, premolt, molting, and post-molt recovery/recent-molt windows. Misting continues normally during all molt phases. A spood can therefore display both “Molting” and “Mist today.”

### Historical repair behavior

- Molt create/edit/delete operations lock the spider row and recalculate derived molt history.
- Backdated edits do not blindly replace a newer manual/current state.
- Unsuccessful molts do not advance instar or successful-molt state.
- `daysSincePriorMolt` and fasting-days-before-molt are recomputed across the full relevant history.
- Maintenance create/edit/delete operations lock the enclosure row and recompute the latest cleaning and rehouse dates.
- Removing the last matching record clears the corresponding summary instead of leaving stale state.
- Coupled writes use database transactions more consistently.
- Read operations no longer rewrite manual status as a side effect.

---

## 7. History and activity changes

### Story timeline

- Story is now lifetime history instead of a silent fixed-length sample.
- It uses stable keyset pagination with 50 entries per page.
- The cursor contains timestamp plus ID, so equal-timestamp boundaries do not skip or duplicate entries.
- “Load older” retrieves subsequent pages.
- Per-molt metrics can query the predecessor molt and preceding meal even when those records are outside the current visible page.
- The acquisition entry is included and rendered as a date-only event.

The general Activity page remains a recent view, merging bounded streams up to roughly 100 records. Agents should not treat it as the complete historical export.

### Optional play and interaction logging

Play is represented as an observation with kind `play and interaction`. It is entirely optional and is never part of required daily care.

Supported methods:

- Watched in enclosure
- Followed an object
- Explored outside enclosure
- Voluntary handling
- Other, which requires a description

An optional note can be added to every method. Care-entry menus now expose Feed, Hydration, Molt, Observation, and Play.

### Other record behavior

- Clearing an enclosure relationship now persists `null`; blank input is no longer ignored.
- All activity edit/delete mutations enforce ownership and current write entitlement.

---

## 8. Care Constellation, streaks, and rewards

### Navigation and pages

- Added `/constellation`.
- The center Add item in the bottom navigation was replaced with Badges/Constellation.
- Add a Spood remains available and more prominent on Home and My Spoods.
- My Spoods now uses the Lucide Labs spider icon.

### Shared streak model

The streak belongs to the keeper account, not an individual spood. This matters for Pro keepers with multiple animals.

Daily progress now updates automatically:

1. Saving today's feeding, hydration, general observation, or body-condition observation reviews that eligible spood automatically. No extra care checkbox is required for that spood.
2. A shared care star is earned only when **every eligible active spood** has been reviewed and all due feeding/hydration has been logged or explicitly deferred with an explanation. One completed spood in a two-spood collection remains partial progress.
3. A feeding attempt counts even when prey is refused; keepers are not prompted to feed again to earn a star. An observation reviews the spood but does not waive outstanding feeding or misting.
4. Molting pauses feeding requirements but does not pause misting requirements. Play/interaction is optional and does not automatically complete a check-in.
5. Manual check-ins remain available for quiet days. Partial check-ins and deferrals persist through `CareCheckin`; Home and Constellation show “X of Y spoods cared for.”
6. The keeper's saved timezone determines today. Backdated logs do not complete today's care day, and future events are rejected.
7. The server re-reads progress and validates the eligible collection/day before inserting completion. The `(userId, dayKey)` uniqueness constraint prevents duplicate care stars under concurrent saves. An empty eligible collection cannot earn a star.

For Pro accounts, every writable active, non-memorialized spood participates. For free/delinquent accounts, only the first-created spood participates if it is active and writable; memorializing it does not promote another spood into the free slot. Read-only spoods do not block completion.

A streak remains current when the latest completed care day is today or yesterday in the keeper's timezone. Edits and deletions now reevaluate earned care days. Incomplete days are marked with `invalidatedAt` and excluded from streaks; retained snapshots allow later corrections to restore them. See [Badge revalidation](badge-revalidation.md) for legacy snapshot limitations.

### Streak rewards

| Days | Reward |
|---:|---|
| 1 | First Spark |
| 3 | Little Orbit |
| 7 | Seven Stars |
| 14 | Star Path |
| 30 | Moonkeeper |
| 100 | Galaxy Guide |

### Story rewards

| Reward | Trigger |
|---|---|
| First Portrait | Any uploaded Photo record |
| Sharp Eyes | A non-play general observation or body-condition observation |
| Silk Architect | Observation kind `built a new hammock` |
| Fresh Suit | A successful molt |
| Spoodiversary | One year after acquisition date, falling back to spood creation date |
| New Chapter | A rehouse maintenance event |

- Future-dated records are ignored for reward calculations.
- Earned rewards display their first earned date.
- Per-spood story rewards can be expanded from the shared gallery.
- Home contains a compact streak card; Constellation contains the seven-day view, daily checklist, and reward gallery.

### Save, care-star, and badge celebrations

- Successful actions show a brief save confirmation and confetti. Failed saves do not celebrate.
- A newly completed care day then shows an animated star, congratulations, and the shared streak count. Newly earned badges follow in a queue, using the same artwork as the gallery, with Next/Done controls and Escape dismissal.
- The global `CareCelebrations` component uses native dialogs for focus management. Reduced-motion preferences disable animation/confetti while preserving static congratulations.
- Successful action results can include `celebrations?: Celebration[]`, where each item has `key`, `title`, `message`, `symbol`, and `kind: 'star' | 'badge'`. Client forms dispatch these through `celebrateCare` after a successful save.
- Before the keeper's first mutation after rollout, existing earned badges are baselined in `CelebratedReward` with a `baseline:v1` sentinel. Existing badges do not flood the screen. New reward keys are claimed atomically, preventing duplicate popups from concurrent saves or refreshes.
- Badge checks cover care saves, photos (including a new spood's welcome photo), successful molts, rehousing, and relevant history edits. Time-based rewards such as Spoodiversary are detected during subsequent actions, not by a page-load timer.
- Reward-processing failures are logged and return no celebrations; they do not turn an already-saved care record into a failed save. Notification claims happen at save time, so delivery is not guaranteed if the client disconnects before displaying them.

Implementation and validation notes: [Automatic care progress and celebrations](care-celebrations.md).

---

## 9. Spood profile and form changes

### Common/scientific species fields

Common and scientific name fields are linked datalists, while custom text remains allowed. The curated list currently includes:

- Regal Jumping Spider — `Phidippus regius`
- Bold Jumping Spider — `Phidippus audax`
- Heavy Jumping Spider — `Hyllus diardi`
- Canopy Jumping Spider — `Phidippus otiosus`
- Tan Jumping Spider — `Platycryptus undatus`
- Adanson's House Jumper — `Hasarius adansoni`
- Paradise Jumping Spiders — `Habronattus` spp.
- Peacock Jumping Spiders — `Maratus` spp.
- Zebra Jumping Spider — `Salticus scenicus`
- Elegant Golden Jumping Spider — `Chrysilla lauta`
- Dimorphic Jumping Spider — `Maevia inclemens`
- Magnolia Green Jumping Spider — `Lyssomanes viridis`

### Life stage

- User-facing “Instar” was renamed “Life Stage.”
- Options: Unknown, Sling, i1 through i12, Sub-adult, Adult, and custom/Other.
- The database column remains named `instar`, so native DTOs may retain that internal field while presenting “Life Stage.”

### Read-only presentation

- Profile, Story, and Activity surfaces now explain Pro/free read-only state.
- Mutation controls are disabled or withheld when a spood is not writable.

---

## 10. Private photos and upload hardening

### Storage and references

- The Supabase `spoods` bucket is expected to be private.
- The service-role key stays server-side.
- New database references use `spood-storage:<object-path>` rather than a public URL.
- Legacy public/signed Supabase URLs are accepted only when their origin exactly matches the configured Supabase project, and they are converted to a safe object path rather than fetched as arbitrary URLs.

### Authenticated delivery

- Web rendering converts storage references to `/api/photos?ref=...`.
- That endpoint requires a signed-in user.
- It verifies that the user owns a matching `Photo` record or `Spider.profilePhoto` reference before reading Storage.
- Missing authentication returns 401.
- Unknown or unauthorized references return 404 to avoid revealing object existence.
- Storage failures return 503.
- Responses are private/no-store, use `nosniff`, allow only raster image types, and cap the response size at 5 MiB.
- Path decoding rejects traversal, malformed encodings, foreign origins, and empty path segments.

### Upload validation

- Client and server cap request image size at 4,000,000 bytes, leaving room below Vercel's 4.5 MB request limit.
- Allowed source formats are still JPEG, PNG, WebP, and GIF.
- Sharp fully decodes the image rather than trusting MIME type or header bytes.
- Maximum dimensions are 12,000 pixels per side and 40 megapixels.
- Only one image/page is accepted; animated/multipage payloads are rejected.
- Images are orientation-corrected and re-encoded as WebP at quality 85.
- Re-encoding strips metadata and trailing payloads.
- Storage filenames use random UUIDs.
- Uploads require authentication, ownership/write permission, and durable rate limits.
- Production/serverless environments have no local-disk fallback.
- If DB creation fails after upload, object cleanup is attempted.
- Deletion removes the DB row and Storage object and repairs the profile-photo fallback.

### Gallery and lightbox

- Story/profile images use the authenticated image component/path.
- Previously broken Story thumbnails were repaired.
- The lightbox moved to a top-level modal layer so Story cards cannot render above it.
- It supports keyboard focus lifecycle, Escape, backdrop dismissal, and image navigation.

### Native-app impact

- Native clients must authenticate photo requests; public Supabase URLs are no longer the contract.
- The web cookie endpoint may not be the best permanent mobile API. Add a native-authenticated media endpoint or a short-lived, ownership-checked download mechanism.
- HEIC is not currently supported.
- Phone images often exceed 4 MB, so native clients should resize/compress and convert before upload while preserving the server checks.

---

## 11. UI, accessibility, and content changes

- Added a reusable native `<dialog>` modal primitive at a high overlay layer.
- Modal behavior includes focus transfer/restoration, Escape handling, backdrop behavior, and inert background semantics.
- Feedback and photo lightboxes use the new modal.
- Feedback state remounts for every open, fixing the second-submission flow.
- Feedback includes useful diagnostics, durable rate limiting, and staging-specific email delivery.
- Home's Add action is more prominent.
- Home care-reminder text and profile eyebrow text have stronger contrast.
- Molt and mist status pills can appear together and remain readable.
- Landing content now resembles the real signed-in Home page instead of an inaccurate generic mock.
- Landing copy introduces shared streaks/rewards without overstating care obligations.
- Auth-page logo links home and uses a smaller layout.
- Settings now contains working display-name, feed/mist defaults, timezone, theme, email change, connected login methods, conditional password change, and legal links.
- Unused clean-reminder, date-format, and measurement controls were removed from the UI. Their database columns remain for compatibility.
- Bottom navigation already includes safe-area spacing.

---

## 12. Demo seed and operational safety

The demo seed script is no longer casually runnable:

- Requires `SPOODLY_ALLOW_DEMO_SEED=true`.
- Refuses `NODE_ENV=production`.
- Accepts only localhost/loopback database hosts.
- Replaces only the known demo account and its cascade.
- Performs replacement in a transaction.

Do not run this script against staging or production. No seed command was used during this review/handoff.

---

## 13. Dependencies and tests

### Dependency changes

- Added `@auth/prisma-adapter`.
- Added `@lucide/lab` for the spider icon.
- Added `sharp` for server-side image validation and normalization.
- Added/updated the `deepmerge-ts` override.
- The test glob now includes root and nested test files.
- The lockfile was repaired to match the dependency graph.

### Verification status

Original September 19 verification:

- 335 tests passed; 0 failed.
- The local Webpack production build passed.
- The Vercel staging build and deployment passed.
- `https://staging.spoodlyspace.com/robots.txt` returned 200 with staging disallow-all rules and the no-index header.

Latest care/badge verification, September 20:

- 353 unit/regression tests passed; TypeScript and targeted ESLint passed.
- Guarded staging integration covered multi-spood progress, backdated logs, body-condition observations, concurrent star/badge deduplication, and repeated saves. Disposable fixtures were removed afterward.
- Local Chromium checks covered save → star → badge sequencing, Escape dismissal, and reduced-motion behavior.
- Live staging browser checks verified that the first of two spoods remains partial, the second hydration earns the shared star and First Spark, an observation earns Sharp Eyes, and refresh does not replay rewards.
- The Vercel staging build passed and deployment `dpl_CWCBYMvjSuBeVmasmtA86bKVKsjx` was verified on `https://staging.spoodlyspace.com`.
- No production database access, production-site deployment, seed command, or main-branch commit was performed for this update.

These are recorded verification results from the implementation, not tests rerun for this documentation edit. They do not substitute for native-client integration tests or for a production migration rehearsal.

---

## 14. Native app integration gaps and decisions

These are not regressions in the staging web app, but agents in the other repository must resolve them explicitly.

### API boundary

Most current mutations are Next.js server actions. Their wire encoding is an internal framework detail, not a versioned public API. A native client should not reverse-engineer or depend on those request payloads.

Choose one of these approaches:

1. Add versioned authenticated JSON endpoints in the web/backend repository and share schemas with the native app.
2. Introduce a dedicated backend-for-mobile layer that calls the same domain services.
3. Move reusable domain logic into a shared package while keeping database/service-role access exclusively server-side.

The domain services and validation modules added in staging are suitable foundations, but each endpoint still needs authentication, authorization, rate limiting, input validation, and stable error codes.

### Care progress and celebration contract

The native API must expose server-derived per-spood progress and shared completion, plus newly claimed celebrations after successful writes. Preserve the save → care star → badge sequence, accessible dismissal, and reduced-motion behavior. Do not award a care star locally after a single spood's log or infer new awards from the full gallery. Refreshing the gallery must not replay old rewards. Reuse the server's atomic completion and reward-claim logic when adding JSON endpoints.

### Native authentication

- Current authentication is Auth.js with web cookies and browser OAuth redirects.
- Native Google/Facebook/Apple flows should use the operating system browser/provider SDK and verified deep/universal links.
- The backend must still bind the login to provider plus provider account ID.
- Never merge by matching email automatically.
- Define how a native session token is issued, refreshed, revoked via `authVersion`, and sent to photo/API endpoints.

### Offline and retries

- Billing has idempotency protection, but care-event writes do not yet accept client-generated idempotency keys.
- A native offline queue or network retry can therefore duplicate feeding, hydration, molt, observation, play, or maintenance entries.
- Add an operation ID/idempotency key per client mutation before enabling offline queued writes.
- Preserve the original keeper timezone and local wall-clock value when a queued event is submitted later.
- The server must continue to reject timestamps that are in the future at submission time.

### Photos

- Add native preflight resizing/conversion for large phone photos and HEIC.
- Keep server-side decode/re-encode/ownership checks; client validation alone is insufficient.
- Decide whether native download uses an authenticated API stream or short-lived signed URLs created only after ownership verification.

### Purchases

- Do not add purchases in the invite-only first release.
- Display current plan/read-only status from the server.
- Avoid links or UI that accidentally invokes web Stripe checkout from the mobile binary until App Store/Play policy and native purchase reconciliation are designed.

### App-store readiness still missing

- In-app account deletion is not implemented.
- There is no push-notification service or permission flow.
- There is no formal offline-sync/conflict strategy.
- There is no stable public mobile API/versioning policy.
- There is no native deep-link/OAuth callback contract yet.
- There is no native purchase or receipt-validation implementation by design.
- HEIC and large phone-camera images require client preprocessing.
- The web `Permissions-Policy: camera=()` disables browser `getUserMedia`; a native camera bridge is unaffected, but an embedded web camera flow would need a deliberate exception.

---

## 15. Suggested implementation order for the other repository

1. **Freeze the contracts:** model the new User, Account, CareDay, CareCheckin, CelebratedReward, verification, entitlement, activity, and private-photo behavior.
2. **Build the native session/API layer:** include revocation/version checks and provider-ID identity rules.
3. **Implement read-only browsing first:** Home, My Spoods, profile, Story pagination, Constellation, and authenticated photos.
4. **Implement writes with server authorization:** honor first-created-spood write policy and all validation rules.
5. **Add client-generated idempotency keys:** do this before offline/retry support.
6. **Add OAuth through system flows and deep links:** Google/Facebook/Apple; no automatic email linking.
7. **Add photo preprocessing:** convert HEIC/oversized images, then submit to the hardened server pipeline.
8. **Add daily-care and constellation completion:** preserve timezone/day semantics, automatic per-spood progress, all-eligible-spoods completion, and once-only star/badge celebrations.
9. **Add account deletion and store-required disclosures.**
10. **Run invite-only staging beta without purchases.**

---

## 16. Source map for agents

The most useful implementation entry points in the staging worktree are:

- Environment guard: `src/lib/staging-guard.ts`
- Schema and migrations: `prisma/schema.prisma`, `prisma/migrations/202609*`
- Auth/session: `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/social-auth.ts`, `src/lib/credential-version.ts`
- Registration/password/email: `src/lib/password-policy.ts`, `src/lib/email-verification.ts`, `src/lib/email-challenge.ts`, `src/app/actions/auth.ts`, `src/app/actions/email-change.ts`
- Billing: `src/lib/billing-service.ts`, `src/lib/billing-reconciliation.ts`, `src/lib/effective-entitlement.ts`, `src/lib/billing-policy.ts`
- Write entitlement: `src/lib/spider-write-policy.ts`, `src/lib/spider-slots.ts`
- Rate limiting/validation: `src/lib/rate-limit.ts`, `src/lib/rate-limit-core.ts`, `src/lib/write-validation.ts`
- Care/time: `src/lib/care.ts`, `src/app/actions/care*.ts`, `src/lib/history-state.ts`, `src/lib/history-mutations.ts`
- Story pagination: `src/lib/history-page.ts`
- Constellation: `src/lib/constellation.ts`, `src/lib/constellation-data.ts`, `src/app/actions/constellation.ts`
- Automatic care progress: `src/lib/care-progress.ts`, `src/lib/care-progress-data.ts`, `src/lib/care-progress.test.ts`
- Care-day and badge reevaluation: `src/lib/care-day-revalidation.ts`, `src/lib/care-revalidation-data.ts`, `src/lib/reward-data.ts`, `docs/staging/badge-revalidation.md`
- Reward claims/completion: `src/lib/care-celebrations.ts`, `src/app/actions/care-shared.ts`
- Celebration/check-in UI: `src/components/constellation/celebrations.tsx`, `src/components/constellation/reward-art.tsx`, `src/components/constellation/care-review.tsx`, `src/app/globals.css`
- Care migration and staging validation: `prisma/migrations/20260920120000_care_celebrations/migration.sql`, `scripts/staging-care-celebrations-check.ts`, `docs/staging/care-celebrations.md`
- Private photos: `src/lib/photo-media.ts`, `src/lib/photo-media-route.ts`, `src/lib/upload-validation.ts`, `src/app/api/photos/route.ts`
- UI forms/options: `src/components/spoods/species-fields.tsx`, `src/components/spoods/life-stage-field.tsx`, `src/components/spoods/quick-log.tsx`
- Modal/accessibility: `src/components/ui/modal-dialog.tsx`
- Robots/legal: `src/app/robots.txt/route.ts`, `src/app/privacy`, `src/app/terms`

Read the nearby tests alongside each module. They document boundary conditions such as case-insensitive identity, stale sessions, equal-timestamp pagination, future dates, read-only spoods, out-of-order Stripe events, storage traversal, and concurrent care-day completion.

---

## 17. Admin, demo and maintenance local preparation (September 22)

**Current staging status, September 23, 2026.** The full dirty worktree, including Tasks 1–10 admin/maintenance changes and the Test-as acceptance fixes, is deployed only to the separate staging project as `dpl_BRMBAH27YxXqmUCFNqTzJsmj7mpS`. Both reviewed migrations, owner binding, guarded fixture, maintenance rehearsal and scoped browser acceptance ran on staging with separate approvals. The disposable browser fixture was untagged and permanently deleted after retest. No commits, pushes, production project/database access or seed/reset commands occurred. Preserve this worktree and its `.superpowers/sdd/2026-09-20-admin-maintenance` reports; branch HEAD alone is insufficient.

### Applied staging migrations

These two migrations were the exact guarded pending set and were explicitly approved and applied to staging. Post-deploy guarded status reported all 17 staging migrations current. They remain unapplied to production unless a later production checkpoint proves otherwise; compare production history against the full local migration directory and stop for any unexpected difference.

| Migration under `prisma/migrations/` | SHA-256 of `migration.sql` |
| --- | --- |
| `20260921010000_admin_foundations` — cumulative additive admin schema, extended by Tasks 1–8 and grant-hardened in Task 10; unchanged in final fixes | `8cea3a400ad5d2525b2f894cf32cd05df97142322558a3a0c46db028ecba9c98` |
| `20260922010000_remove_consumed_unbound_registration_challenges` — separate destructive legacy auth-metadata cleanup | `c18ed887b81e2ee007f01f1cb07052a20ab9da2951edad4a7d17a53023478c17` |

The cleanup deletes only `PendingEmailVerification` rows where `purpose = 'register' AND consumedAt IS NOT NULL AND userId IS NULL`. It preserves pending/unconsumed challenges, bound challenges and all application/care data. This removes legacy completed registration email/name/token-hash metadata without guessing ownership from email. Explicit database approval must include this intentionally destructive scope and the backup/rollback procedure; additive-admin approval alone is insufficient. Future successful password registrations atomically delete their exact proven challenge after creating the user. Legacy-erasure completeness remains conditional on applying the approved cleanup.

| Schema addition | Purpose |
| --- | --- |
| User `role`, `suspendedAt`, `deletingAt`, nullable UUID `adminVersion`, integer `accountVersion`, `isDemo`, `demoPlan`, `demoLabel`, UUID `testContextVersion` | Live roles/access, mutation concurrency, demo plan and stale-form epoch |
| PendingEmailVerification `requestedByAdminId` | Preserve admin initiator through verified target email change |
| ProtectedOwner | Immutable singleton binding to an explicitly selected eligible owner; migration leaves it empty |
| AdminAudit / AdminReauth | Safe retained events and credential-bound expiring identity proof |
| AccountDeletionOperation / OwnedUpload | Resumable exact-target cleanup receipts and durable upload reservation manifest |
| BillingCheckoutIntent | Unique per-account durable checkout request identity with restrictive User FK |
| AdminTestSession | Opaque hashed actor/target sessions, 60-minute bound and one active session per actor |
| SiteSettings | Singleton versioned announcement/deadline, initially open with announcement disabled |

Static review of **admin foundations only**: one outer `BEGIN` and final `COMMIT`, matching function/DO dollar delimiters, additive columns/tables/indexes/checks and no executed user-data DELETE, TRUNCATE, destructive backfill or ownership guessing. The separate auth cleanup above intentionally executes a narrowly scoped DELETE in its own transaction. User role/demo/verification checks plus owner trigger prevent invalid protected state; adminVersion rotation preserves untouched legacy fingerprints when null. Owned-write triggers lock/version users, reject deleting accounts and allow exact deletion-context cleanup. Checkout triggers preserve immutable recovery identity and block demo/deletion while intent is pending. Audit UPDATE is denied; retention deletion is intentionally allowed only by the reviewed service. Every new internal table enables RLS, supplies no browser policies and explicitly revokes PUBLIC/anon/authenticated table privileges.

Staging executed this SQL and the guarded checks verified the protected owner, core trigger behavior and application flows. Production still requires its own runtime privilege/history/impact verification. Owner/security-owner and BYPASSRLS roles can exceed browser grants; infrastructure DDL powers are outside app protections. Table locks/trigger installation and the UUID default can still incur deployment time even though most changes are additive. Do not equate additive with zero operational risk.

### Configuration to reconcile after approval

- `SPOODLY_ENV=staging`; expected Supabase ref `nfdecdylxcmuypxodppe`; Vercel staging project ID `prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO`. Recheck `.vercel/project.json` identifies **spoodly-space-staging** immediately before deployment. It is not verified by this local document.
- `DATABASE_URL` and `DIRECT_URL` must satisfy the existing staging guard; `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` and service-role/storage configuration must identify the staging project. Browser roles must not receive internal-table access. No production values.
- Server-only `ADMIN_OWNER_ID` must match the independently verified one-time ProtectedOwner binding. It is the only new persistent feature configuration; no owner is guessed or auto-created.
- Preserve existing `AUTH_SECRET` (or supported `NEXTAUTH_SECRET` fallback), correct HTTPS `AUTH_URL`/provider callback configuration and server cookie settings. Rotating the secret invalidates credentials/proofs/test contexts; it is not a harmless deployment tweak.
- Staging Stripe remains disabled; no `STRIPE_*`/`NEXT_PUBLIC_STRIPE_*` or production `RESEND_API_KEY`. No real charges or live Stripe test-mode enabling for this checkpoint. Use injected Stripe fakes for subscription history, pagination, uncertainty and concurrency acceptance.
- Any later separate email-browser acceptance uses the reviewed staging `EMAIL_RESEND_API_KEY`, `EMAIL_FROM_EMAIL`, HTTPS verification origin and allowlist. The admin fixture script neutralizes both mail API credentials in its own process immediately after dotenv loading, before guards or Prisma construction; it leaves the local environment file and app email configuration unchanged, uses only `@example.invalid`, and sends nothing. Never send fixture email to a real inbox.
- `STAGING_ADMIN_MAINTENANCE_APPROVAL_FILE` is an optional local-script-only, short-lived rehearsal interlock, not deployed app configuration. No approval file exists or is implied by this handoff.

### Completed staging checkpoints and remaining gate

1. Completed: independent review and final scoped re-review; no unresolved critical/important finding.
2. Completed on staging: guarded migration history/impact review and both explicitly approved migrations.
3. Completed on staging: immutable owner binding and `ADMIN_OWNER_ID` configuration.
4. Completed on staging: guarded exact-ID fixture check and cleanup.
5. Completed: production-mode staging builds and 692-test/type/lint verification.
6. Completed on staging: approved CLI deployment `dpl_BRMBAH27YxXqmUCFNqTzJsmj7mpS`, exact custom-domain verification and healthy endpoint.
7. Completed for the recorded scope: maintenance warning/active/reopen rehearsal plus ordinary and Demo Free/Pro Test-as acceptance. The resulting two presentation defects were fixed, independently reviewed, redeployed and browser-retested; the disposable account was permanently cleaned up.
8. Remaining: owner acceptance, then the separately requested deep production-release peer review and stepwise production plan. Do not start production work automatically.

### Rollback limits

Keep the additive schema on an application rollback; do not reverse security triggers, delete bindings/receipts, erase pending checkout/upload evidence or reset account roles/demo fields to force compatibility. Older code ignores suspension, maintenance and demo controls and may admit writes/purchases that new code denies. Database constraints do not enforce every request-level policy. Returning old code to service is not a security-equivalent rollback; drain/isolate incompatible old deployments and define an approved infrastructure closure/forward-fix path before activation.

The first production rollout cannot rely on a maintenance switch absent from currently deployed production code. It needs a separately reviewed bootstrap/traffic-control/backup plan. Completed account deletion and external cancellation cannot be undone by reverting application code. Maintenance is not a backup and does not guarantee database quiescence. Detailed operator behavior and retained limitations are in [admin operations](admin-operations.md); local evidence and unperformed acceptance are in [admin acceptance](admin-acceptance.md).

The separate legacy authentication cleanup also cannot be undone by reverting code; removed registration metadata is not recreated. Final-review fixes additionally reconcile Facebook cleanup with per-owned-row version triggers and expose the actor-bound Return action inside the active maintenance modal after Test-as context loss, with an explicit unsaved-value warning. Offline regression evidence is recorded in `.superpowers/sdd/2026-09-20-admin-maintenance/final-fix-report.md`; staging PostgreSQL and the scoped browser acceptance are now recorded in `docs/staging/admin-acceptance.md`.

---

## 18. Production-review fix batch (September 23)

The approved pre-production review findings were fixed in this isolated staging worktree. With explicit approval, its new migration was applied through the guarded staging-only command on September 23, 2026; Prisma then reported all 18 staging migrations current. The verified batch was subsequently deployed only to the separate staging Vercel project as `dpl_3XiUGejzu4efZLLkJpUuvbSBeDdB`. No seed, reset, commit, push, production project, or production database action occurred.

- `20260923010000_harden_pending_email_verification` enables RLS and revokes `PUBLIC`, `anon`, and `authenticated` access to `PendingEmailVerification`. It is applied to staging and remains unapplied to production unless a later migration-history check proves otherwise.
- Authenticated private-photo reads now recognize every schema photo field through relational ownership, including enclosure and event photos.
- Existing-spood mutations lock the keeper and re-read live entitlement, suspension/deletion state, ownership, and oldest-active Free eligibility inside the write transaction. Preliminary UI/read checks remain advisory.
- Free write access follows the oldest active spood. Memorializing an earlier spood promotes the next active spood for writes and shared care review.
- Home, Constellation, and streak preview reads no longer perform full-history care reconciliation. Care mutations and historical edits/deletions reconcile only care days from the earliest affected old/new instant forward and load event evidence only across the applicable saved reminder horizon, preserving reversible care stars and badges.
- Account deletion gathers target-owned photo candidates first and checks only those references/keys for foreign ownership before object deletion.
- `/api/health` stays coarse and identity-free but now asks Supabase to confirm that the `spoods` bucket exists, is accessible, and is private. Environment, README, Privacy, and Terms copy describe the private bucket and service-role/secret key contract.
- Checkout return copy welcomes the keeper only after the freshly loaded effective plan grants Pro; delayed reconciliation gets a truthful pending message.
- Navigation CTAs use one link control, quick-log disclosures expose `aria-expanded`, collection totals remain accurate while filtering, and read-only photo empty text no longer invites an unavailable upload.

After the migration checkpoint, OAuth verification was corrected: a successful Google or Facebook callback now marks the keeper email verified only when the provider supplies the same valid email; Google additionally must assert `email_verified: true`. This makes new social accounts eligible for later admin promotion and safely repairs an existing linked account the next time that provider returns its matching email. Missing or mismatched claims remain unverified. This fix is included in staging deployment `dpl_3XiUGejzu4efZLLkJpUuvbSBeDdB`.

Current evidence: 712 tests passed; TypeScript, scoped ESLint, `git diff --check`, and the webpack production build passed. The earlier inert-URL Prisma validation and `npm audit --omit=dev` also passed. Vercel reported the isolated staging deployment ready, `staging.spoodlyspace.com` resolved to that exact deployment, `/api/health` returned `{"ok":true}`, and the deployed login HTML contained both Google and Facebook options. Independent re-review covered the original production-review fix scope; the later OAuth verification fix has focused regression coverage and still needs an authenticated browser sign-in/promotion acceptance check. These results do not replace backup/recovery planning or production approval.

## 19. Deletion hardening after the September 23 production-readiness review

The ordinary photo-removal and large-account deletion findings from the follow-up review were fixed locally in the staging worktree. No database command, seed, reset, commit, push, deployment, or production access occurred.

- Album and Activity photo deletion now reread the exact photo and current profile pointer inside the keeper-locked transaction. Legacy objects receive a durable `OwnedUpload` cleanup record before the album row is detached.
- Storage objects are removed only after a fresh relational check confirms that no profile, album, enclosure, feeding, molt, or observation still references the object. The check treats canonical storage references and legacy public or signed Supabase URLs as the same object. Provider or database uncertainty keeps the cleanup ledger and returns truthful pending-recovery copy.
- Account deletion creates the deletion receipt and blocks access before photo discovery. Discovery uses a versioned JSON manifest, persists its source/cursor after each fixed-size page, bounds foreign-reference key chunks, and remains compatible with earlier array manifests. Foreign-reference checks use per-key existence queries, so even an unexpectedly popular shared object cannot return an unbounded result set.
- The deletion preview uses bounded counts and labels its photo total as references before deduplication. Actual unique storage keys are accumulated only by the resumable deletion operation.

Verification after these changes: 725 tests passed using the direct Node runner. Focused deletion, cleanup, registration, maintenance, and upload tests passed. TypeScript, scoped ESLint, `git diff --check`, and the Next.js webpack production build passed. The default Turbopack build could not bind its CSS worker port in the restricted sandbox; its webpack equivalent completed successfully. An independent review found and prompted fixes for mixed storage-reference representations and unbounded foreign-reference result sets; both now have regression coverage. One minor local-development-only limitation remains: deleting an Activity photo does not unlink a `/public/uploads` fallback file, although the database row is removed. Staging and production use Supabase Storage, so this does not affect deployed photo cleanup.

## 20. Admin success-notice contrast

The account-role/profile success notice and the matching Operations completion notice now set an explicit dark green foreground on their pale green background. This prevents the cosmic/dark theme from inheriting nearly white page text into the notice. A static regression test covers both admin notices. This change is local only until a later explicitly approved deployment.


## 21. Beta care navigation verification (September 25)

Tasks 1–6 are committed locally through `b5d6c28` on `codex/staging-setup`. Task 7 resumed in the same staging worktree and completed automated verification, an independent whole-feature review, responsive checks using the existing account, and the review package. The owner approved committing the final local review fixes and documentation on September 25; this handoff is included in that local verification commit. No push or deployment occurred.

The selected design retains `/constellation` internally while calling it Journey. `SpoodIdentity` and `SpoodCareDetails` share presentation, `CareStatusGrid` shows the existing derived care values, `QuickLogButtons` reuses the guarded care actions and `MaintenanceFields`, `SpoodAccordion` preserves mounted panels, and native `DisclosureCard` sections shorten profiles. `RecentCareMeter` owns the single Journey streak summary; `RewardGallery` receives progress from the existing reward read model. No schema migration is required.

Later owner refinements keep Home attention cards limited to Feed/Hydrate at 50/50 width and remove their redundant Care status/Log care sections and explanatory sentence. Collection/Profile retain the full actions. Collection Profile and expand controls stay together; Journey check-ins include portraits. These supersede the original Home presentation in the plan.

Task 7 fixed independent-review findings covering theme/profile save races, missing profile enclosure availability, cramped identity/action layouts, overlapping day dots, and locked-reward text contrast. Browser inspection also prompted wrapping the narrow Home Journey CTA. Existing auth, entitlement, maintenance, date and reward rules remain in place.

Fresh evidence: 745 tests passed; TypeScript passed; lint passed with 38 unchanged pre-existing image warnings and no errors; `git diff --check` passed; webpack production build passed. The standard Turbopack build still fails because its CSS worker cannot bind a port in this environment. Local browser review used a loopback-only webpack dev server on port 43123; a separate final authenticated smoke pass served the verified production bundle on loopback port 43124 and checked Home, collection, profile and Journey at 320 pixels, then stopped that temporary server. Home, collection, active profile, and Journey had no horizontal page overflow at 320/390/1280 pixels in Light and the dark palette. Drafts survived collection/profile disclosure closure, all six care panels opened exclusively, and no-enclosure guidance appeared on collection and profile. The owner-approved theme test restored the original System preference and verified it after reload.

See [the smoke-test report](beta-care-navigation-smoke-test-2026-09-23.md) for exact procedure, fixes, review findings and limits. With-enclosure housekeeping writes, additional entitlement/collection fixtures, extreme names, a screen-reader session, and reduced-motion browser acceptance remain unperformed. No fixtures were seeded or altered to manufacture those states. The only intentional persisted browser changes were the approved theme switch/restoration. These results are a local review package, not production approval or a new staging-deployment acceptance result.


## Staging deployment checkpoint — September 25, 2026

The owner explicitly approved deploying commit `9fc6071189c96958789157e4e9a61c464c85e8b1`. It was deployed to the separate `spoodly-space-staging` Vercel project (`prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO`) as `dpl_27qsebc1wkr9venCV3p48vCNKTGT`. Vercel reported READY after its configured webpack build, TypeScript check, static generation and packaging succeeded. The production target label belongs to this staging project only.

- `vercel inspect staging.spoodlyspace.com` resolved to that exact deployment.
- `https://staging.spoodlyspace.com/api/health` returned HTTP 200 and `{"ok":true}`.
- Authenticated deployed-browser smoke checks passed for Home Feed disclosure, collection accordion/Housekeeping form, closed-by-default profile sections, and Journey badge progress. All four pages had no horizontal page overflow at a 320px viewport.
- The live staging account currently has an existing enclosure (unlike the earlier localhost review state), and Housekeeping displays its form. No care event, check-in, enclosure edit, or preference change was submitted during this deployment smoke check. Successful housekeeping save/history acceptance remains unperformed.
- The viewport was restored and the browser left on staging Home. Earlier full-matrix acceptance limitations still apply; this focused smoke check does not replace them.

No migration, seed/reset, git push, or production project/database action was performed. These deployment notes were added after deployment and remain uncommitted; the deployed code is exactly the approved commit above. Next checkpoint is owner acceptance and any separately authorized remaining acceptance work, not an automatic production release.
