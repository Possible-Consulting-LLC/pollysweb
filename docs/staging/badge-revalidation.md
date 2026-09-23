# Badge and care-day revalidation — September 20, 2026

Editing or deleting a log rechecks reward eligibility. Story badges use all qualifying records across the keeper's account: losing one spood's qualifying entry removes that spood from the badge's list, but the account badge stays earned if another qualifying entry/spood remains. Successful-molt, hammock, observation/body-condition, photo, rehousing and anniversary evidence continues to be derived from current records.

Care stars and streak badges now also reflect corrected history. A completed care day is reevaluated against its saved timezone and original included spoods. Every included spood must still have a qualifying feeding/hydration/observation/body-condition log that day, or an explicit manual check-in. Due feeding and misting must still be logged or explicitly deferred. A refused feeding still counts as an attempt; play remains optional and does not count as a care review. Historical meal/date/molt edits can change the due state on later earned days, so reconciliation considers all of that account's completed days rather than just the edited event's date.

Invalid days receive `CareDay.invalidatedAt` instead of being deleted. They no longer count toward current/best streaks or milestone badges. Correcting the underlying evidence can restore them using the retained snapshot. An alternate qualifying historical streak preserves its milestone. A new spood or later plan change does not change the original collection in an already-earned day's snapshot.

New completion snapshots retain reminder intervals, spood statuses and explicit manual reviews. Existing snapshots lack that historical policy. On first reconciliation, current settings and available records are captured once as a legacy baseline; an original review with no qualifying automatic log is treated as a legacy manual check-in. This reconstruction cannot recover historical setting changes or distinguish every old manual check-in from an automatic review. Edit/delete actions establish that baseline before changing the records.

Withdrawn celebration markers are removed; earned markers and the rollout baseline sentinel remain. Badge claims are serialized per keeper and use fresh, untruncated reward queries within the same transaction client. A withdrawn badge can celebrate when earned again; repeated saves do not repeat its notification. A corrected current-day star can celebrate when restored through a qualifying save. Merely viewing the gallery does not show celebratory popups.

Reconciliation also runs on care/streak reads, so a transient post-save reward failure can recover on the next read. A successfully deleted entry is not reported as a failed deletion if subsequent reward refresh fails.

## Schema and deployment

`20260920180000_revalidate_care_days` adds only the nullable `CareDay.invalidatedAt` column. It deletes no existing rows. Applied only through the guarded staging migration entry point. Older code can run with the extra column but would count invalidated stars; a code rollback would therefore restore the former reward-display semantics.

## Verification

- Full unit suite: 374 passing tests; TypeScript and targeted lint passed.
- Existing staging care-celebration integration passed, including concurrent award deduplication and repeated saves.
- Pure regressions: whole-collection completeness, alternative evidence, saved timezone, manual reviews/deferrals, optional play, refused feedings and prior successful-meal corrections.
- Story/streak regressions: editing the last qualifying record, another spood retaining an account badge, and another qualifying streak retaining a milestone.
- `scripts/staging-badge-revalidation-check.ts`: isolated disposable keeper, two spoods, three care days, moving/restoring historical hydration, deleting/restoring today's hydration, preserving original requirements when the active collection shrinks, badge withdrawal/re-earning and duplicate-notification checks. Fixture cleanup is scoped to its exact generated user ID and email.

Sources: `src/lib/care-day-revalidation.ts`, `src/lib/care-revalidation-data.ts`, `src/lib/reward-data.ts`, `src/lib/care-celebrations.ts`, `src/lib/constellation-data.ts`, `src/app/actions/activity.ts`.
