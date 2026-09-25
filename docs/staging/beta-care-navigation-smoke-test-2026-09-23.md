# Beta care navigation verification — September 25, 2026

Status: local verification and independent review completed for the available staging account; the acceptance gaps below remain explicit. The owner approved the final local release commit on September 25. Nothing pushed or deployed.

## Scope and environment

- Worktree: `/Users/rebeccapossible/web/spoodly-space/.worktrees/staging`, branch `codex/staging-setup`.
- Review range: specification commit `0a4951786ffefc365d18e566378b3e058288f598` through `b5d6c28`, plus the Task 7 working-tree fixes described below.
- Browser: local `http://localhost:43123`, using the existing staging configuration and authenticated keeper session with Pro entitlement, one active spood without an enclosure, and one memorialized spood.
- Routes: `/home`, `/spoods`, the existing active spood's `/spoods/[id]` profile, `/constellation`, and `/settings` for the approved theme check.
- Viewports: 320 × 900, 390 × 900, and 1280 × 900 CSS pixels (initial narrow checks also used 320 × 850).
- Themes: Light (`cosmic`) and System resolving to the dark palette. The owner explicitly approved the temporary theme change. The original System preference was restored and verified after a reload.
- Browser runtime: `next dev --webpack -p 43123 -H 127.0.0.1`. This is development mode, as in the plan's `npm run dev` command; the plan's “production-mode” heading did not describe that command accurately. The production bundle was separately built successfully with webpack. A final authenticated production-mode smoke pass used `npm run start -- -p 43124 -H 127.0.0.1` at `http://localhost:43124`, then the temporary production server was stopped.
- No fixture creation, care-log submission, seed/reset, migration, production access, or production configuration change. The only intentional persisted browser changes were the approved theme switch and restoration. Typed draft notes were cancelled or discarded without submitting.

## Latest approved design

The original specification was refined by the owner during local previews. Home attention cards intentionally show only Feed and Hydrate at equal width, omit the Care status block and Log care heading, and omit redundant explanatory care sentences. My Spoods and full profiles retain all six actions. Collection rows retain the Profile link beside the top-aligned expand/collapse control. Journey check-in cards include the profile portrait. These approved refinements take precedence over the older six-action Home checklist.

## Automated verification

| Command | Result |
| --- | --- |
| `npm test` | 745 passed, 0 failed, 0 skipped, 10 suites |
| `npx tsc --noEmit` | Passed, no diagnostics |
| `npm run lint` | Passed with 0 errors and 38 existing warnings; full output identical to the pre-fix run |
| `npm run build` | Environment failure: Turbopack CSS worker cannot bind a port (`Operation not permitted`, OS error 1) |
| `npm run build -- --webpack` | Passed: compilation, TypeScript, static generation, and build traces completed |
| `git diff --check` | Passed |

All 38 lint warnings are `@next/next/no-img-element`: 2 in the unchanged active source files `avatar-picker.tsx:73` and `prepared-photo-input.tsx:50`, and 36 in existing ignored admin-maintenance baseline copies under `.superpowers`. No new warning was introduced. Those unrelated scratch directories were preserved.

Initial resumed suite: 743 passed and 1 failed. The pre-existing unfinished theme regression correctly demonstrated that profile saving could overwrite independently saved theme state. The fix removes theme from the profile update; the separate guarded theme action owns it. The new unknown-enclosure regression was also observed failing before its fix and passed afterward. Focused checks then passed 11/11 before the full 745-test run.

Evidence logs are retained under `.superpowers/sdd/2026-09-23-beta-care-navigation/task-7-*-final.log`. The Turbopack failure is not represented as a successful standard build; webpack is the verified alternative for this local environment.

## Browser procedure and results

Repeat the following using an existing staging test account. Do not create or alter fixtures just to fill a missing acceptance case.

| # | Procedure | Recorded result |
| --- | --- | --- |
| 1 | Open Home at each width; inspect Add spood and selected navigation. | Passed in both palettes: prominent gold Add spood, only Home has `aria-current=page`, no horizontal page overflow. |
| 2 | Inspect the Journey teaser and its destination. | Passed: “Your care journey” and “View journey” link to `/constellation`. Fixed narrow layout so the CTA no longer squeezes the streak copy. |
| 3 | Inspect a Needs attention card against the owner's latest refinement. | Passed: identity/status pills and equal-width Feed/Hydrate controls; no redundant care explanation or Log care heading on Home. Full care sections remain in My Spoods. |
| 4 | Expand a collection row and open Feed, Hydrate, Observe, Molt, Play, then Housekeeping. | Passed: each opens the matching panel and closes the previous one; expanded states are exposed. Home Feed/Hydrate exclusivity also checked. |
| 5 | Open Housekeeping with and without an enclosure. | No-enclosure case passed on both collection and full profile: add-enclosure guidance and no save form. A real housekeeping submission with an existing enclosure was not performed; the current active fixture has none. Existing maintenance action remains the sole write path. |
| 6 | Type an unsaved observation note, open another collection row, then reopen the first. | Passed: only one row open; original note retained. |
| 7 | Inspect restricted spoods for write controls. | Memorialized collection row passed: no visible quick-write controls when opened. Pro-paused read-only active-spood browser case unavailable in this account; policy/component branches were reviewed and automated suite passed. |
| 8 | Open a full profile afresh. | Passed: Current care visible; all six applicable details sections initially closed. |
| 9 | Edit About, type an unsaved note, close/reopen by pointer and Enter. Cancel afterward. | Passed: note retained; native summary receives focus with a visible outline. About uses one column at 390 and two at desktop. |
| 10 | Open Journey and every badge; inspect selected nav, meter, progress and optional Play wording. | Passed: only Journey selected, seven distinct markers, one streak summary, six three-column badge tiles, all requirements/progress accessible, physical interaction explicitly optional. Locked progress text is no longer veiled. |
| 11 | Check narrow layouts, touch controls, IDs, focus and both palettes. | No page-level horizontal overflow on Home, collection, profile or Journey at 320/390/1280 in Light and the dark palette. Six care buttons measured 115.5 px wide and 56–58 px high at 320, without internal overflow. Open collection/profile DOM had no duplicate IDs. See limitations below for unexercised cases. |

A final production-mode smoke pass at 320 pixels confirmed authenticated Home with a working Feed panel, the collection accordion and no-enclosure Housekeeping guidance, the profile’s closed-by-default disclosures and no-enclosure guidance, and Journey’s seven non-overlapping markers and visible locked-badge progress. No page overflow was detected on the checked collection/profile/Journey screens. The browser was returned to port 43123 with its viewport override reset.

Before the meter fix, 40 px markers were placed only 34.14 px apart at 320, confirming overlap. Afterward the seven dots measured 29.57 px at 320, 39.57 px at 390 and 40 px at desktop, with no overlap at any width.

## Independent review and resulting fixes

A fresh reviewer examined the whole feature against the specification, plan and owner refinements. It found no new write-policy bypass, duplicate-ID issue, disclosure-driven form unmounting, or reward-evidence inconsistency. Six actionable findings were addressed:

1. Profile-save/theme-save race: profile updates no longer write theme.
2. Profile Housekeeping lacked enclosure availability: profile passes the real enclosure state; unknown availability defaults to guidance.
3. Narrow identity rows collided with adjacent controls: identity stacks at narrow widths, names wrap, and metadata is no longer truncated.
4. Housekeeping exceeded narrow action cells: action icons/labels stack with reduced padding at narrow widths and retain usable touch height.
5. Seven-day circles overlapped: marker diameter now fits its grid track.
6. Locked-badge overlay reduced requirement/progress contrast: the 50% muted treatment is limited to the artwork, leaving badge names and expanded text legible.

The parent also fixed the narrow Home teaser CTA after observing its squeezed text in the browser. Layout fixes were checked in the browser rather than adding tests that merely assert CSS class strings. Theme and enclosure behavior have failing-then-passing regressions. The full suite, types, lint, and webpack production build were rerun after the fixes.

## Remaining acceptance limits

- With-enclosure housekeeping submission and its appearance in history still need an existing appropriate staging fixture and approved test write. No successful database write is claimed for this case.
- Zero-spood, multiple writable active-spood, and Pro-paused read-only active-spood browser states were not available in the current fixture; no fixture was manufactured.
- Long unbroken synthetic names were not inserted into data. Wrapping was fixed and inspected using the existing names/species metadata; extreme-string browser acceptance remains unperformed.
- Native disclosure/keyboard states were inspected, but a screen-reader session was not run. Reduced-motion celebration guards were source-reviewed; no award was triggered or reduced-motion browser emulation performed.
- The standard Turbopack build remains blocked by local worker-port permissions; the webpack production build passed.
- This was a localhost review of the new code, not an acceptance run against a new staging deployment. Deployment and production release remain separate approval checkpoints.

## Release checkpoint

No migration is required. The full diff contains feature code/tests and its plan/documentation, with no environment files, Vercel metadata, credentials, schema/migrations, production configuration, or unrelated admin/security changes. Auth action changes are limited to the feature's guarded theme preference save.

The final local commit should include the two handoff documents, the Task 7 review fixes, and their regressions. Do not mark all browser acceptance complete while the limits above remain. Owner approval for this reviewed local commit was received on September 25; request separate approval before staging deployment.


## Staging deployment checkpoint — September 25, 2026

The owner explicitly approved deploying commit `9fc6071189c96958789157e4e9a61c464c85e8b1`. It was deployed to the separate `spoodly-space-staging` Vercel project (`prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO`) as `dpl_27qsebc1wkr9venCV3p48vCNKTGT`. Vercel reported READY after its configured webpack build, TypeScript check, static generation and packaging succeeded. The production target label belongs to this staging project only.

- `vercel inspect staging.spoodlyspace.com` resolved to that exact deployment.
- `https://staging.spoodlyspace.com/api/health` returned HTTP 200 and `{"ok":true}`.
- Authenticated deployed-browser smoke checks passed for Home Feed disclosure, collection accordion/Housekeeping form, closed-by-default profile sections, and Journey badge progress. All four pages had no horizontal page overflow at a 320px viewport.
- The live staging account currently has an existing enclosure (unlike the earlier localhost review state), and Housekeeping displays its form. No care event, check-in, enclosure edit, or preference change was submitted during this deployment smoke check. Successful housekeeping save/history acceptance remains unperformed.
- The viewport was restored and the browser left on staging Home. Earlier full-matrix acceptance limitations still apply; this focused smoke check does not replace them.

No migration, seed/reset, git push, or production project/database action was performed. These deployment notes were added after deployment and remain uncommitted; the deployed code is exactly the approved commit above. Next checkpoint is owner acceptance and any separately authorized remaining acceptance work, not an automatic production release.


## Owner Home refinements — September 25, 2026 (local, not deployed)

Following approved browser feedback, the Home card reserves Profile-button space only at the 480px horizontal identity breakpoint. Below that, the name, metadata and status pills use the full content width beneath the portrait. Home’s “days together” now counts calendar days since the effective keeper account’s `createdAt` in their resolved display timezone, with zero on signup day. Care streak calculations are unchanged; no schema change is needed.

Verification: four new Home regressions cover signup day, next local day, a UTC midnight within the same local day, and account age when the care streak is zero. All 749 tests passed. TypeScript, scoped ESLint, `git diff --check`, and the webpack production build passed. Authenticated localhost browser checks at 339px and 1280px confirmed full-width mobile details, an intact desktop layout, no horizontal page overflow, and “10 days together” for the existing keeper. Independent review found no actionable issues. No account data was changed. These refinements remain uncommitted and have not been deployed; staging still serves `9fc6071`.


## Owner Journey refinements — September 25, 2026 (local, not deployed)

Approved refinements add all six streak milestones to the existing Journey badge grid alongside the six story badges. Earned styling/date uses the derived milestone earnedAt evidence, so a reset current streak does not hide a previously earned milestone. Locked tiles show the current consecutive-day progress and requirement. The deferral placeholder is now “Why skip today?”. Reduced horizontal tile padding keeps “Spoodiversary” on one line at 320px and 339px without truncation.

Verification: new rendered-component regressions failed before implementation and now pass; full suite 751 passed, zero failed/skipped. TypeScript, scoped lint, whitespace checks and webpack production build passed. Browser inspection confirmed all 12 tiles, earned First Spark date, locked Little Orbit requirement/progress, the new placeholder, no page overflow at 320px, and one-line Spoodiversary at both mobile widths. Independent review found no actionable regressions. No check-in or care data was submitted. Home and Journey refinements remain uncommitted and undeployed.


## Collection refinements — September 25, 2026 (local, not deployed)

Approved changes let mobile accordion identity/details span the full card width beneath the portrait and top-aligned expand/Profile controls. Search now suggests up to eight unique names from the effective keeper's already-loaded full collection, matching substrings without case sensitivity. Selecting a suggestion fills Search; the existing GET Filter form still applies name/species, status and sex filters. Keyboard arrows, Enter, Escape, blur dismissal and pointer selection are supported. Active keyboard suggestions scroll into view.

Verification: substring, empty/unmatched, deduplication and bounded-list regressions passed; full suite 754 passed with zero failed/skipped. Types, scoped lint, webpack production build and whitespace checks passed. Local browser confirmed Star → Staging Star, ArrowDown/Enter selection without submitting, pointer selection of a name outside the currently filtered result, Escape dismissal, keyboard clearing plus Filter restoration, mobile accordion opening at 320px, full-width details at 339px, and intact desktop layout at 1280px. No page overflow at checked 320/1280 widths. Review's keyboard-scroll finding was fixed and re-reviewed with no remaining findings. The existing account had too few matching names to browser-exercise the eight-option scroll case; no fixture data was created. Changes remain uncommitted and undeployed.


## Journey account age — September 25, 2026 (local, not deployed)

Approved addition shows “X days on Spoodly Space” beneath the current streak headline. It uses the same nonnegative, timezone-aware calendar-day difference from keeper createdAt as Home, using the reward view's resolved timezone and request time. Streak calculation is unchanged. Rendered regressions cover 0, 1 and 10 days while retaining the independent 0-day streak. Full suite: 757 passed, zero failed/skipped; TypeScript, scoped lint, webpack build and whitespace checks passed. Browser339 showed “10 days on Spoodly Space”, matching Home; no page overflow at320. Independent review found no actionable issues. This addition and the collection refinements remain uncommitted and undeployed.


The owner subsequently requested removal of the redundant badge title from the recent-care card; browser inspection confirmed that the streak, account age and seven markers remain. The owner approved committing this collection/Journey batch and deploying to staging only. The final local suite passed all 757 tests.
