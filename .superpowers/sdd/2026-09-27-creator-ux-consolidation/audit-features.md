# Audit — Features catalog page (mockup parity)

Mockup: `.superpowers/sdd/2026-09-26-plan-creator/features-page-mockup.html` (read fully incl. JS)
Shipped: `src/components/admin/features-accordion.tsx`, `src/app/admin/features/page.tsx`
Shared components inspected where a verdict required it: `src/components/admin/live-search.tsx`, `src/components/admin/selection-tray.tsx`, `src/components/admin/list-shared.ts`.

Binding rulings applied: (R1) typing must narrow the RENDERED LIST in real time, no suggestion dropdown anywhere; (R2) tray chips show display title, never a raw id.
Ratified: --rose semantic danger; raw-button single-mode picker rows; tray plum toggle + gold-highlighted chips.

| verdict | interaction / visual | mockup evidence | shipped evidence | note |
|---|---|---|---|---|
| **DIVERGES (R1)** | Typing narrows the rendered list in real time | features-page-mockup.html:156-163, 259 — `input` event filters FEATURES and re-renders the list | features-accordion.tsx:128-132 + live-search.tsx:57,245-263 — typing only fires a debounced suggestion fetch; the list narrows solely via the Enter fallback (features-accordion.tsx:55, 239 `router.push`) | Plain typing never touches the rendered list; server query is correct (page.tsx:25-30) but not applied live |
| **DIVERGES (R1)** | No suggestion dropdown anywhere | mockup has none — typing filters rows in place | live-search.tsx:173-211 — popup `role="listbox"` dropdown rendered under the input (accordion uses `mode="popup"`, features-accordion.tsx:128) | Explicit ruling: a dropdown = DIVERGES |
| MIRROR | Search queries span all rows (name + key), server-side | mockup.html:156-163 (filter on `t` and `id`) | page.tsx:25-30 (`OR name/key contains, insensitive`), count at page.tsx:36 | |
| MIRROR | Search input look & placeholder | mockup.html:28-29, 89 (44px, lavender border, "Search features…") | live-search.tsx:156 + features-accordion.tsx:128-129 (h-11 rounded-2xl, lavender-deep border, same placeholder) | |
| MIRROR | Counter chip styling (gold pill, panel text) | mockup.html:30 (gold bg, panel color, 999px) | list-shared.ts:16-17 `counterChipClass` + features-accordion.tsx:133 | |
| DIVERGES (minor) | Counter denominator / search wording | mockup.html:235 — always `N of 34 selected` (unfiltered) or `34 features` | features-accordion.tsx:133-137 — denominator is `total` (filtered, page.tsx:36) and idle state appends " matching the search" during a search | Arguably more honest, but not mockup parity |
| MIRROR | Tray hidden when selection empty | mockup.html:92, 236 (`hidden` at 0) | selection-tray.tsx:26 (`if (items.length === 0) return null`) | |
| MIRROR | Tray collapse toggle, plum, "▾ Selected (n)" | mockup.html:33, 94 | selection-tray.tsx:30-33 (plum bold, `▾/▸ Selected (n)`) | |
| RATIFIED | Tray chip colors | mockup.html:35-36 — hover ground, plum border, plum `×` | selection-tray.tsx:43,49 — gold border, gold `×` on hover ground | Gold-highlighted chips are a ratified deviation |
| **MIRROR (R2)** | Chip shows display title, not raw id | mockup.html:244 (`${f.t} ×`) | selection-tray.tsx:45 (`item.title`) + features-accordion.tsx:235 (`title: row?.name ?? key`, subtitle=key) | Title is always the feature name for toggled rows; key only as muted subtitle |
| MIRROR | Chip `×` deselects | mockup.html:253-258 | selection-tray.tsx:47-49 | |
| MIRROR | Bulk Release / Unrelease buttons in tray head | mockup.html:96-97 (btn-soft btn-sm) | features-accordion.tsx:141-151 (soft sm, "Release selected"/"Unrelease selected") | Label adds "selected" — trivial |
| MIRROR | Row checkboxes select for bulk; orphans disabled | mockup.html:188, 200-206 | features-accordion.tsx:165-168 (disabled={row.orphan}) | |
| MIRROR | Selection persists across pages/search | mockup.html:111 (hint), 153 (Set state) | features-accordion.tsx:194-200 (reducer never pruned; full-selection Map incl. off-page rows, features-accordion.tsx:47-49) | |
| MIRROR | Accordion: click row toggles, one open at a time | mockup.html:182, 207 (`state.open` single id) | features-accordion.tsx:158, 171 (URL-owned `openKey`, Link toggle) | Shipped adds URL/deep-link semantics — superset |
| MIRROR | Row anatomy: checkbox · chevron · name over mono key · right badges | mockup.html:187-199 | features-accordion.tsx:163-185 | Chevron glyph vs rotating icon (173-174) — equivalent |
| DIVERGES (minor) | Per-row category badge (lavender pill) | mockup.html:197 (`b-cat` badge on every row) | features-accordion.tsx:179-184 — only release + orphan badges; `badgeTintClass` exists (list-shared.ts:19-20) but is unused here | Shipped leans on group headers instead |
| DIVERGES (minor) | Release-state badge wording & orphan marking | mockup.html:198 ("Coming soon"), 193 (key line suffixed "— orphaned") | features-accordion.tsx:181-183 ("Not released" + separate "Orphaned" badge) | Same information, different labels/placement |
| MIRROR | Category group headers (plum, uppercase, tracking) | mockup.html:37, 176-180 | features-accordion.tsx:154-156 | Shipped capitalizes via `categoryLabel` (list-shared.ts:11-12) |
| MIRROR | Ordering: grouped by category, sorted by key | mockup.html:109 (footer note), ordered data 116-151 | page.tsx:33 (`orderBy category asc, key asc`) | |
| MIRROR | Orphaned rows greyed + all controls inert + explainer | mockup.html:53 (opacity .45), 188/226-227 (disabled), 221 (locked-state text) | features-accordion.tsx:160 (opacity-70), 88 (`fieldset disabled`), 114 (explainer copy) | |
| DIVERGES (minor) | Detail card structure | mockup.html:214-224 — ONE "Detail" card, single kv grid (Key/Description/Category/Release state/Plan assignments) | features-accordion.tsx:71-86 — THREE cards ("Identity"/"Release state"/"Plan assignments"), kv grid style mirrored (features-accordion.tsx:60-66) | Content parity; card split/titles differ |
| MIRROR | Per-detail Release/Unrelease toggle | mockup.html:226 (disabled when orphan) | features-accordion.tsx:90-95 (inside disabled fieldset for orphans) | Shipped `variant="primary"` vs mockup `btn-soft` |
| MIRROR | Edit metadata (name/description; key immutable) | mockup.html:227 — "Edit metadata" button, alert says name+description, key not renameable | features-accordion.tsx:96-111 — inline form (name/category/description, no key field) | Shipped realizes the alert as an inline form; adds editable category |
| MIRROR | Mutation feedback / audit trail | mockup.html:86, 96-97, 226-227 — alert() copy describing audits | features-accordion.tsx:90-111 via MutationForm server actions; super_admin + reauth gate page.tsx:19, 77 | Mockup's alert copy realized as real audited server actions |
| MIRROR | Pagination: Prev/Next, "N / M", disabled at bounds | mockup.html:104-108, 247-249 (PAGE_SIZE 10) | page.tsx:101-109 ("Page N of M", disabled buttons), clamp at page.tsx:41 | pageSize 20 vs 10 — trivial; shipped pager drops `open` (folds) vs mockup keeping it |
| DIVERGES (minor) | Footer note "Grouped by category · sorted by key" | mockup.html:109 | absent (no equivalent footer text) | |
| MIRROR | Empty state | mockup.html:173 ("Nothing matches …") | page.tsx:96-98 ("No features match this search.") + no-DB-yet variant | |
| DIVERGES (minor) | Page header | mockup.html:85 — "Features" h2 | page.tsx:76-82 — "Feature catalog" h2 + extended stat paragraph | Stat line is an honest-count addition, not in mockup |
| DIVERGES (minor) | Sync registry placement | mockup.html:86 — single primary btn-sm in the header row | page.tsx:84-93 — full explanatory card with primary button | Semantics mirror the mockup alert (new rows inactive, orphans untouched) |
| MIRROR | Super-admin gate | mockup.html:86 (alert: "Requires super admin") | page.tsx:19 (`requireAdminActor('super_admin')`) | |
| MIRROR | Theme-token colors (dual theme) | mockup.html:7-18 (cosmic/midnight token sets) | list-shared.ts:14-17 + features-accordion.tsx throughout (`var(--…)` only) | |
| n/a | Mockup pane theme-toggle button | mockup.html:81 | — | Mockup demo chrome, not part of the page surface |

## Counts

**MIRROR 20 · DIVERGES 9 · RATIFIED 1**

DIVERGES:
1. **(Ruling)** Typing does not narrow the rendered list in real time — it only opens suggestions; narrowing happens solely via the Enter fallback (features-accordion.tsx:128-132).
2. **(Ruling)** Suggestion dropdown popup renders under the search input (live-search.tsx:173-211) — ruling forbids any dropdown.
3. Counter during search uses the filtered denominator and adds " matching the search" instead of the mockup's unfiltered "N of 34" (features-accordion.tsx:133-137).
4. Per-row category badge omitted (mockup.html:197 vs features-accordion.tsx:179-184).
5. Badge wording: "Not released" vs mockup "Coming soon"; orphan shown as separate badge instead of key-line suffix (mockup.html:193,198).
6. Detail card split into three titled cards instead of the mockup's single "Detail" card (mockup.html:214-224).
7. Footer note "Grouped by category · sorted by key" missing.
8. Header title "Feature catalog" + added stat paragraph vs mockup "Features" (mockup.html:85).
9. Sync registry relocated from a header button into a full explanatory card (mockup.html:86 vs page.tsx:84-93).