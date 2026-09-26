# Feature Entry-Point Audit — Plan Creator / Feature Gating

**Date:** 2026-09-26
**Scope:** Every customer-facing entry point in the application: pages under `src/app/(app)`, customer-facing server actions in `src/app/actions/`, route handlers in `src/app/api/`, uploads, background jobs, navigation, and inline panels.
**Output of:** Task 0 (Entry-point audit). **Consumed by:** Task 1 (typed feature registry).

Every key below is a stable, long-lived identifier in the format `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$`, named for durability — not for today's UI. Keys follow the spec's `area.verb` / `area.scope.verb` convention. Categories: `spoods`, `care`, `habitat`, `photos`, `journey`, `activity`, `settings`.

## Counts by category

| Category | Features |
| --- | ---: |
| `spoods` | 7 |
| `care` | 8 |
| `habitat` | 3 |
| `photos` | 4 |
| `journey` | 4 |
| `activity` | 3 |
| `settings` | 5 |
| **Total** | **34** |

## Feature registry input

### `spoods` (7)

| Key | Name | Description | Entry points |
| --- | --- | --- | --- |
| `spood.create` | Add a spood | Create a new active spood (subject to the plan's `maxSpiders` allowance). | `src/app/(app)/spoods/new/page.tsx`, `src/components/spoods/add-spood-form.tsx`, `src/app/actions/auth.ts` (`createSpiderAction`), `src/components/home/hub-scene.tsx` (Add-a-Spood link) |
| `spood.about.view` | View spood profile | View a spood's About section and profile details. | `src/app/(app)/spoods/[id]/page.tsx`, `src/app/(app)/spoods/page.tsx`, `src/components/spoods/spood-card.tsx`, `src/lib/spiders.ts` (`getSpiderCare`) |
| `spood.about.edit` | Edit spood profile | Edit the About section and profile fields of an owned spood. | `src/app/actions/about.ts` (`updateSpiderAbout`), `src/components/spoods/about-form.tsx`, `src/components/spoods/species-fields.tsx`, `src/components/spoods/life-stage-field.tsx` |
| `spood.list.view` | Browse spood collection | Browse, search, and filter the spood list. | `src/app/(app)/spoods/page.tsx`, `src/components/spoods/spood-search.tsx`, `src/components/spoods/spood-accordion.tsx`, `src/lib/spood-search.ts`, `src/lib/spiders.ts` (`listSpidersForUser`) |
| `spood.story.view` | View spood story | View a spood's life-story timeline of events and photos. | `src/app/(app)/spoods/[id]/story/page.tsx`, `src/lib/spiders.ts` (`getSpiderStory`), `src/lib/story-photo-history.ts` |
| `spood.memorialize` | Memorialize a spood | Memorialize a spood, which frees its active slot. | `src/app/actions/care-habitat.ts` (`memorializeSpider`), `src/components/spoods/memorial-panel.tsx` |
| `spood.memorial.restore` | Restore a memorial | Restore a memorialized spood to active care (blocked when it would exceed the plan's allowance). | `src/app/actions/care-habitat.ts` (`restoreMemorializedSpider`), `src/components/spoods/memorial-panel.tsx` |

### `care` (8)

| Key | Name | Description | Entry points |
| --- | --- | --- | --- |
| `care.feed.log` | Log feeding | Record a feeding (quick log and full detail). | `src/app/actions/care-events.ts` (`quickFeed`), `src/components/spoods/quick-log.tsx`, `src/lib/care.ts`, `src/lib/care-progress.ts` |
| `care.hydrate.log` | Log hydration | Record a misting/hydration event. | `src/app/actions/care-events.ts` (`quickMist`), `src/components/spoods/quick-log.tsx` |
| `care.molt.log` | Log molt | Record a completed molt with instar details. | `src/app/actions/care-events.ts` (`logMolt`), `src/components/spoods/molt-stage-fields.tsx` |
| `care.observe.log` | Log observation | Record a free-text observation. | `src/app/actions/care-events.ts` (`quickObservation`) |
| `care.play.log` | Log interaction | Record a play/interaction moment. | `src/app/actions/care-events.ts` (`quickInteraction`) |
| `care.body_condition.log` | Log body condition | Record a body-condition assessment. | `src/app/actions/care-events.ts` (`logBodyCondition`), `src/components/spoods/profile-forms.tsx` (`BodyConditionForm`) |
| `care.premolt.manage` | Manage premolt status | Set and update a spood's premolt/life-stage status. | `src/app/actions/care-events.ts` (`updatePremoltStatus`), `src/components/spoods/premolt-toggle.tsx`, `src/components/spoods/life-stage-field.tsx` |
| `care.status.view` | View care status | View the derived essential-care status grid for each spood. | `src/components/spoods/care-status-grid.tsx`, `src/app/(app)/home/page.tsx`, `src/app/(app)/spoods/[id]/page.tsx` |

### `habitat` (3)

| Key | Name | Description | Entry points |
| --- | --- | --- | --- |
| `enclosure.view` | View enclosure | View a spood's enclosure details on its profile. | `src/app/(app)/spoods/[id]/page.tsx`, `src/lib/spiders.ts` (`getSpiderCare`) |
| `enclosure.manage` | Manage enclosure | Create or update a spood's enclosure record. | `src/app/actions/care-habitat.ts` (`upsertEnclosure`), `src/components/spoods/profile-forms.tsx` (`EnclosureForm`) |
| `housekeeping.log` | Log housekeeping | Record enclosure maintenance (cleaning, substrate, etc.). | `src/app/actions/care-habitat.ts` (`logEnclosureMaintenance`), `src/components/spoods/profile-forms.tsx` (`MaintenanceForm`), `src/components/spoods/maintenance-fields.tsx` |

### `photos` (4)

| Key | Name | Description | Entry points |
| --- | --- | --- | --- |
| `photo.upload` | Upload photos | Upload photos of a spood, including during Add-a-Spood. | `src/app/actions/care-habitat.ts` (`addSpiderPhoto`), `src/components/spoods/prepared-photo-input.tsx`, `src/lib/prepare-photo.ts`, `src/lib/uploads.ts`, `src/lib/upload-admission.ts`, `src/lib/upload-limits.ts`, `src/lib/upload-validation.ts`, `src/lib/photo-cleanup.ts` |
| `photo.gallery.view` | View photo gallery | View a spood's photo gallery, lightbox, and photo history. | `src/components/spoods/photo-gallery.tsx`, `src/app/api/photos/route.ts`, `src/lib/photo-media.ts`, `src/lib/photo-media-route.ts`, `src/lib/photo-reference-owner.ts`, `src/components/spoods/spood-image.tsx` |
| `photo.profile.set` | Set profile photo | Choose an uploaded photo as a spood's profile portrait. | `src/app/actions/care-habitat.ts` (`setSpiderProfilePhoto`), `src/components/spoods/avatar-picker.tsx` |
| `photo.delete` | Delete photos | Remove an uploaded photo and detach it from history. | `src/app/actions/care-habitat.ts` (`deleteSpiderPhoto`), `src/lib/photo-cleanup.ts` |

### `journey` (4)

| Key | Name | Description | Entry points |
| --- | --- | --- | --- |
| `universe.view` | View care journey | View the shared care-journey overview page (constellation hub). | `src/app/(app)/constellation/page.tsx`, `src/lib/constellation-data.ts`, `src/lib/constellation.ts` |
| `journey.check_in` | Complete care day | Complete today's care day, with celebratory feedback. | `src/app/actions/constellation.ts` (`completeCareDay`), `src/components/constellation/care-review.tsx`, `src/components/constellation/celebrations.tsx`, `src/lib/care-celebrations.ts`, `src/lib/care-day-revalidation.ts` |
| `journey.streaks.view` | View care streaks | View the recent-care meter and streak card. | `src/components/constellation/recent-care-meter.tsx`, `src/components/constellation/streak-card.tsx`, `src/app/(app)/home/page.tsx` (streak preview) |
| `journey.badges.view` | View rewards and stories | View the reward gallery of earned badges and spood story progress. | `src/components/constellation/reward-gallery.tsx`, `src/components/constellation/reward-art.tsx`, `src/lib/reward-data.ts` |

### `activity` (3)

| Key | Name | Description | Entry points |
| --- | --- | --- | --- |
| `activity.full_history.view` | View activity history | View and filter the recent-activity feed across all spoods. | `src/app/(app)/activity/page.tsx`, `src/lib/spiders.ts` (`getRecentActivity`), `src/lib/history-page.ts`, `src/lib/history-state.ts` |
| `activity.edit` | Edit activity entries | Correct the time or details of a past care event. | `src/app/actions/activity.ts` (`updateActivityAction`), `src/components/activity/activity-editor.tsx`, `src/lib/history-mutations.ts`, `src/app/(app)/spoods/[id]/story/page.tsx` (inline edit) |
| `activity.delete` | Delete activity entries | Remove an incorrect care-event record. | `src/app/actions/activity.ts` (`deleteActivityAction`) |

### `settings` (6)

| Key | Name | Description | Entry points |
| --- | --- | --- | --- |
| `settings.profile.manage` | Manage account profile | Edit display name, default timezone, and account preferences. | `src/app/actions/auth.ts` (`updateSettingsAction`), `src/app/actions/care-shared.ts` (`rememberUserTimeZone`), `src/app/(app)/settings/page.tsx` |
| `settings.theme.customize` | Customize theme | Switch between light and dark appearance. | `src/app/actions/auth.ts` (`updateThemeAction`), `src/components/settings/theme-toggle.tsx`, `src/lib/theme-toggle.ts` |
| `settings.password.change` | Change password | Change the account password. | `src/app/actions/auth.ts` (`updatePasswordAction`), `src/components/settings/password-form.tsx` |
| `settings.email.change` | Change email address | Request and confirm an email-address change (customer flow). | `src/app/actions/email-change.ts`, `src/components/settings/email-change-form.tsx`, `src/lib/email-change.ts`, `src/lib/email-challenge.ts` |
| `settings.social.link` | Link and unlink social sign-in | Link a social provider to the account and disconnect it. | `src/app/actions/social-auth.ts` (`linkSocialProvider`), `src/app/actions/disconnect-provider.ts`, `src/components/settings/disconnect-provider-form.tsx`, `src/lib/social-disconnect.ts`, `src/lib/social-disconnect-policy.ts` |

## Coverage checklist

Every file walked in Step 1 maps to at least one feature above, or is explicitly listed as plan-independent.

### Pages — `src/app/(app)`

- [x] `activity/page.tsx` → `activity.full_history.view`
- [x] `constellation/page.tsx` → `universe.view`, `journey.streaks.view`, `journey.check_in`, `journey.badges.view`
- [x] `home/page.tsx` → `care.status.view`, `journey.streaks.view`
- [x] `settings/page.tsx` → `settings.profile.manage`, `settings.theme.customize`, `settings.password.change`, `settings.email.change`, `settings.social.link`; billing controls on this page are plan-independent (see ruling below)
- [x] `spoods/page.tsx` → `spood.list.view`
- [x] `spoods/new/page.tsx` → `spood.create`
- [x] `spoods/[id]/page.tsx` → `spood.about.view`, `care.*` logs, `enclosure.view`, `photo.gallery.view`, `spood.memorialize`
- [x] `spoods/[id]/story/page.tsx` → `spood.story.view`, `activity.edit`
- [x] `today/page.tsx` + `today/layout.tsx` + `src/components/home/hub-scene.tsx` — navigation surface; covered by the features it opens (`spood.create`, `spood.list.view`, `activity.full_history.view`, `settings.*`)
- [x] `upgrade/page.tsx` → plan-independent (see billing ruling below)
- [x] `layout.tsx`, `error.tsx`, `loading.tsx` — application shell (plan-independent infrastructure)

### Pages — plan-independent

- [x] `src/app/page.tsx` (landing), `src/app/privacy/`, `src/app/terms/` — public/legal, plan-independent
- [x] `src/app/(auth)/` (login, register, verify-email), `src/app/actions/auth.ts` (`registerAction`, `loginAction`, `logoutAction`, verification actions), `src/lib/social-auth.ts` (`startSocialSignIn`) — auth, plan-independent
- [x] `src/app/maintenance/page.tsx`, `src/app/testing-ended/`, `src/lib/site-status-*`, `src/components/layout/site-status.tsx` — platform maintenance/status, plan-independent
- [x] `src/app/data-deletion/page.tsx`, `src/app/api/facebook/data-deletion/route.ts`, `src/lib/facebook-deletion.ts` — data-deletion compliance, plan-independent
- [x] `src/components/feedback/feedback-button` + `src/app/actions/feedback.ts` — feedback, plan-independent
- [x] **Customer billing surface — plan-independent per controller ruling:** `src/app/(app)/upgrade/page.tsx`, `src/app/actions/billing.ts` (`startCheckoutAction`, `openBillingPortalAction`), `src/components/billing/checkout-buttons.tsx`, `src/lib/billing.ts`, `src/lib/billing-policy.ts`. Billing is the destination the feature gate's "Upgrade" state points at, not itself a gated feature; every plan (including Free) must retain plan view, upgrade, and billing-portal access, and a plan configuration that could disable it would trap paying users. Consistent with the plan-independent classification already given to the Stripe webhook and billing cron.

### Admin surfaces — `src/app/admin/*`, `src/app/actions/admin-*.ts` (plan-independent, not gated features)

- [x] `src/app/admin/` (dashboard, accounts, audit, demos, maintenance, operations, reauth) and `src/app/actions/admin-accounts.ts`, `admin-delete-account.ts`, `admin-demo.ts`, `admin-maintenance.ts`, `admin-test-session.ts`, `src/lib/admin/*` — super-admin tooling, excluded from gating by design. Note: the demo-checkout recovery action (`recoverDemoCheckoutAction`) is admin-only and operates on a customer's billing state but is not a keeper-facing feature.

### Server actions — `src/app/actions/`

- [x] `about.ts` → `spood.about.edit`
- [x] `activity.ts` → `activity.edit`, `activity.delete`
- [x] `auth.ts` — `createSpiderAction` → `spood.create`; `updateSettingsAction` → `settings.profile.manage`; `updateThemeAction` → `settings.theme.customize`; `updatePasswordAction` → `settings.password.change`; remaining auth actions plan-independent
- [x] `billing.ts` → plan-independent (see billing ruling below)
- [x] `care-events.ts` → `care.feed.log`, `care.hydrate.log`, `care.observe.log`, `care.play.log`, `care.body_condition.log`, `care.molt.log`, `care.premolt.manage`
- [x] `care-habitat.ts` → `enclosure.manage`, `housekeeping.log`, `photo.upload`, `photo.profile.set`, `photo.delete`, `spood.memorialize`, `spood.memorial.restore`
- [x] `care-shared.ts` — shared helpers for care writes (mapped to the care/habitat features above); `rememberUserTimeZone` → `settings.profile.manage`
- [x] `constellation.ts` → `journey.check_in`
- [x] `disconnect-provider.ts` → `settings.social.link`
- [x] `email-change.ts` → `settings.email.change`
- [x] `social-auth.ts` — `linkSocialProvider` → `settings.social.link`; `reauthenticateForEmailChange` → `settings.email.change`; `startSocialSignIn` → auth (plan-independent)
- [x] `feedback.ts`, `auth.ts` (register/login/verification) — plan-independent (feedback, auth)

### Route handlers — `src/app/api/`

- [x] `auth/[...nextauth]/route.ts`, `auth/clear-stale/route.ts` — auth infrastructure, plan-independent
- [x] `brand/hero/route.ts`, `brand/mark/route.ts` — brand assets, plan-independent
- [x] `cron/reconcile-billing/route.ts` — billing reconciliation background job; protected by service secret; plan-independent (platform reliability, not a keeper feature)
- [x] `facebook/data-deletion/route.ts` — compliance, plan-independent
- [x] `health/route.ts` — health check, plan-independent
- [x] `photos/route.ts` → `photo.gallery.view` (serves private photos)
- [x] `site-status/route.ts`, `site-status/context/route.ts` — platform status, plan-independent
- [x] `stripe/webhook/route.ts` — billing infrastructure, plan-independent (webhook, not user entry point)

### Uploads — `src/lib/uploads.ts` and `src/lib/photo-*`

- [x] `src/lib/uploads.ts`, `src/lib/upload-admission.ts`, `src/lib/upload-limits.ts`, `src/lib/upload-validation.ts`, `src/lib/prepare-photo.ts` → `photo.upload`
- [x] `src/lib/photo-media.ts`, `src/lib/photo-media-route.ts`, `src/lib/photo-reference-owner.ts` → `photo.gallery.view`
- [x] `src/lib/photo-cleanup.ts` → `photo.delete`, `photo.upload`

### Navigation and inline panels

- [x] `src/components/layout/nav.tsx`, `src/lib/app-navigation.ts` — navigation surface; the nav destinations map to their respective features (`home`, `spoods`, `constellation`, `activity`, `settings`); navigation itself is plan-independent
- [x] `src/components/layout/timezone-sync.tsx` — infrastructure, plan-independent
- [x] `src/components/spoods/` — `about-form.tsx` (`spood.about.edit`), `add-spood-form.tsx` (`spood.create`), `avatar-picker.tsx` (`photo.profile.set`), `care-status-grid.tsx` (`care.status.view`), `life-stage-field.tsx` (`care.premolt.manage`), `maintenance-fields.tsx` (`housekeeping.log`), `memorial-panel.tsx` (`spood.memorialize`, `spood.memorial.restore`), `molt-stage-fields.tsx` (`care.molt.log`), `photo-gallery.tsx` (`photo.gallery.view`), `premolt-toggle.tsx` (`care.premolt.manage`), `prepared-photo-input.tsx` (`photo.upload`), `profile-forms.tsx` (`enclosure.manage`, `housekeeping.log`, `care.body_condition.log`, `photo.upload`), `quick-log.tsx` (`care.feed.log`, `care.hydrate.log`, `care.observe.log`, `care.play.log`), `species-fields.tsx` (`spood.create`, `spood.about.edit`), `spood-accordion.tsx`, `spood-card.tsx`, `spood-image.tsx`, `spood-search.tsx` (`spood.list.view`, `spood.about.view`)
- [x] `src/components/constellation/` — `care-review.tsx`, `celebrations.tsx` (`journey.check_in`), `recent-care-meter.tsx`, `streak-card.tsx` (`journey.streaks.view`), `reward-art.tsx`, `reward-gallery.tsx` (`journey.badges.view`)

**Result:** coverage closes. Every enumerated file maps to at least one feature key or is explicitly listed as plan-independent (auth, landing, legal, feedback, platform status/maintenance, admin tooling, billing infrastructure).
