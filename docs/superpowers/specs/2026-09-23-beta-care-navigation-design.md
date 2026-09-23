# Beta care cards, profiles, and Journey redesign

Status: approved by the owner in conversation. This document defines the design only. Application changes, commits, staging deployment, and production work remain separate approval checkpoints. Production data and infrastructure are out of scope; do not run database seed or reset commands.

## Purpose

Incorporate the first round of beta feedback before production release. Make routine care faster to understand and record on mobile, reduce long-page fatigue, and make the gamification destination clearly connected to streaks, care stars, milestones, and badges.

The redesign must preserve the existing care rules: a shared account streak requires all active spoods to receive qualifying care, Play remains optional, feeding reminders may pause during molt while hydration reminders continue, and historical edits or deletions continue to recalculate care stars and badge eligibility.

## Chosen direction and alternatives

Use structured, reusable care cards across Home and My Spoods.

Alternatives considered:

1. **Cosmetic cleanup only:** adjust spacing, icons, and colors without changing card structure. This has the smallest implementation scope but leaves status and actions visually crowded.
2. **Structured care cards:** separate identity, care status, and care actions; reuse the same expandable interaction across pages. This is the selected approach because it addresses the feedback without replacing established workflows.
3. **Full dashboard redesign:** replace the current page hierarchy and care flows. This offers the most flexibility but introduces unnecessary release risk and retraining before production.

## Shared navigation

- Rename the user-facing **Badges** destination to **Journey** in bottom navigation, page headings, links, accessibility labels, empty states, and success/error copy. Existing internal routes may remain `/constellation`; route renaming and redirects are not required for this release.
- A bottom-navigation item uses the purple selected treatment only when its route is active. Journey must not appear selected while the user is on Home or another page.
- Keep five bottom-navigation destinations: Home, My Spoods, Journey, Activity, and Settings.
- Use the existing spider icon for My Spoods. Use distinct, labeled icons for the remaining destinations, with visible text labels retained on mobile.
- Preserve the existing authenticated navigation and authorization boundaries. Navigation styling does not determine access.

## Home page

### Header and Journey entry point

- Replace the subtle text-only Add control with a prominent gold **Add spood** button near the Home heading.
- Label the gamification teaser **Your care journey** and show concise shared-account context such as the current streak and earned badge count.
- Use a clear **View journey** affordance so the destination and the Journey navigation item use the same language.
- The teaser links to the existing Journey route and does not maintain a separate progress calculation.

### Needs Attention care card

Each card has three clear regions:

1. **Identity:** photo, name, sex, species, life stage, current molt phase, and due-care pills. Give the molt-phase label its own spacing and treatment so it cannot be mistaken for sex/species metadata.
2. **Care status:** three compact summaries for Food, Water, and Behavior. Food and Water use the existing latest-event and reminder calculations. Behavior uses the latest recorded observation behavior when available and a neutral empty state such as “No recent note” otherwise. Do not place Last molt in this routine status row; molt remains available in profile history and as a logging action.
3. **Log care:** six labeled icon buttons for Feed, Hydrate, Observe, Molt, Play, and Housekeeping.

Action buttons continue to expand the established short forms in place. Icons supplement visible labels and never replace them:

- Feed: prey/worm icon
- Hydrate: water-droplet icon
- Observe: eye icon
- Molt: molt/sparkle icon from the existing icon set
- Play: playful activity icon
- Housekeeping: cleaning/broom-style icon from the existing icon set

Housekeeping reuses the existing enclosure-maintenance form, server action, event model, history editing, deletion, and reminder behavior. It defaults to Cleaning while retaining the current selectable maintenance kinds. If the spood has no enclosure, show the existing instruction to add enclosure details first. Do not introduce a second housekeeping table or event type.

## My Spoods

- Replace the always-expanded full care cards with compact summary rows.
- A collapsed row shows photo, name, species, life stage, current phase, and due-care pills.
- Selecting a row expands it in place to reveal the same Care status and Log care sections used on Home, plus a clear **View full profile** link.
- Use accordion behavior: opening one spood automatically collapses the previously opened spood.
- The collapsed header is a semantic button with `aria-expanded` and `aria-controls`. Its full tap target must remain usable at narrow mobile widths.
- Preserve list ordering, entitlement restrictions, memorialized-spood behavior, and all existing write-policy checks.

## Full Spood Profile

- Keep the profile header and Current care section open by default.
- Start About, enclosure, preferences, photos, and other detailed sections collapsed to reduce initial scroll length. Story remains a prominent profile-header action.
- Use semantic disclosure controls with visible headings, summary text where useful, `aria-expanded`, and keyboard operation.
- Remember open sections only for the current mounted visit. A new navigation visit returns to the clean default state; do not persist disclosure state to the database or account settings.
- Present About fields in two columns when space permits and one column on narrow screens. Read and edit states must preserve meaningful field order and accessible labels.
- Collapsing a section must not discard unsaved form input within the mounted page. Avoid unmounting dirty form content solely because its disclosure closes.

## Journey page

- Rename the heading to **Your Care Journey** and explain that progress is shared across all active spoods on the account.
- Lead with the current shared streak and a compact seven-day meter. Replace the existing “Best: XX days” emphasis with a prominent **XX-day streak** label and corresponding streak artwork.
- Remove the separate Care Rhythm badge-tile section. Streak progress belongs in the seven-day summary rather than a second competing section.
- Show all remaining reward badges in compact rounded tiles: three columns on supported mobile widths and a naturally expanding grid on wider screens.
- Earned badges appear in full color. Locked badges use a muted treatment while keeping the artwork, name, and requirement discoverable.
- Every badge requirement is visible; there are no secret badges. Selecting a badge reveals its description, requirement, current progress, and earned date when applicable.
- Progress copy must come from the same eligibility calculations that award or withdraw badges. It must not invent a second client-only interpretation of reward state.
- State clearly that Play and physical interaction are optional and never required for the shared daily care streak.
- Continue to reevaluate badges, care stars, and streaks after qualifying record creation, editing, or deletion.

## Component and data boundaries

- Extract or extend a shared presentation boundary for spood identity, care status, and quick actions so Home and My Spoods do not drift into separate behavior.
- Reuse existing server actions and forms for feeding, hydration, observation, molt, play, and enclosure maintenance. The UI may choose which panel is open, but it must not duplicate write logic.
- Keep current server-side authentication, entitlement, maintenance-mode, writable-spood, future-date, rate-limit, and derived-reward guards on every action.
- No database schema or migration is expected for this redesign. If implementation reveals a necessary schema change, stop and amend the design before creating or applying a migration.
- Do not change production configuration, data, storage, domains, or deployment as part of implementation.

## Responsive and accessible behavior

- Design for narrow mobile screens first and verify at 320 CSS pixels without horizontal scrolling or clipped labels.
- Maintain roughly 44-by-44-pixel touch targets for disclosure headers and care actions.
- Preserve visible focus indicators, logical tab order, live validation, pending states, and existing focus management when forms open or close.
- Do not encode due state, active navigation, earned state, or locked state by color alone. Pair color with text, icon, shape, or state label.
- Respect reduced-motion preferences for any existing care-star, badge, or confetti celebration.
- Maintain readable contrast in both current themes, including secondary metadata, status pills, success banners, and muted locked badges.

## Verification and acceptance

1. Home shows a prominent Add spood action, an unambiguous Journey link, separated Care status and Log care regions, and all six functioning quick actions.
2. Journey is visually active only on its own route. Home, My Spoods, Activity, and Settings receive the selected treatment only on their routes.
3. Housekeeping creates the existing maintenance event, handles missing enclosure details, and appears in existing profile/story/activity history without a duplicate data path.
4. My Spoods renders compact rows and enforces one-open-at-a-time accordion behavior without losing existing access restrictions.
5. Profile disclosures have the agreed default states, support keyboard and screen-reader use, retain mounted unsaved input, and render About as two columns only when space permits.
6. Journey shows the shared streak and seven-day meter once, removes Care Rhythm duplication, renders a compact responsive badge grid, and exposes accurate requirements and progress for every locked badge.
7. Play is visibly optional and does not affect care-day completion. Editing or deleting qualifying logs continues to withdraw invalid care stars and badges.
8. Focused component and behavior tests cover active navigation, accordion state, disclosure accessibility, quick-action selection, maintenance routing, and badge-progress presentation.
9. Run the full unit/integration suite, TypeScript, ESLint, and a production build. Perform responsive browser checks on Home, My Spoods, a full profile, and Journey in staging before release acceptance.

## Delivery sequence

1. Approve and commit this specification.
2. Write and approve a detailed implementation plan.
3. Implement with focused tests in the staging worktree.
4. Run full verification and an independent code review.
5. Request separate approval before creating a new release commit.
6. Request separate approval before deploying the exact reviewed commit to staging.
7. Complete authenticated staging smoke testing before resuming the production-release checklist.

