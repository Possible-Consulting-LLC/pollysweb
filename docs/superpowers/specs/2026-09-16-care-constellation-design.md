# Care Constellation: shared streak and story rewards

## Status and goal

The keeper approved a shared streak across all active spoods and a dedicated page with illustrated rewards. This specification defines the first releasable version. It celebrates attentive care and naturally occurring moments without encouraging extra feeding, misting, handling, or breeding.

The feature belongs to the isolated staging worktree and separate staging services. It must not be committed to or deployed through `main`. No database commands, including queries, migrations, or seeds, are authorized for this feature. A migration file may be prepared and reviewed locally, but the feature cannot be enabled on staging until a later, separately authorized database step.

## Experience

- Add a compact Care Constellation card near the top of Home. It shows the current shared streak, today's state, and a link to `/constellation`. A day in progress is described as in progress, not as a lost streak.
- The Constellation page shows current and best streaks, a seven-day trail, then two galleries: **Care rhythm** and **Spood stories**. Earned illustrations are colorful; locked illustrations are subdued but still visible. Every tile includes its title and exact criterion in text, so color and images are never the sole signal.
- Tapping an earned reward reveals when it was earned. Story rewards show the spood and link to its profile or relevant story entry where available. Repeated story rewards of the same type are grouped in one tile with a list of the spoods who earned them.
- Keep the existing five-item bottom navigation. Reach the page from Home; do not shrink the current navigation to fit another icon.
- Empty state: with no active spoods, explain that the first daily review becomes available after adding one. Existing memorialized spoods may retain story rewards.

## What earns a shared care day

A keeper can review today's care for each active spood. The day uses the keeper's saved IANA timezone, falling back to the browser timezone and then UTC, consistent with existing date handling. Completion requires at least one active spood and a review of **every active spood at the time of completion**. A review confirms that the keeper looked in on that spood; it is not a request to perform extra care.

For each due item, the keeper either logs the appropriate care or chooses **Not appropriate today** and gives a short reason. Feeding reminders remain paused in premolt/molting according to existing care rules. Misting due remains visible during molting and must be addressed in the review. If nothing is due, a simple review is enough. The server recomputes due items and ownership when saving; it never trusts a browser-supplied due list or spider IDs alone.

Once all reviews qualify, the server stores a completed care day with its `YYYY-MM-DD` calendar key, timezone, completion timestamp, and a snapshot of the included spider IDs and any deferred items/reasons. One completed day per keeper/calendar date is allowed. Completion is durable: adding or memorializing a spood later does not retroactively change an earned day. A newly added spood joins the next day's review if today's day was already completed. A keeper can correct today's decisions before completion; completed days are read-only in version one. No day can be completed with an empty active collection.

The current streak ends today if today is complete, otherwise yesterday while today is still available. A missing prior day breaks the streak when the next day begins. Best streak is the longest consecutive run of completed calendar dates in the recorded timezone. A timezone change does not create a second reward for a duplicate date key. Earlier completed days remain recorded using their original date keys. No automatic backfilling or streak-repair currency is included in version one; backdated activity edits continue to correct the activity history without inventing a completed review. This is a deliberate first-version boundary for the previously discussed recovery idea.

## Rewards

| Type | Image title | Criterion |
| --- | --- | --- |
| Shared streak | First Spark | First completed care day |
| Shared streak | Little Orbit | 3 consecutive completed care days |
| Shared streak | Seven Stars | 7 consecutive completed care days |
| Shared streak | Star Path | 14 consecutive completed care days |
| Shared streak | Moonkeeper | 30 consecutive completed care days |
| Shared streak | Galaxy Guide | 100 consecutive completed care days |
| Spood story | First Portrait | First uploaded Photo for that spood; built-in avatar does not count |
| Spood story | Sharp Eyes | First ObservationEvent for that spood |
| Spood story | Silk Architect | ObservationEvent with the existing `built a new hammock` kind |
| Spood story | Fresh Suit | First MoltEvent with `successful = true` |
| Spood story | Spoodiversary | One calendar year from acquisition date, or from profile creation when no acquisition date exists |
| Spood story | New Chapter | First enclosure maintenance event with `kind = rehouse` |

Story rewards are optional discoveries, not a checklist every spood must finish. An adult or wild-caught spider may never molt in the keeper's care. No reward is based on feeding count, fasting duration, speed of molting, handling, egg laying, or the number of spoods owned.

Streak reward unlock dates derive from the first completed run reaching each threshold and remain earned if a later streak breaks. Story rewards derive from current, user-owned source records. Editing or deleting a qualifying source record updates the gallery; if no qualifying record remains, the story reward returns to locked. Spoodiversary is evaluated from the current profile date and the keeper's calendar date. Story rewards for memorialized spoods remain visible while their profiles remain in the account.

## Data and boundaries

- Add one `CareDay` model owned by `User`, unique on `(userId, dayKey)`. Store review snapshot as structured JSON text or a Prisma JSON field with server validation; the exact storage type is an implementation choice. A migration must enable RLS and avoid broad Data API grants, matching the staging hardening approach.
- Keep the reward catalog in application code, not database rows. Derive streak awards from `CareDay` and story awards from existing `Photo`, `ObservationEvent`, `MoltEvent`, `EnclosureMaintenanceEvent`, and `Spider` records. Do not add a badge-awards table or duplicate event state.
- Query only records belonging to the authenticated keeper. Use bounded, indexed queries and aggregations that do not truncate historical completions or quietly omit older reward events.
- Use the existing server-action pattern for review submission. Enforce authentication, ownership, timezone validation, due-state recheck, and one completion per date on the server. Concurrent submissions must be idempotent.
- Reward artwork is a set of static, app-owned illustrations with accessible names and sufficient text contrast in both existing themes. No external images, tracking, or social sharing are needed.

## Verification and release

- Write pure unit tests for timezone date keys, DST boundaries, current/best streaks, threshold dates, no-spood days, and story-event qualification. Test that successful molt only counts when `successful` is true, and that built-in avatars do not count as portraits.
- Test the server review decision rules, including molting plus mist due, feeding suppression, due-item deferral reasons, ownership, and concurrent completion behavior without connecting to a database.
- Run unit tests, lint, type checking, and build using only local tools. Do not load live credentials into tests or run any database command.
- Review the migration file separately before any staging execution. The code is ready for staging only after the migration is authorized and applied to the isolated staging project; this specification itself grants no such authorization.

## Self-review

The design gives one shared care streak to Free and Pro keepers, keeps spider-specific moments in a grouped account gallery, defines daily completion and missed-day behavior, avoids husbandry incentives, and states the database/release boundary. There are no production data dependencies or seed steps.
