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
- Rows clickable → `/admin/plans/[id]` (view/edit). Uniform `ui/button` controls (create/duplicate/reorder).
- `validatePlanInput`: description may be empty (stored as empty string).
- Duplicate/delete flows keep working on the paginated surface.

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
- Picker: search → paginated selectable list → selection persists across pages → confirm advances to plan step (plan picker also paginated/searchable via `SelectionList`) → billing options filtered to the chosen plan → effective date (default now) → assign.
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
- **Auth**: super-admin login from env (`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — never committed); perform the reauth flow when required. Study `docs/staging/admin-acceptance.md`, `docs/staging/beta-care-navigation-smoke-test-2026-09-23.md`, and `src/lib/admin/test-session-store.ts` first — if the repo's established pattern for browser verification differs, follow it and say so in the report.
- **Test data**: create entities with a `ZZ-e2e-` prefix; clean up in afterEach/afterAll (plans with no subscriptions are deletable by design). Never touch non-prefixed data.
- **Per surface** (plans, features, matrix-in-editor, subscriptions): page renders with no console errors and no failed network requests above warnings; key elements present (search input, pagination controls, selection counter); keyboard operability (tab to and activate a control); **screenshot per surface** written to `tests/integration/artifacts/<surface>-<viewport>.png`, desktop + mobile viewports.
- **Behavior assertions**: search filters the list; pagination advances and preserves selection (counter unchanged); matrix save round-trips the full enabled set across a page boundary; user search by name and email both return the seeded test user; every mutation produced an audit entry (query via the existing staging-check script pattern if needed).
- `npm run test:integration` is the entry; unit suite (`npm test`) must remain untouched and green.

- [ ] **Step 1: Scaffold + failing smoke** — config + one failing spec asserting the plans page renders its search input (it doesn't exist yet → RED is the UI work's gate, so if Tasks 3–5 have landed this passes immediately; in that case record the flip as evidence).
- [ ] **Step 2: Implement** fixtures (auth, prefix lifecycle), the three spec files, screenshot capture.
- [ ] **Step 3: Run** `npx playwright test` — all green; artifacts present; **no leftover `ZZ-e2e-` rows** (assert cleanup).
- [ ] **Step 4: Full checks** (`npm test` unchanged) + commit `feat: playwright integration suite for creator surfaces`.
- [ ] **Step 5: Report includes the artifact paths** so the human can review the screenshots.
