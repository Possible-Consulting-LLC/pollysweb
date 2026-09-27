# Creator UX Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One reusable searchable/paginated/selectable list component used across all plan-creator surfaces, reason inputs removed (audit reasons auto-derived), uniform themed buttons, optional descriptions.

**Architecture:** Follow-up slice on the same branch (`codex/plan-creator`), driven by user walkthrough findings against the plan creator. A single shared `SelectionList` component (client, controlled selection state owned by the parent, server-fed pages) replaces four bespoke list UIs. Server-side pagination/search helpers back it.

**Tech Stack:** Next.js 16 App Router server components + client components, existing `ui/button`/card primitives, Prisma.

**Spec:** `docs/superpowers/specs/2026-09-26-plan-creator-feature-gating-design.md` (parent). User walkthrough findings recorded in the SDD ledger and `docs/staging/plan-creator-acceptance.md` (still pending).

## Global Constraints

- Inherited from the parent slice: no product-code changes outside the creator surfaces; no commits/pushes/merges to `main`; staging-only DB; every mutation super_admin-gated via existing helpers and audited via `appendAudit`; TDD (failing test first) per task; full checks per task (`npm test`, `npm run lint`, `npx tsc --noEmit`); no secrets in code/docs/commits.
- **One shared component**: all four surfaces (plans list, features catalog, plan-editor matrix, subscriptions user picker) consume the SAME `SelectionList`. No bespoke pagination/search implementations.
- **Selection semantics**: multi-select persists across page changes (parent-owned state), a selection counter is always visible, and saves submit the complete selection set — never just the visible page.
- **Pagination**: 20 rows/page default, standard prev/next controls.
- **No reason inputs** on any creator form; audit reasons are derived server-side from action context.
- **Descriptions optional** (plan description, feature description): empty is valid and stored as empty.
- **Buttons**: only `src/components/ui/button.tsx` variants/sizes — no bespoke button styling in creator pages.
- User search covers **name or email** (case-insensitive contains) over valid users only (`deletingAt: null`); results paginated.

## Review Focus

1. **Selection lost on page change** — the component is controlled; state lives in the parent. Pinned by Task 1's tests (selection across pages asserted via parent state) and Task 4's matrix test (enabled set unchanged by pagination).
2. **Matrix saves a subset instead of the full enabled set** — save must reconstruct the complete enabled set for ALL registry keys. Pinned by Task 4's test (enable on page 1, paginate, save, assert rows for page-2 keys exist).
3. **User picker exposes invalid users** — deleting/unverified users must not appear. Pinned by Task 5's query test.
4. **Search + pagination interaction** — changing search resets to page 1; total count reflects the filtered query. Pinned by Task 3's listPlans tests.
5. **Derived audit reasons** — every mutation still audits (appendAudit requires non-empty reason); derived strings are stable and descriptive. Pinned by Tasks 2's action tests.

---

### Task 1: Shared `SelectionList` component + pagination helpers

**Files:**
- Create: `src/components/admin/selection-list.tsx`, `src/lib/admin/paginated-list.ts`, `src/lib/admin/paginated-list.test.ts`, `src/components/admin/selection-list.test.ts`
- No modifications to existing files.

**Interfaces:**
- Produces (consumed by Tasks 3–5):

```ts
// src/lib/admin/paginated-list.ts — pure server helpers
export function parseListQuery(searchParams: Record<string, string | string[] | undefined>,
  defaults?: { page?: number; pageSize?: number; search?: string }):
  { page: number; pageSize: number; search: string; offset: number };
export function clampPage(page: number, total: number, pageSize: number): number;
```

```tsx
// src/components/admin/selection-list.tsx — controlled client component
export type SelectionRow = { id: string; title: string; subtitle?: string; group?: string; selected?: boolean; disabled?: boolean };
export function SelectionList({ rows, total, page, pageSize, search, selectedCount,
  onPageChange, onSearchChange, onToggle, onToggleAll?, groups?, emptyLabel? }: {
  rows: SelectionRow[]; total: number; page: number; pageSize: number; search: string;
  selectedCount: number; onPageChange(p: number): void; onSearchChange(s: string): void;
  onToggle(id: string): void; onToggleAll?(ids: string[]): void;
  groups?: string[]; emptyLabel?: string; }): JSX.Element;
```

**Selection review (added after user feedback):** the component additionally accepts `selectedRows?: SelectionRow[]` (the FULL set of selected items — the parent maintains an id→row map as the user toggles) and renders, whenever `selectedRows` is provided and non-empty:
- a collapsible **selected tray** listing every selected item together (title + subtitle, each with a remove × that fires `onToggle(id)`) — visible from any page and under any search, so selections made pages ago are always reviewable in one place
- a **"Selected only"** toggle that switches the list content to the selected set (client-side, since the parent supplies it fully)
Both are optional props — backward compatible; Tasks 3–5 pass `selectedRows` and maintain the map.

**Selection modes (user-ratified):** `SelectionList` supports both usages —
- **Multi/bulk mode** (Plans, Features, matrix): checkboxes + always-visible counter + shared tray + bulk action buttons. This is the component's full capability set.
- **Single mode** (user picker, plan picker): NO select bubbles — click the row to select, the rest fold out of sight, a change affordance unfolds the list again. No tray (a single selection needs visibility, not scaffolding).
The mode is a prop/variant of the SAME component (e.g. `selectionMode: 'multi' | 'single'`), not separate implementations — bulk machinery renders only in multi mode.

- Parent owns selection state (Set/array of ids) — the component never stores it; paging/searching therefore cannot lose it.
- Counter chip always visible (`selectedCount`), search input, prev/next (disabled at bounds), optional group headers when `groups` present.
- All controls from `ui/button` — no bespoke styles.

- [ ] **Step 1: Failing tests** — `paginated-list.test.ts`: parse/clamp edge cases (page 0/negative/over-max, missing params, search trimmed, defaults 1/20). `selection-list.test.ts` (repo's component-test pattern, cf. `spood-accordion.test.ts`): renders rows + counter; toggle fires with id; prev/next fire with page numbers and disable at bounds; search input fires onSearchChange; group headers render when groups present.
- [ ] **Step 2: Run** `npm test -- src/lib/admin/paginated-list.test.ts src/components/admin/selection-list.test.ts` — FAIL.
- [ ] **Step 3: Implement** both files. Pure helpers, controlled component, `ui/button` only.
- [ ] **Step 4: Run tests — PASS.** Full checks once. Commit `feat: add shared selection list component`.

### Task 2: Remove reason inputs; derive audit reasons server-side

**Files:**
- Modify: `src/app/admin/features/actions.ts`, `src/app/admin/plans/actions.ts`, `src/app/admin/subscriptions/actions.ts` (+ their service modules where reason params flow: `src/lib/admin/plans.ts`, `plan-features.ts`, `plan-assignment.ts` as needed)
- Test: update existing action tests asserting reasons.

**Interfaces:**
- No signature changes visible to callers beyond reason param removal from form parsing; services keep `reason` parameters (now fed derived strings by the actions layer).
- Derived reason format (stable, descriptive): e.g. `"Created plan Basic (STANDARD, public)"`, `"Updated billing option MONTHLY for plan Basic"`, `"Assigned plan Pro to user <id> effective <ISO>"`, `"Toggled feature photo.upload release"`, `"Saved feature matrix for plan Basic (34 of 34 enabled)"`.

- [ ] **Step 1: Failing tests** — update action tests: forms WITHOUT reason fields succeed; audit records contain the derived reason strings (exact-match assertions pin the format).
- [ ] **Step 2: Run focused — FAIL.**
- [ ] **Step 3: Implement** — strip reason inputs from every creator form; actions derive reasons from their own context; services unchanged in contract.
- [ ] **Step 4: Focused pass → full checks. Commit** `feat: derive audit reasons server-side, remove reason inputs`.

### Task 3: Plans page rework

**Files:**
- Modify: `src/lib/admin/plans.ts` (`listPlans` gains `{ search, page, pageSize }` → `{ plans: PlanSummary[], total: number }`), `src/app/admin/plans/page.tsx`, related tests.

**Requirements:**
- Server-side search: name contains, case-insensitive. Pagination 20/page. Search change resets page 1. Total reflects the filter.
- **ACCORDION rows (user-approved design, supersedes click-through-to-separate-detail):** clicking a plan expands its detail inline (identity, billing options, usage: enabled features of total, effective subscriptions, last updated) and collapses the others — single-open at a time. Use the repo's `DisclosureCard` primitive (`src/components/ui/disclosure-card.tsx`) if it fits. The expanded panel carries the actions: Duplicate + **Edit plan** (navigates to `/admin/plans/[id]/edit`). Search + pagination remain visible around the accordion.
- **BULK SELECTION + TRAY (user-approved addition):** checkbox per row; selection persists across pages/search; always-visible counter ("N of M selected" when selecting); the shared selected tray (chips with × removal, collapsible) with bulk actions **Activate / Publish / Deactivate / Unpublish** — each an audited mutation per plan (reuse/extract the tray as a shared piece with SelectionList's; NO bulk delete — deletion stays per-plan behind the history guard).
- Uniform `ui/button` controls throughout (create/duplicate/edit).
- `validatePlanInput`: description may be empty (stored as empty string).
- Duplicate/delete/reorder flows keep working on the paginated surface.

- [ ] **Step 1: Failing tests** — listPlans search/pagination (filter matches, total, offset, empty search = all), description-empty validation acceptance, duplicate on filtered list unchanged.
- [ ] **Step 2–4: RED → implement → GREEN → full checks →** commit `feat: searchable paginated plans list`.

### Task 4: Features catalog + plan-editor matrix rework

**Files:**
- Modify: `src/app/admin/features/page.tsx`, `src/components/admin/feature-matrix.tsx`, `src/lib/admin/plan-features.ts` (if query shape changes), related tests.

**Requirements:**
- `/admin/features`: grouped (category) paginated tables via `SelectionList` (groups = categories); release/metadata actions unchanged in behavior.
- Matrix: grouped paginated selectable table, cross-page selection, always-visible counter; **save reconstructs the complete enabled set for all 34 registry keys** (parent state = full enabled set; toggles update it; pagination is purely visual).
- Removal warning, orphan-disabled rows, and pricing preview behavior unchanged.

- [ ] **Step 1: Failing tests** — matrix: enable on page 1, paginate, save → page-2 keys' rows exist with prior state; counter reflects full set; catalog: grouped pagination renders.
- [ ] **Step 2–4: RED → implement → GREEN → full checks →** commit `feat: grouped paginated feature selection in catalog and matrix`.

### Task 5: Subscriptions user picker rework

**Files:**
- Modify: `src/app/admin/subscriptions/page.tsx`, `src/app/admin/subscriptions/actions.ts`, `src/lib/admin/plan-assignment.ts` (add `searchUsers` helper), related tests.

**Requirements:**
- `searchUsers(tx, { search, page, pageSize })`: name OR email contains, case-insensitive, `deletingAt: null`, ordered by name; returns `{ users: { id, name, email }[], total }`.
- **Page structure (user-approved, final)**: the subscriptions page is **list-first** — a searchable, paginated **Current subscriptions** table is the primary content (effective only: user, plan, option, status badge, since/until; per-row actions **Reassign** — opens the wizard with that keeper preselected — and **End** — sets status CANCELED with an expiry, audited; requires a small `endSubscription` service addition following the assignment pattern). A **"＋ Add subscription"** button unfolds the **"Assign a plan" wizard** above the list on demand; Cancel and successful Assign fold it away.
- Wizard (user-approved): Step 1 **User** and Step 2 **Plan** both consume `SelectionList` with `selectionMode: 'single'`: click-to-select, the rest fold away, a change affordance unfolds the list again — NO checkboxes/tray in single mode. A persistent context bar carries the selected user on steps 2–3 (avatar, name, email, change). Step 3: billing options filtered to the chosen plan (click-to-select rows) + effective date (default now) + live summary → assign.
- Assignment validation unchanged.

- [ ] **Step 1: Failing tests** — searchUsers (name match, email match, both-fields match, deleting users excluded, pagination/total), picker step flow.
- [ ] **Step 2–4: RED → implement → GREEN → full checks →** commit `feat: searchable user picker for subscription assignment`.

## Self-Review

Spec coverage: all user walkthrough findings mapped (buttons/theme → Tasks 1/3; reason boxes → Task 2; plans search/pagination/click-through → Task 3; features grouped/paginated/selection counter in both surfaces → Task 4; user search/pagination/select → Task 5; optional descriptions → Task 3). Interfaces consistent: `SelectionList`/`parseListQuery` defined once in Task 1, consumed by 3–5. Matrix full-set save is the highest-risk behavior and is pinned twice (Review Focus 2 + Task 4 Step 1).

---

### Task 6: Playwright integration suite — see the actual UI

**Files:**
- Create: `playwright.config.ts`, `tests/integration/admin-plans.spec.ts`, `tests/integration/admin-features.spec.ts`, `tests/integration/admin-subscriptions.spec.ts`, `tests/integration/fixtures.ts` (auth + test-data lifecycle), `.gitignore` entry for `tests/integration/artifacts/`
- Modify: `package.json` (add `@playwright/test` devDependency + `test:integration` script)

**Requirements:**
- Playwright E2E against the local dev server (`http://localhost:43123`, started by the config's webServer) with the staging DB via `.env.local`.
**PERFORMANCE INVESTIGATION (user-mandated: "the site is very slow — test when you do full integration and find out why"):**
- **Environment attribution first**: measure per-surface timings in three contexts and label them separately — (a) the dev server is NOT valid for timing (`next dev` compiles on demand, and implementers actively editing files cause recompiles — any slowness there is expected noise); (b) a production build locally (`npm run build -- --webpack` then `next start` — the config's webServer should target this for timing runs); (c) the staging deployment (`https://staging.spoodlyspace.com`, functions pinned `pdx1` beside the Oregon DB per the Sep 18 fix).
- **Measurements per surface** (admin creator pages AND representative product pages): TTFB, full page load, number of Prisma queries per render (enable Prisma query logging in the test env), and largest/slowest individual queries. Record in the test report with environment labels.
- **Known suspects to check FIRST** (from this slice's ledger): the subscriptions page's temporary `listPlans` call with `pageSize: 1000` (scaffolding until Task 5 — fetches up to 1000 plans + count aggregation every render); `listPlans`' three count aggregations; any sequential awaits or repeated auth/settings fetches in the new admin pages (the Sep 18 finding class); the accordion's expanded-detail data fetch pattern.
- **Baseline**: compare against `docs/staging/page-load-performance.md` (2026-09-18) — do not regress its fixes (parallel Home reads, cached settings, optimized logo, pdx1 pinning).
- **Deliverable — REPORT ONLY (user directive: "no fix for the assessment — just a report on what you think the bottlenecks are")**: a performance findings section in the Task 6 report attributing each slow measurement to its cause (build mode / query volume / N+1 / network region / cold start / rendering). Diagnosis with evidence and ranked bottleneck judgments — NO fixes, no fix tasks, no silent optimization. The user reads the report and decides separately what deserves attention.
- **RENDERING VERIFICATION (user-mandated, thorough):** the suite must check rendering, not just behavior —
  - **Screenshot baselines** per surface (plans list collapsed + expanded, features catalog collapsed + expanded + orphaned row, matrix, subscriptions steps) × **both themes** (cosmic + midnight, toggled in-app) × **both viewports** (desktop + mobile) × **both engines** (Chromium + WebKit — WebKit is Safari's engine and specifically covers the tray/accordion rendering quirks the user observed in mockups). Use `expect(...).toHaveScreenshot()` with per-engine snapshots; first run generates baselines for human approval, subsequent runs fail on visual drift.
  - **Layout assertions**: every interactive element visible and enabled where expected; no horizontal overflow (document scrollWidth ≤ clientWidth); tray renders when selections exist and persists across pagination; accordion expands exactly one row with detail cards visible; counter text matches selection state.
  - **Scroll-persistence (user-reported bug class):** open an accordion, scroll the page (top→bottom→top), assert the row remains expanded with its detail visible — in both engines. Any state held in component-remountable memory that scroll-triggered re-renders can drop must surface here.
  - **Zero console errors** on every surface and during every interaction (expansion, selection, pagination, search, bulk-action dialogs).
  - Interaction-state captures: selecting across pages then screenshotting the tray (the exact cross-page rendering path), searching with results and with no matches, expanded orphaned feature (inert controls visible).
- **Auth — FULLY AUTONOMOUS (user-mandated: no human participation)**: `globalSetup` seeds a dedicated `ZZ-e2e-` super_admin user directly via the staging `DATABASE_URL` from `.env.local` (bcryptjs-hashed, randomly generated password — the suite knows it; never a real account or credential). The suite logs in through the real UI and performs the reauth flow when `withAdminControl` requires it. Teardown deletes the E2E user and all `ZZ-e2e-` data. The protected-owner binding (`ADMIN_OWNER_ID`/`protectedOwner`) is NOT used — the E2E user is a separate super_admin, which the existing actor checks permit. Study `src/lib/admin/actor.ts` (`readActor`) to confirm the seeded user passes (role, emailVerified, not suspended/deleting/demo) and `src/lib/admin/reauth.ts` for the reauth flow.
- **Screenshot baselines — no human approval step**: the first run generates baselines and COMMITS them (`tests/integration/artifacts/` with per-engine snapshot dirs); every subsequent run compares via `toHaveScreenshot()` and fails on visual drift. Humans may glance at artifacts at any time but are never required to.
- **Test data**: create entities with a `ZZ-e2e-` prefix; clean up in afterEach/afterAll (plans with no subscriptions are deletable by design). Never touch non-prefixed data.
- **Per surface** (plans, features, matrix-in-editor, subscriptions): page renders with no console errors and no failed network requests above warnings; key elements present (search input, pagination controls, selection counter); keyboard operability (tab to and activate a control); **screenshot per surface** written to `tests/integration/artifacts/<surface>-<viewport>.png`, desktop + mobile viewports.
- **Behavior assertions**: search filters the list; pagination advances and preserves selection (counter unchanged); matrix save round-trips the full enabled set across a page boundary; user search by name and email both return the seeded test user; every mutation produced an audit entry (query via the existing staging-check script pattern if needed).
- `npm run test:integration` is the entry; unit suite (`npm test`) must remain untouched and green.

- [ ] **Step 1: Scaffold + failing smoke** — config + one failing spec asserting the plans page renders its search input (it doesn't exist yet → RED is the UI work's gate, so if Tasks 3–5 have landed this passes immediately; in that case record the flip as evidence).
- [ ] **Step 2: Implement** fixtures (auth, prefix lifecycle), the three spec files, screenshot capture.
- [ ] **Step 3: Run** `npx playwright test` — all green; artifacts present; **no leftover `ZZ-e2e-` rows** (assert cleanup).
- [ ] **Step 4: Full checks** (`npm test` unchanged) + commit `feat: playwright integration suite for creator surfaces`.
- [ ] **Step 5: Report includes the artifact paths** so the human can review the screenshots.
