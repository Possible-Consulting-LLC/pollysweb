# Spoodly Space Plan Creator and Feature Gating Design

**Status:** Approved direction, saved for implementation planning.
**Supersedes:** `2026-09-25-pricing-plans-design.md` and the earlier four-plan proposal.
**Scope:** Data model, super-admin plan creator, runtime feature gating, public pricing, downgrade behavior, trials, and feature-engagement analytics. This document does not implement or deploy the system.

## Purpose

Spoodly Space needs a plan system that can change without rewriting plan checks throughout the application. A super administrator must be able to build plans, decide which plans are public, configure billing options, and toggle every individual application feature for each plan.

Features remain discoverable to every user. A gate determines which of three experiences to show:

1. **Available:** render or open the actual feature.
2. **Upgrade:** the feature has been released, but the user's plan does not include it.
3. **Coming soon:** the feature has not been released for anyone.

The same gate must protect browser pages, direct URLs, server actions, API routes, uploads, and background operations. Hiding a control is never sufficient authorization.

The design also records which features users see, try, open, and attempt to upgrade for so future plan decisions can be based on actual demand.

## Final public plan direction

The initial public catalog contains three plans:

| Plan | Monthly | Annual | Active spoods | Initial positioning |
| --- | ---: | ---: | ---: | --- |
| Free | $0 | $0 | 1 | Essential care |
| Basic | $1.99 | $19.99 | 5 | Configurable limited feature set |
| Pro | $4.99 | $49.99 | Unlimited | Full released feature set |

There is no Unlimited plan. Unlimited spood capacity is part of Pro.

Annual prices are explicit catalog prices, not computed discounts. The displayed annual values equal approximately two months free.

The exact Basic feature set is intentionally not hard-coded in this specification. It will be chosen and changed through the plan creator. Pro initially enables every released customer feature. Free initially enables only the essential set below.

### Initial Free access

Free includes:

- creation and maintenance of one active spood;
- the About section and its profile fields;
- the five supplied default portraits;
- Feed tracking;
- Hydrate tracking;
- completed Molt tracking;
- the current essential care status derived from those logs; and
- memorializing a spood, which frees the active slot.

Uploaded photos, including uploaded profile photos, require a paid plan. Other released features can be assigned through the plan creator rather than through source-level plan checks.

## Core principles

### Features are granular

Each independently valuable capability receives a stable feature key. Broad labels such as "advanced care" are not authorization boundaries. Examples include:

- `spood.create`
- `spood.about.view`
- `care.feed.log`
- `care.hydrate.log`
- `care.molt.log`
- `care.observe.log`
- `care.play.log`
- `care.body_condition.log`
- `care.premolt.manage`
- `enclosure.view`
- `enclosure.manage`
- `housekeeping.log`
- `photo.upload`
- `photo.gallery.view`
- `universe.view`
- `activity.full_history.view`
- `activity.edit`
- `journey.check_in`
- `journey.streaks.view`
- `journey.badges.view`
- `settings.theme.customize`

The final registry should be produced by auditing all routes, actions, navigation entry points, inline panels, uploads, and background jobs before enforcement is enabled.

### Features are registered in code

Application code owns the stable feature registry. Adding a feature means:

1. adding a unique key and metadata to the typed registry;
2. protecting its server entry points with the shared guard;
3. wrapping its visible entry points or inline content with the shared UI gate;
4. adding its engagement placements; and
5. running the registry synchronization step so it appears in the super-admin plan creator.

The admin interface configures registered features but does not invent keys that the deployed application cannot recognize. Newly registered features default to globally inactive and disabled for every plan. This produces a safe **Coming soon** state until a super administrator releases and assigns the feature.

### Plans are data, not conditionals

Product code must not ask whether a user is "Free," "Basic," or "Pro." It asks whether the resolved subscription includes a particular feature. Spood-count enforcement separately reads the resolved plan's `maxSpiders`.

This allows standard public plans, private custom plans, support gifts, internal plans, and future breeder or maker plans to use the same runtime logic.

### Custom plans provide individual access

There are no per-user entitlement override rows. To gift one feature or a set of features to a person, a super administrator creates or reuses a non-public custom plan and assigns that plan through the user's subscription. This follows the supplied ERD and keeps effective access explainable.

## Data model

The supplied “User-Centric Feature Gating with Plan Limits” ERD is the authoritative relationship model. Prisma names should follow repository conventions, while database mappings may preserve snake_case names. Existing user and Stripe fields remain during migration until all callers use the new resolver.

### Plan

- `id`
- `name`
- `description`
- `planType`: `STANDARD | CUSTOM | INTERNAL`
- `maxSpiders`: nullable integer; null means unlimited
- `active`
- `public`: whether the plan appears on public pricing and may be selected through public purchase flows
- `sortOrder`
- timestamps

`public` is required by the approved plan-creator behavior even though it was not drawn in the supplied ERD. A plan may be active without being public, which supports custom and internal assignments.

### PlanBillingOption

- `id`
- `planId`
- `interval`: initially `MONTHLY | ANNUAL`
- `basePriceCents`
- `active`
- `sortOrder`
- timestamps

Billing options belong to exactly one plan. Public checkout must validate that the selected option is active and belongs to the selected public plan.

### Feature

- `id`
- `key`: unique, stable code identifier
- `name`
- `description`
- `category`
- `active`
- timestamps

`active = false` means **Coming soon** globally. `active = true` means the feature is released and plan translations determine access.

### FeaturePlanTranslation

- `id`
- `planId`
- `featureId`
- `enabled`
- timestamps

The pair `(planId, featureId)` is unique. Missing translations resolve as disabled. Disabling or deleting a feature does not delete translations, which allows safe restoration.

### UserSubscription

- `id`
- `userId`
- `planId`
- `planBillingOptionId`
- `discountId`: nullable
- `status`: initially `TRIALING | ACTIVE | PAST_DUE | CANCELED | EXPIRED`
- `startedAt`
- `renewsAt`: nullable
- `expiresAt`: nullable
- timestamps

Constraints must ensure the billing option belongs to the selected plan. Resolution rules must guarantee one effective subscription at a time. Free access may be represented by an active Free subscription with a zero-dollar billing option so every account follows the same path.

### Discounts

Implement the ERD's `Discount`, `DiscountBillingOption`, and `DiscountRedemption` entities as drawn:

- discounts may be percentage or fixed;
- a discount applies only to explicitly linked billing options;
- validity windows, global redemption caps, and per-user caps are enforced server-side;
- redemptions record the user, subscription, amount discounted, and redemption time; and
- prior redemption records remain immutable for audit and financial reconciliation.

### FeatureEngagementEvent

Add an append-oriented analytics entity:

- `id`
- `featureId`
- `userId`: nullable for anonymous public experiences
- `planId`: nullable snapshot of the resolved plan
- `subscriptionId`: nullable
- `eventType`
- `accessState`: `AVAILABLE | UPGRADE | COMING_SOON`
- `placement`: stable identifier for the control or inline location
- `path`
- `sessionId`: privacy-safe session identifier
- `metadata`: constrained JSON for approved contextual fields
- `occurredAt`

Initial event types:

- `FEATURE_IMPRESSION`
- `FEATURE_CLICK`
- `FEATURE_OPEN`
- `GATE_SHOWN`
- `UPGRADE_CLICK`
- `COMING_SOON_SHOWN`

An inline impression counts only when at least 50% of the tracked feature is visible for at least one continuous second. The client deduplicates impressions by feature, placement, access state, and page view. The server treats analytics as untrusted input, validates feature and event values, rate-limits ingestion, and never uses analytics events for authorization.

## Feature access resolver

All callers use one server-authoritative resolver:

```ts
resolveFeatureAccess({
  user,
  featureKey,
}): {
  state: "available" | "upgrade" | "coming_soon";
  feature: FeatureDescriptor;
  plan: ResolvedPlan | null;
  eligiblePublicPlans: PlanSummary[];
}
```

Resolution order:

1. Reject an unknown feature key as a developer/configuration error and fail closed.
2. Load the registered feature record.
3. If the feature is globally inactive, return `coming_soon`.
4. Resolve the user's effective subscription and plan.
5. If that plan has an enabled translation, return `available`.
6. Otherwise return `upgrade`, along with currently public plans that enable the feature.

The resolver must define deterministic behavior for trialing, active, past-due, canceled, and expired subscriptions. Those status rules belong in this shared layer rather than individual pages.

### Server guard

A reusable guard builds on the resolver:

```ts
requireFeature(user, featureKey)
```

It is required before protected page data is returned or any protected mutation runs. Route handlers and server actions return a typed result that distinguishes upgrade from coming soon. Direct navigation cannot bypass the guard.

Spood creation additionally checks `maxSpiders` against the account's count of active, non-memorial spoods within the same transaction or equivalent serialized boundary.

### UI gate

A reusable UI component/hook consumes the resolved state and renders:

- the real control or content for `available`;
- an upgrade control, page, modal, or inline “Upgrade to view {feature}” message for `upgrade`; or
- a non-purchasing Coming Soon treatment for `coming_soon`.

Every feature remains visible or discoverable. For example, **Add Spood** appears for every user. Clicking it opens the Add Spood experience when permitted and an upgrade experience when the feature or capacity is unavailable. Inline features remain in their normal page position and render a contextual gate instead of disappearing.

The client gate improves the experience; the server guard provides enforcement.

## Super-admin plan creator

All plan-management routes and mutations require the existing `super_admin` role and must write to the existing administrative audit trail.

### Plan list

The plan list shows:

- name and description;
- type;
- active/public state;
- active-spood allowance;
- billing options;
- number of enabled features;
- number of current subscriptions; and
- last update information.

It supports creating a plan, duplicating a plan as a starting point, editing, reordering, activating/deactivating, and controlling public visibility. Plans with subscription or redemption history are deactivated rather than hard-deleted.

### Plan editor

The editor includes:

- identity and description;
- plan type;
- active and public controls;
- nullable maximum active spoods;
- monthly/annual or future billing options;
- a searchable feature matrix grouped by category;
- explicit enabled/disabled state for every registered feature; and
- a preview of how public pricing will summarize the configured plan.

Saving uses a transaction and records an audit event with before/after values. The editor warns when a change removes access from current subscribers but does not silently modify or delete their data.

### Feature catalog

The catalog shows every code-registered feature, its key, category, description, release state, plan assignments, and engagement summaries. Super administrators may edit presentation metadata and toggle global release state. Stable keys cannot be renamed through the UI.

If registry synchronization discovers a new code feature, it appears inactive and unassigned. If a database feature no longer exists in code, the admin UI marks it orphaned and prevents new assignments until the code/configuration mismatch is resolved.

### Subscription assignment

Super administrators can assign an active standard, custom, or internal plan to a user. The workflow validates compatible billing options, captures an audit reason, and makes the effective date explicit. Custom/internal plans never appear publicly unless a super administrator deliberately changes their type and public state.

## Public pricing

The Pricing page reads active, public, standard plans and active billing options from the catalog. It must not hard-code a fixed count or named plan set.

For the initial catalog it presents Free, Basic, and Pro in configured order, with monthly and annual prices and feature comparisons generated from plan translations. Inactive global features may appear as Coming Soon only when intentionally included in public marketing copy; they are never represented as currently included paid value.

The page remains accessible, responsive, keyboard operable, and compatible with both themes. Plan differences use text in addition to color or icons.

### Open product decision

The exact upgrade destination remains unresolved. The recommended behavior is to open the full Pricing page with the blocked feature highlighted and identify every public plan that currently enables it. This avoids hard-coded upgrade targets as plan configurations change.

## Trials

An account may receive one no-card, three-day trial of an eligible paid public plan. A trial:

- does not automatically charge or convert;
- records the selected plan and exact start/expiry time;
- restores the prior plan when it expires;
- cannot be restarted by switching paid plan choices; and
- uses the same feature resolver as paid subscriptions.

Trial eligibility and prior-plan restoration require durable fields or records in the implementation plan. The admin plan creator should be able to mark which public plans are trial eligible without embedding plan names in code.

## Downgrades, hidden content, and memorials

Downgrading never deletes customer content.

- Paid history and uploaded photos remain stored when access is lost.
- Free users cannot view retained paid history or photos until access returns.
- When moving to a lower spood allowance, the newest active spoods remain visible up to the destination plan's allowance.
- Other active spoods remain stored but hidden.
- “Newest” uses the canonical creation timestamp with a deterministic identifier tie-breaker.
- Memorialized spoods do not consume an active slot.
- Memorializing a visible spood frees a slot.
- Restoring a memorial is blocked or gated when it would exceed the resolved plan's allowance.

Plan changes, webhook updates, trial expiry, memorialization, and restoration must serialize allowance decisions so concurrent operations cannot expose an inconsistent number of active spoods.

## Analytics and admin reporting

The first reporting view should answer:

- which features receive the most meaningful impressions;
- which available features are clicked and opened most;
- which unavailable features generate the most attempts;
- which features produce the most upgrade clicks;
- how engagement differs by plan and access state; and
- where Coming Soon interest is strongest.

Reports must distinguish raw impressions from clicks and successful opens. They should show conversion ratios, not only totals, and exclude known test/demo traffic when possible. Access checks must not depend on analytics availability; analytics failure cannot block feature use.

Retention, export, and deletion behavior must align with the application's privacy policy before production collection begins.

## Implementation method: vertical-slice TDD

Implementation must use test-driven development organized as thin vertical slices. Each slice starts with a failing test for an observable behavior, adds the minimum schema, server, UI, and analytics work needed to make that behavior pass, and ends with a working flow that can be demonstrated in the browser.

Slices must produce user or administrator value independently. Avoid horizontal phases that build the entire database layer, then the entire service layer, then the entire interface before anything can be exercised end to end. Shared infrastructure should be introduced only when the current slice needs it and then expanded by later slices.

Each slice must:

1. name the user or super-admin behavior it delivers;
2. begin with focused failing tests at the lowest useful boundary plus an end-to-end or browser-level acceptance check where the behavior crosses the UI;
3. implement the complete path through persistence, authorization, server behavior, UI state, and analytics that the slice requires;
4. preserve existing behavior outside the slice;
5. finish with passing focused tests and relevant repository checks; and
6. leave a demonstrable result that can be reviewed before the next slice begins.

Recommended early slices are:

1. resolve one code-registered feature into Available, Upgrade, or Coming Soon for a seeded plan;
2. gate one visible entry point and its direct server route while recording engagement events;
3. let a super administrator change that feature's plan assignment and immediately observe the gated result;
4. create and publish one plan through the plan creator and render it on Pricing; and
5. enforce one active-spood limit through both the visible Add Spood flow and its server mutation.

Later slices expand the same proven path across the remaining feature inventory, billing states, trials, discounts, downgrades, and migration. A slice is not complete when only its mocks or internal services work; its promised behavior must be reviewable through the real application surface.

## Migration strategy

Implementation should proceed in controlled stages:

1. Add the catalog, plan, subscription, discount, and analytics schema without changing current entitlements.
2. Seed Free, Basic, and Pro plus billing options, then synchronize the full code feature registry.
3. Build and test the resolver, server guard, UI gate, and analytics ingestion behind an internal rollout flag.
4. Build the super-admin plan creator and audit every mutation.
5. Map existing Free/Pro, demo-plan, and manually granted access into the new subscriptions without removing legacy fields.
6. Convert product surfaces feature by feature, keeping every entry point visible and protecting all server paths.
7. Switch public Pricing and upgrade experiences to catalog data.
8. Validate Stripe checkout, webhooks, billing recovery, trials, downgrades, and reconciliation.
9. Remove legacy binary plan checks and columns only after production reconciliation proves the new resolver is authoritative.

The implementation plan must inventory every existing plan check before cutover. Partial migration must fail closed rather than grant access because a surface was missed.

## Verification

Required automated coverage includes:

- resolver results for available, upgrade, and coming-soon states;
- inactive features resolving to Coming Soon regardless of plan;
- plan translation changes taking effect without code changes;
- unknown feature keys failing closed;
- direct URL, action, API, and upload enforcement;
- count limits, unlimited plans, memorial slot behavior, and concurrency;
- downgrade hiding with data preservation and deterministic spood selection;
- custom-plan assignment without per-user overrides;
- super-admin authorization and audit records;
- public-plan filtering and dynamic pricing output;
- billing-option ownership and discount constraints;
- one-time, no-card trial expiry and restoration;
- engagement event validation and impression deduplication; and
- graceful behavior when analytics ingestion fails.

Browser verification must cover mobile and desktop, light and dark themes, keyboard use, available controls, click-through upgrade gates, inline upgrade banners, Coming Soon states, and direct navigation attempts.

## Acceptance criteria

1. Super administrators can create, duplicate, edit, activate, order, and privately or publicly expose plans.
2. Super administrators can configure billing options, maximum active spoods, and every registered feature per plan.
3. Features are defined by stable code keys and safely synchronized into the plan creator.
4. Every registered feature resolves to exactly one of Available, Upgrade, or Coming Soon.
5. All feature entry points remain discoverable to every user.
6. Server-side guards prevent UI, URL, API, action, upload, and background-job bypasses.
7. Custom plans provide individual or special access without per-user entitlement overrides.
8. The initial public catalog contains only Free, Basic, and Pro with the approved prices and capacities.
9. Downgrades preserve data while hiding inaccessible content and excess active spoods.
10. Memorialized spoods do not consume plan capacity.
11. Feature impressions, clicks, opens, gates, and upgrade interest are recorded with plan and access-state context.
12. Inline impressions require at least 50% visibility for one continuous second.
13. Existing billing and entitlement behavior remains operational until a reconciled migration explicitly replaces it.
14. Implementation proceeds through test-first vertical slices that each produce a working, demonstrable user or super-admin behavior.

## OpenCode handoff

Before implementation, convert this design into a repository-specific implementation plan using the Superpowers writing-plans workflow. Organize that plan as test-first vertical slices with a demonstrable acceptance outcome for every slice. The plan should begin with a code audit of current plan checks, Stripe integration, admin authorization/auditing, Prisma conventions, and all feature entry points. Do not implement from the old four-tier pricing document; it has been superseded by this file.
