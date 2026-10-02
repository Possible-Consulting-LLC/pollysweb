# Feature Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A three-state feature gate (entitled / upsell / coming-soon) wired across all 34 audited entry points, with an admin-togglable telemetry sink, ramped one feature → all 34 with tests per variation.

**Architecture:** A pure resolver + DB-backed user resolver decide the gate state from `Feature.active`, the plan's `FeaturePlanTranslation` rows (read-time truth — the legacy plan defines what grandfathered users keep), and the legacy bridge. Server actions are wrapped by a `withFeatureGate` decorator **outside** the existing `withMutation` boundary (redirects must not be swallowed by its try/catch); inline features gate through a `<FeatureGate>` component; page destinations gate at render. Gate events flow through a togglable, fire-and-forget telemetry seam (default off) whose destination is an admin-controlled `SiteSettings` field.

**Tech Stack:** Next.js server actions (`next/navigation` `redirect`), Prisma (one migration), node:test + `tsx --test`, PostHog deferred (no SDK installed).

**Spec:** `docs/superpowers/specs/2026-10-02-feature-gating-design.md`

## Global Constraints

- The gate never throws: unknown keys, missing rows, DB failures → `coming-soon`. Never an accidental entitlement.
- Telemetry seam is fire-and-forget: sink failures are swallowed (logged) and cannot affect the gate decision or response. Default sink = `off`.
- Sink credentials stay in env (`POSTHOG_API_KEY`, `POSTHOG_HOST` for the future posthog sink); missing creds = sink inert even while toggled. Never store sink credentials in the database.
- Read-time feature resolution always uses the database's current `FeaturePlanTranslation` rows — `LEGACY_PLAN_SPECS` stays documentation (pinned by its tests, unchanged).
- The allowance gate composes server-side only, after the feature gate (feature gate first, then slots).
- `LEGACY_PLAN_SPECS` and `FREE_SPIDER_LIMIT = 1` are unchanged by this plan.
- No new npm dependencies in this slice (PostHog SDK is not installed).
- Test commands: full suite `npm test`; single file `npx tsx --test <file>`.
- Commits: conventional prefix, lowercase. No pushes to any remote except the owner-ordered pollysweb branch pushes already directed.

## Review Focus

1. **Unauthenticated session hitting a gated action** (e.g., stale tab, crafted POST): must resolve to upsell redirect — never a 500, never entitled. Pinned in Task 3.
2. **Unknown/typo feature key** at any surface: `coming-soon` variant, never an entitlement, never a throw. Pinned in Tasks 1–2.
3. **DB failure during gate resolution** (Supabase hiccup): gate resolves `coming-soon` and the response still succeeds — a telemetry-sink failure must never surface to the user. Pinned in Tasks 2–3.
4. **Composition order on `spood.create`**: feature gate (entitled) BEFORE the allowance/slot check — a not-entitled user sees the feature upsell, an entitled-but-full user sees the allowance upsell; never the wrong variant. Pinned in Task 7.
5. **Mid-session matrix change**: an admin saving the feature matrix (like the 2-of-2 Free–Legacy screen) must be reflected at the NEXT gate check — resolution reads are uncached. Pinned in Task 2.

---

### Task 1: Schema migration + pure gate resolver

**Files:**
- Modify: `prisma/schema.prisma` (SiteSettings model — add `featureTelemetrySink String @default("off")` after `announcement`)
- Create: `prisma/migrations/<timestamp>_feature_telemetry_sink/migration.sql` (via `npx prisma migrate dev --name feature_telemetry_sink --create-only`, then write the SQL: `ALTER TABLE "SiteSettings" ADD COLUMN "featureTelemetrySink" TEXT NOT NULL DEFAULT 'off';`)
- Create: `src/lib/features/gate.ts`
- Test: `src/lib/features/gate.test.ts`

**Interfaces:**
- Produces:
  - `export type FeatureGateState = "entitled" | "upsell" | "coming-soon";`
  - `export function resolveFeatureGate(input: { active: boolean; entitled: boolean }): FeatureGateState` — pure.
- Later tasks rely on exactly these names.

- [ ] **Step 1: Write the failing test** — house style (`node:assert/strict`, `node:test` `it`):

```ts
import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveFeatureGate } from "./gate";

it("released + entitled → entitled", () =>
  assert.equal(resolveFeatureGate({ active: true, entitled: true }), "entitled"));
it("released + not entitled → upsell", () =>
  assert.equal(resolveFeatureGate({ active: true, entitled: false }), "upsell"));
it("unreleased → coming-soon regardless of entitlement", () => {
  assert.equal(resolveFeatureGate({ active: false, entitled: true }), "coming-soon");
  assert.equal(resolveFeatureGate({ active: false, entitled: false }), "coming-soon");
});
```

- [ ] **Step 2: Run to verify it fails** — `npx tsx --test src/lib/features/gate.test.ts` — FAIL: cannot find module `./gate`.

- [ ] **Step 3: Implement the pure resolver** — the body is the three-state rule from the spec §1 (unreleased wins over entitlement).

- [ ] **Step 4: Run to verify it passes** — same command, PASS (3 tests).

- [ ] **Step 5: Migration** — run `npx prisma migrate dev --name feature_telemetry_sink --create-only`, edit the generated migration.sql to exactly `ALTER TABLE "SiteSettings" ADD COLUMN "featureTelemetrySink" TEXT NOT NULL DEFAULT 'off';`, then `npx prisma migrate dev` to apply, and `npx prisma generate` if the client didn't regenerate. Verify with `grep -n featureTelemetrySink prisma/schema.prisma` (present).

- [ ] **Step 6: Commit**

```bash
git add prisma src/lib/features/gate.ts src/lib/features/gate.test.ts
git commit -m "feat: feature gate resolver + site settings telemetry sink field"
```

---

### Task 2: DB-backed user resolver + telemetry seam

**Files:**
- Modify: `src/lib/features/gate.ts` (append the DB resolver + event seam)
- Modify: `prisma/schema.prisma` — no change (SiteSettings field exists from Task 1)
- Test: `src/lib/features/gate.test.ts` (append)

**Interfaces:**
- Consumes: `resolveFeatureGate` (Task 1); `resolveEffectiveEntitlements(user, legacyPlans, now)` + `loadLegacyPlanSource(db)` from `@/lib/admin/legacy-entitlements`; `prisma` from `@/lib/db`; the `SiteSettings` field `featureTelemetrySink` (Task 1 migration).
- Produces:
  - `export async function resolveUserFeatureGate(db: Pick<Prisma.TransactionClient, "feature" | "user" | "plan" | "siteSettings">, userId: string, featureKey: string): Promise<FeatureGateState>` — loads the Feature row (by key) and the user's entitlements; unknown key / missing row / any DB error → `"coming-soon"`; reads `siteSettings` `featureTelemetrySink` per call (uncached).
  - `export type GateEvent = { feature: string; outcome: "shown" | "used" | "upsell" | "coming-soon"; plan: string | null };`
  - `export async function emitGateEvent(db: <same pick>, event: GateEvent): Promise<void>` — reads `featureTelemetrySink`; `"off"` or unknown → return without side effects; sink failures are swallowed (logged via `console.error("gate-telemetry", error)`).
  - `export function resolveTelemetrySinkFromRow(sink: string | null | undefined): "off" | "posthog"` — `"posthog"` only when the row says exactly `"posthog"`; anything else (including null/missing) → `"off"`.

- [ ] **Step 1: Write the failing tests (append)** — three-state DB resolution with stubbed `db` (plain objects exercising `findUnique`), each case asserting `resolveUserFeatureGate`:
  - released feature + entitled user → `"entitled"`
  - released feature + plan translations excluding the key → `"upsell"`
  - unknown featureKey → `"coming-soon"` (no throw)
  - `db` that throws → `"coming-soon"` (no throw)
  - `emitGateEvent` with sink `"off"` → returns without calling anything; sink row missing → same; `emitGateEvent` with a throwing sink transport → swallows (no throw)
  - `resolveTelemetrySinkFromRow`: `"posthog"` → `"posthog"`; `"off"`, `null`, `undefined`, `"garbage"` → `"off"`

- [ ] **Step 2: Run to verify it fails** — `npx tsx --test src/lib/features/gate.test.ts` — FAIL: `resolveUserFeatureGate` not exported.

- [ ] **Step 3: Implement** — `resolveUserFeatureGate`: `prisma.feature.findUnique({ where: { key: featureKey } })` (missing → `"coming-soon"`); load the user's subscriptions → plan → `featureTranslations.feature` plus the legacy fallback via `loadLegacyPlanSource(db)` + `resolveEffectiveEntitlements`; `entitled = featureKeys.includes(featureKey)`; compose via `resolveFeatureGate`; wrap the whole body in try/catch → `"coming-soon"`. `emitGateEvent`: read `siteSettings.findUnique({ where: { id: 1 } })`, select `featureTelemetrySink`; `resolveTelemetrySinkFromRow` → `"off"` → return; `"posthog"` → this slice's sink is the no-op (log nothing) — the seam call is fire-and-forget inside try/catch.

- [ ] **Step 4: Run to verify it passes** — same command, PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/gate.ts src/lib/features/gate.test.ts
git commit -m "feat: db-backed feature gate resolution + togglable telemetry seam"
```

---

### Task 3: `withFeatureGate` server-action decorator

**Files:**
- Modify: `src/lib/features/gate.ts` (append)
- Test: `src/lib/features/gate.test.ts` (append)

**Interfaces:**
- Consumes: `resolveUserFeatureGate`, `emitGateEvent` (Task 2); `redirect` from `next/navigation`.
- Produces: `export async function withFeatureGate<T>(featureKey: string, work: () => Promise<T>): Promise<T>` — resolves the signed-in user internally (same session helper the actions use, `getActionUser` from `@/app/actions/auth` — import path exactly as `src/app/actions/auth.ts` uses it); resolves the gate; `entitled` → `work()`; `upsell` → `redirect("/features/<key>")`; `coming-soon` → `redirect("/features/<key>?state=coming-soon")`. Emits `{feature, outcome: "used"|"upsell"|"coming-soon", plan}` per resolution. **Must wrap OUTSIDE `withMutation`** (callers nest `withFeatureGate(key, () => withMutation(...))`) so its `redirect` is never swallowed by the mutation boundary's try/catch.

- [ ] **Step 1: Write the failing tests (append)** — stub `resolveUserFeatureGate` + `emitGateEvent` + the session helper via dependency injection: extract the internals as testable parameters (e.g., an options bag `{ db, redirectFn }` with production defaults) so the test drives all three states: entitled → handler result returned; upsell → the injected redirectFn receives `/features/k`; coming-soon → `/features/k?state=coming-soon`; handler NOT called when gated; unauthenticated session (`userId: null`) → upsell redirect, handler NOT called; sink failure does not throw.

- [ ] **Step 2: Run to verify it fails** — FAIL: `withFeatureGate` not exported.

- [ ] **Step 3: Implement** — thin composition of Task 2 + `redirect`; production signature omits the injection options.

- [ ] **Step 4: Run to verify it passes** — PASS (all gate tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/gate.ts src/lib/features/gate.test.ts
git commit -m "feat: withFeatureGate server-action decorator"
```

---

### Task 4: `<FeatureGate>` inline component

**Files:**
- Create: `src/components/features/feature-gate.tsx`
- Test: `src/components/features/feature-gate.test.ts`

**Interfaces:**
- Consumes: `resolveFeatureGate` (pure, Task 1) — the component receives resolved state as props (no DB in the component; the host page resolves and passes state — keeps the component testable).
- Produces: `export function FeatureGate({ state, featureKey, name, children }: { state: FeatureGateState; featureKey: string; name: string; children: ReactNode }): ReactNode` — `"entitled"` → children; `"upsell"` → inline CTA (link to `/features/<key>`, copy: `<name> is part of a richer plan — see details`); `"coming-soon"` → inline placeholder (`<name> — coming soon`).

- [ ] **Step 1: Write the failing test** — render the three states; assert children only render when entitled; assert the upsell CTA links to `/features/spood.create` with the feature name; assert the coming-soon placeholder shows `— coming soon`.
- [ ] **Step 2: Run to verify it fails** — FAIL: module not found.
- [ ] **Step 3: Implement** the component (server-compatible, no hooks).
- [ ] **Step 4: Run to verify it passes** — PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/features/feature-gate.tsx src/components/features/feature-gate.test.ts
git commit -m "feat: inline FeatureGate component"
```

---

### Task 5: `/features/[key]` upsell / coming-soon page

**Files:**
- Create: `src/app/(marketing)/features/[key]/page.tsx`
- Test: `src/app/(marketing)/features/[key]/page.test.ts`

**Interfaces:**
- Consumes: `prisma.feature.findUnique` (Feature row: name/description/category/active); the user's `resolveUserFeatureGate` result is NOT needed here — the page renders by feature state and (if signed in) entitlement.
- Produces: the page renders three variants — **upsell** (feature `active`, viewer not entitled: name/description + pricing CTA linking `/pricing`), **coming-soon** (`active = false`: name + "Coming soon" copy), **not-found** (unknown key → `notFound()`).

- [ ] **Step 1: Write the failing test** — for a fixture feature: active + not-entitled → upsell copy + pricing link; inactive → coming-soon copy; unknown key → notFound. Stub the DB path per the existing page-test pattern in this repo (see any `src/app` page test).
- [ ] **Step 2: Run to verify it fails** — FAIL: route missing.
- [ ] **Step 3: Implement** the page (server component, `export const dynamic = "force-dynamic"`).
- [ ] **Step 4: Run to verify it passes** — PASS.
- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/features"
git commit -m "feat: shared feature upsell / coming-soon page"
```

---

### Task 6: Admin telemetry toggle

**Files:**
- Modify: the admin settings surface that edits `SiteSettings` (the maintenance page's settings card — `src/app/admin/maintenance/page.tsx` + its actions file)
- Test: `src/lib/admin/feature-telemetry-setting.test.ts` (new)

**Interfaces:**
- Consumes: the existing `withAdminControl` change pathway (`maintenance-state.ts` `change()` pattern — version + `updatedBy` + audit) extended to the new field.
- Produces: a server action `setFeatureTelemetrySink(sink: "off" | "posthog")` (super-admin only, versioned `siteSettings.updateMany({ where: { id: 1, version } })`, audit `action: "feature_telemetry_sink"`), and a small form control on the admin settings card.

- [ ] **Step 1: Write the failing test** — super-admin sets `"posthog"` (row updated, `version` incremented, audit appended); non-admin → rejected; invalid value → rejected.
- [ ] **Step 2: Run to verify it fails** — FAIL: action missing.
- [ ] **Step 3: Implement** the action (extend the existing `change` pathway — do NOT bypass version/audit) + the form control on the admin settings card.
- [ ] **Step 4: Run to verify it passes** — PASS; then `npm test` full suite green.
- [ ] **Step 5: Commit**

```bash
git add src/app/admin src/lib/admin
git commit -m "feat: admin toggle for the feature telemetry sink"
```

---

### Task 7: Variation 1 — `spood.create` end-to-end

**Files:**
- Modify: `src/app/actions/auth.ts` (`createSpiderAction` — wrap the `withMutation` body's feature-eligibility section)
- Modify: `src/app/(app)/spoods/new/page.tsx` (page-destination gate at render)
- Modify: `src/components/home/hub-scene.tsx` (inline gate on the Add-a-Spood link — audit entry point)
- Test: `src/lib/features/variations/spood-create.test.ts` (new)

**Interfaces:**
- Consumes: `withFeatureGate` (Task 3), `<FeatureGate>` + `resolveFeatureGate` (Tasks 1/4), `resolveUserFeatureGate` (Task 2).
- Produces: the variation-1 wiring pattern every later variation copies.

- [ ] **Step 1: Write the failing test** — the three-state matrix for `spood.create` at the action boundary: entitled user → handler proceeds (create path runs); not-entitled → redirect to `/features/spood.create`; coming-soon → redirect with `?state=coming-soon`; unauthenticated → upsell redirect. Reuse the Task 3 injection approach with the real action wired through `withFeatureGate`.
- [ ] **Step 2: Run to verify it fails** — FAIL: action not yet gated.
- [ ] **Step 3: Wire** — `createSpiderAction`: wrap so the gate resolves BEFORE `withMutation` (gate → redirect never swallowed); the existing `billing.canAddSpider` allowance check stays AFTER the gate (Review Focus #4: not-entitled → feature upsell; entitled-but-full → existing allowance error, unchanged copy). `spoods/new` page: `resolveUserFeatureGate` at render → entitled renders the form, upsell/coming-soon render the `<FeatureGate>` variants (page-destination semantics). `hub-scene.tsx`: inline `<FeatureGate>` on the Add-a-Spood link.
- [ ] **Step 4: Run to verify it passes** — focused test PASS; full `npm test` green.
- [ ] **Step 5: Commit**

```bash
git add src/app/actions/auth.ts "src/app/(app)/spoods/new/page.tsx" src/components/home/hub-scene.tsx src/lib/features/variations/spood-create.test.ts
git commit -m "feat: gate spood.create end-to-end (variation 1)"
```

---

### Tasks 8–12: the ramp — remaining 33 features, by category

Each task is one dispatch: same wiring pattern as Task 7, one category per task, per-feature three-state tests in a per-category test file.

**Files (per task):** the entry points listed for that category in `docs/superpowers/audits/2026-09-26-feature-entry-points.md` (the implementer reads the audit section for their category — it is the per-feature checklist of pages/actions/components) + one test file `src/lib/features/variations/<category>.test.ts`.

**Interfaces (all):** consume `withFeatureGate` / `<FeatureGate>` / `resolveUserFeatureGate` exactly as Task 7; produce no new interfaces.

- [ ] **Task 8: `care` — 8 features** (`care.feed.log` = `quickFeed` + full detail action; the audit lists each). Wire every audited entry point; per-feature three-state tests. Commit: `feat: gate care features (care.*: 8)`.
- [ ] **Task 9: `photos` — 4 + `journey` — 4** (same pattern; two audit sections). Commit: `feat: gate photos and journey features (8)`.
- [ ] **Task 10: `habitat` — 3 + `activity` — 3** (same pattern). Commit: `feat: gate habitat and activity features (6)`.
- [ ] **Task 11: `settings` — 5 + remaining `spoods` — 6** (same pattern). Commit: `feat: gate settings and remaining spood features (11)`.
- [ ] Each task: full `npm test` green before its commit.

---

### Task 12: Final verification gates

**Files:** none (verification + wrap-up)

- [ ] **Step 1:** `npm test && npx tsc --noEmit && npm run lint && npm run build -- --webpack` — all green; suite = baseline + gate tests.
- [ ] **Step 2: Grep gate** — `rg -n 'withFeatureGate\(|<FeatureGate' src/ --type-add 'src:*.{ts,tsx}' -t src` count covers all 34 registry keys: for each `FEATURE_REGISTRY` key, its audited entry points appear in a gate call site (spot-check ≥ 1 per feature; the audit doc is the checklist).
- [ ] **Step 3:** `git status --short` clean of stragglers; report the board to the owner.