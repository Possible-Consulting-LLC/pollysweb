# Feature Gating Design — Three-State Gate, Decorator Wiring, Admin Telemetry Toggle

**Date:** 2026-10-02
**Status:** Approved design (brainstorming complete; awaiting spec review)
**Owner decisions recorded:** three-state gate (entitled / upsell / coming-soon); dual-surface gating (page destinations + inline component); server-action decorator for defense-in-depth; telemetry via a togglable sink whose destination is toggled in the admin screen (PostHog deferred post-acquisition); rollout ramps one feature → all 34 with tests per variation; grandfathering requires zero additional work (legacy bridge); platform stays Vercel + Supabase for release (OVH is a post-acquisition VITAL slice); release behavior: gated writes redirect, gated reads hide, upsell page advertises.

## Summary

Feature gating makes the plan system enforce (and advertise) what each plan can do. Today the data model and admin plumbing are complete — a 34-key typed feature registry (`src/lib/features/registry.ts`, transcribed from the entry-point audit `docs/superpowers/audits/2026-09-26-feature-entry-points.md`), a DB-backed `Feature`/`Plan`/`FeaturePlanTranslation` matrix with an admin catalog, legacy-tier mapping (`LEGACY_PLAN_SPECS`, `mapLegacyTier`, `resolveEffectiveEntitlements`), and partial enforcement helpers (`spider-slots`, `spider-write-policy`). What is missing is runtime enforcement: no generic gate helper exists, and the audited entry points (e.g., `createSpiderAction` never checks `spood.create`; `quickFeed` never checks `care.feed.log`) contain no gate calls.

This slice builds a three-state feature gate and wires it across the audited entry points incrementally: first one plan with one feature gated end-to-end, then features added variation-by-variation with tests at each step, until all 34 are gated. It also adds a togglable telemetry seam — the destination (off / PostHog / future sinks) is toggled in the admin screen.

## Background

- **Registry:** `FEATURE_REGISTRY` in `src/lib/features/registry.ts` — 34 keys across 7 categories (`spoods` 7, `care` 8, `habitat` 3, `photos` 4, `journey` 4, `activity` 3, `settings` 5), each with name/description/category and audited entry points.
- **Release model:** `Feature.active` (global, super-admin released) + `FeaturePlanTranslation` (per-plan enablement) + `Plan.maxSpiders` + `PlanBillingOption`.
- **Users:** `User.plan` ("free" | "pro" legacy field), Stripe fields, `UserSubscription[]` (new plan system: TRIALING/ACTIVE/PAST_DUE/CANCELED/EXPIRED).
- **Legacy bridge (grandfathering):** `LEGACY_PLAN_SPECS` + `mapLegacyTier` + `resolveEffectiveEntitlements()` map legacy tiers to fixed feature-key sets. Grandfathered customers therefore need **zero additional work** — their tier is their feature set.
- **Admin plumbing:** Features catalog page (registry sync, search, release state), feature-matrix validation/apply (`plan-features.ts`), audit records.
- **Gap:** no `assertFeature`/`withFeatureGate` helper exists; the audited entry points contain no gate calls.

## Goals

- One generic three-state gate resolution, one decorator, one inline gate component — wired across all 34 audited entry points.
- Gated writes are impossible to bypass from the client; gated reads hide themselves; upsell and coming-soon states have first-class destinations.
- Telemetry events from the gate flow to a togglable destination controlled from the admin screen.
- Rollout is incremental and testable per variation, ending with all 34 features gated.

## Non-goals

- PostHog (or any concrete telemetry vendor) is not implemented in this slice — the sink seam ships default-off; PostHog wiring is a post-acquisition slice.
- VictoriaMetrics/observability backend, OVH migration, AI-process telemetry — post-acquisition VITAL slices.
- No changes to the plan-billing system, Stripe integration, or the pricing page's existing plan display (beyond linking the upsell page).
- No grandfathering migration — the legacy bridge already resolves legacy tiers.

## Design

### 1. Gate module (`src/lib/features/gate.ts`)

Pure decision logic, env-record-in (house pattern):

```ts
export type FeatureGateState = "entitled" | "upsell" | "coming-soon";

export function resolveFeatureGate(input: {
  feature: { key: string; active: boolean };
  entitled: boolean;           // from resolveEffectiveEntitlements / legacy bridge
}): FeatureGateState {
  if (!input.feature.active) return "coming-soon";
  return input.entitled ? "entitled" : "upsell";
}
```

Plus a user-scoped convenience resolver that loads the `Feature` row and the user's effective entitlements and returns the state (single DB path, deliberately uncached — same pattern as `readMaintenanceState`).

**Two gate dimensions compose.** The feature gate above decides *whether* the feature is usable; a second, **allowance gate** decides *how much* of a quantity-limited feature the plan allows. For features bounded by `Plan.maxSpiders` (e.g., `spood.create`), the entry point composes both: feature gate first (`entitled`), then the existing allowance machinery (`spider-slots` / `spider-write-policy` / `Plan.maxSpiders`) — slots available → proceed; slots exhausted → **upsell (allowance variant)**. Example: Free plan, `maxSpiders: 1` — the 1st spood passes both gates; the 5th hits the allowance upsell. The allowance check is server-side only (slots are countable state, not a boolean).

### 2. Server-action decorator (`withFeatureGate`)

```ts
export function withFeatureGate<T>(featureKey: string, handler: () => Promise<T>): Promise<T>
```

- `entitled` → `handler()` runs.
- `upsell` → redirect to `/features/<key>` (the upsell page).
- `coming-soon` → redirect to `/features/<key>?state=coming-soon`.
- Emits a gate event through the telemetry seam (§5) on every resolution.

### 3. Dual-surface gating

The entry-point audit partitions each feature's entry points into **page destinations** and **inline components**; wiring follows that partition:

- **Page destinations** — the page consults `resolveFeatureGate` at render: `entitled` → destination content; `upsell` → redirect to `/features/<key>`; `coming-soon` → render the coming-soon variant.
- **Inline components** — `<FeatureGate featureKey="..." user={...}>` wraps inline feature UI: `entitled` → children render; `upsell` → inline upsell CTA linking to `/features/<key>` (no redirect — the host page keeps its context); `coming-soon` → inline "Coming soon" placeholder.
- **Server actions behind inline features** — still wrapped in `withFeatureGate` (defense-in-depth: stale UI or crafted requests cannot invoke gated writes).

### 4. Upsell / coming-soon page (`src/app/(marketing)/features/[key]/page.tsx`)

One shared route for all keys, rendered from the `Feature` row: name, description, category — plus plan/pricing context and a pricing CTA. Three variants by resolution: **upsell** (feature is real; user lacks it), **allowance upsell** (feature entitled but the plan's allowance is exhausted — copy emphasizes the used-up quantity, e.g. "You've used all 1 spoods on your plan"), and **coming-soon** (`Feature.active = false`). Unknown keys render a not-found variant.

### 5. Telemetry seam with admin-controlled destination

- The gate emits `GateEvent { feature, outcome: "shown"|"used"|"upsell"|"coming-soon", plan }` through a single sink interface, fire-and-forget (never blocks or fails the gate decision).
- **Destination is an admin-controlled setting**: a new `SiteSettings` field (`featureTelemetrySink`, default `"off"`), toggled in the admin screen through the existing `withAdminControl` pathway (super-admin gated, optimistic concurrency `version`, audit record) — the same pattern as the maintenance/announcement controls. The gate reads it per-request, uncached.
- **Other fields the toggle needs:** the setting selects the *destination*; each destination's *credentials* stay in environment variables (Vercel-managed secrets), never in the database:
  - `off` — no additional fields.
  - `posthog` — requires env `POSTHOG_API_KEY` + `POSTHOG_HOST` to be set; if either is missing, the sink stays inert (behaves as `off`) even while the toggle reads `posthog`.
  - Future sinks follow the same rule: DB field selects, env authenticates.
- `off` (default) = no-op sink. `posthog` = PostHog sink module (not implemented in this slice — the seam ships with the interface and the off sink; a post-acquisition slice adds the PostHog sink module and any privacy-policy updates).

### 6. Grandfathering — plans define features

**The legacy Plan rows (in the database) define what grandfathered customers keep** — that is the whole point of the plan system. The gate reads each user's plan's `FeaturePlanTranslation` rows and `maxSpiders`; the admin **feature matrix** (the existing catalog/matrix UI) is the tool that defines and adjusts what legacy plans include — no feature lists are hardcoded in code. `LEGACY_PLAN_SPECS` in `legacy-entitlements.ts` is documentation (kept and pinned by tests); read-time resolution always uses the database's current rows. Legacy users carry `User.plan` ("free" | "pro") → the mapped legacy Plan → its translations; new plans apply only to new `UserSubscription` rows. Whether grandfathered Free users can create spoods, and how many, is whatever the legacy plan's rows say — adjustable by the admin at any time without a deploy.

### 7. Rollout ramp (test-each-variation)

1. **First use case:** one plan with **one feature** (`spood.create` — the most externally visible) gated end-to-end: page destination, inline gate, decorator — tested in all three states.
2. **Ramp:** add features variation-by-variation (by category: `care` 8, `photos` 4, `journey` 4, `habitat` 3, `activity` 3, `settings` 5, remaining `spoods` 6), testing each variation's three-state matrix, until all 34 are gated.
3. Each variation re-runs the gate test suite; the audit doc is the per-feature checklist.

## Behavior matrix

| Feature state | User entitled | User not entitled |
|---|---|---|
| `active = true` (released) | Feature renders inline / destination page loads | Inline: upsell CTA; page: upsell page; action: redirect to upsell |
| `active = false` (unreleased) | Inline: coming-soon placeholder; page: coming-soon page; action: redirect | same |
| Entitled + allowance exhausted (`Plan.maxSpiders`) | Allowance upsell variant (inline CTA / redirect) | — (not entitled is checked first) |

## Error handling

- The gate never throws: unknown keys, missing rows, and DB failures resolve to `coming-soon` (never an accidental entitlement, never a crash).
- The telemetry sink is fire-and-forget: sink failures are swallowed (logged) and cannot affect the gate decision or the user response.
- `resolveFeatureGate` treats a missing `SiteSettings` telemetry field as `off`.

## Testing

1. `gate` unit tests: the three-state matrix (active×entitled), unknown key, missing row, DB failure → `coming-soon`; legacy-bridge entitlement inputs.
2. Decorator tests: entitled → handler runs; upsell/coming-soon → redirect targets; telemetry emitted per resolution; sink `off` → no-op.
3. Inline component tests: entitled → children; upsell → CTA; coming-soon → placeholder.
4. Admin toggle tests: super-admin changes the sink (versioned, audited); non-admin rejected.
5. Per-variation tests during the ramp: each newly gated feature gets its three-state assertions.
6. Full suite green at every variation; final gates: `npm test`, `npx tsc --noEmit`, `npm run lint`, webpack build.

## Verification

- All 34 audited entry points carry a gate call (checked against the audit doc, feature by feature).
- Grep gate: every `FEATURE_REGISTRY` key appears in at least one gate call site.
- Manual matrix walk for the first feature: entitled / upsell / coming-soon in the deployed preview.
- Full suite + tsc + lint + build green.

## VITAL deferrals (post-acquisition slices)

- VictoriaMetrics stack (metrics/logs/traces backend on the owner-designated host) + first traced flow (Trace-Driven Development).
- PostHog sink module + privacy-policy update.
- OVH + self-hosted PostgreSQL migration.
- AI-observed telemetry (dev-agent process metrics).