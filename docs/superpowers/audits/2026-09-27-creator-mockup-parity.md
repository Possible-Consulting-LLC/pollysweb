# Creator Mockup-Parity Ledger — 2026-09-27

Standing record for the creator-ux-consolidation slice (UX Task 8). Binding spec: the six approved mockups in `.superpowers/sdd/2026-09-26-plan-creator/`. Method: five independent read-only audits (one mockup × one surface each), every interaction verdicted MIRROR / DIVERGES / RATIFIED with file:line evidence on both sides. Full per-surface reports: `audit-selection-list.md`, `audit-plans.md`, `audit-features.md`, `audit-subscriptions.md`, `audit-user-picker.md` (same directory as the Task 8 sdd work: `.superpowers/sdd/2026-09-27-creator-ux-consolidation/`).

**Tally: 88 MIRROR · 34 DIVERGES · 8 RATIFIED.**

## Product-owner rulings (binding, override shipped behavior)

1. **NO suggestion dropdown anywhere.** Typing in a search input narrows the RENDERED LIST to matches in real time (server query spans all rows). Ruled 2026-09-27 after live review; supersedes the popup interpretation of Task 7's "suggestions render in place".
2. **Tray chips / picked-item displays show the item's display title, never a raw id/key.**
3. Live match counts must be truthful while typing (counters reflect the narrowed set, not the stale committed total).

## Ratified deviations (with rationale)

- `--rose` as semantic destructive/danger color (theme-token consistency over literal mockup palette).
- Single-mode picker rows as raw `<button>` elements (documented `selection-list.tsx:139-144`): mockup row anatomy wins over ui/button variant chrome.
- Tray: plum collapse toggle + gold-highlighted chips (plan line 199).
- Bulk-action confirmation uses the app's dialog pattern instead of the mockup's alert-flow (subscriptions End).

## DIVERGES → disposition

### Search & shared machinery (ruling violations + component contract)
| # | Finding | Evidence | Disposition |
|---|---|---|---|
| S1 | Typing does not narrow the rendered list in real time (accordions + subscriptions list) | features-accordion.tsx:128-132, plans-accordion.tsx:103-107, subscriptions/page.tsx:155-166 | FIX — headless narrowing everywhere; live query returns matched rows + truthful total; pagination over matches; page resets on new query; Enter fallback stays as the explicit soft-nav |
| S2 | Popup dropdown listbox exists in LiveSearch (and is the accordion default) | live-search.tsx:9-13,57,170-213 | FIX — retire the popup mode entirely; no dropdown by construction |
| S3 | Pick path drops display title → tray shows raw id/key for off-page picks | features-accordion.tsx:131,233-236; plans-accordion.tsx:106,189-193 | FIX — forward full suggestion {id,title,subtitle}; checkbox path keeps row lookup |
| S4 | Counter stale during live narrowing (wizard pickers) | assign-plan-wizard.tsx:169-171,210-212 | FIX — live match count while typing |
| S5 | Counter text morphs to "N matching the search" instead of mockup's "N of M selected" | features-accordion.tsx:133-137 | FIX — counter stays in mockup format |
| S6 | `searchSlot` contract invites a popup combobox | selection-list.tsx:55-57,197 | FIX — contract retargeted to headless narrowing |
| S7 | "Selected only" is a Button and dumps all selected rows unpaged with toolbar/pager hidden; mockup pages the narrowed set with toolbar live | selection-list.tsx:120-128,195,247-271 | FIX — selected-only = paginated filter over the same toolbar/pager list; checkbox affordance per mockup (INT:82) |
| S8 | Multi-mode rows toggle only via the 16px checkbox; mockup rows click-to-toggle | selection-list.tsx:173-183 | FIX — whole row toggles (checkbox stays, no double-fire) |
| S9 | No footer slot for the host's primary action ("Save matrix" in mockup footer; left slot repurposed for toggle-all) | selection-list.tsx:235-272 | FIX — footer action slot; matrix surface passes Save |
| S10 | Toggle-all is a shipped-only addition absent from both mockups | selection-list.tsx:236-246 | KEEP + RESTYLE (default ruling pending owner veto) — bulk-selection aid aligned with the owner's bulk-workflow rulings; styled per mockup footer |
| S11 | Default search input lacks placeholder; empty state doesn't echo the query | selection-list.tsx:82,198-203 | FIX — mockup placeholder; `Nothing matches "q"` |
| S12 | Pager footer renders on single-page lists; mockup hides it | selection-list.tsx:235,247-271 | FIX — hide when totalPages ≤ 1 |

### Plans surface
| # | Finding | Evidence | Disposition |
|---|---|---|---|
| P1 | Row meta omits prices shown in every mockup row | plans-accordion.tsx:163-167 | FIX if billing data renders a price summary; escalate if the model lacks price data |
| P2 | Extra detail actions beyond the mockup ("Delete or deactivate", "Move up/down") | plans-accordion.tsx:79-87 | KEEP + RESTYLE (default ruling pending owner veto) — parent-slice-approved functionality; presentation per mockup detail card |
| P3 | "Create a plan" link vs mockup "＋ New plan" btn-sm primary in head row | page.tsx:32 | FIX |
| P4 | "Sorted by display order" footer note missing | page.tsx:40-48 | FIX |
| P5 | Last-updated ISO date vs mockup human dates ("2h ago", "Sep 12") | plans-accordion.tsx:71,166 | FIX — small formatter |

### Features surface
| # | Finding | Evidence | Disposition |
|---|---|---|---|
| F1 | Per-row category badge omitted | features-accordion.tsx:179-184 | FIX |
| F2 | Badge wording "Not released" vs mockup "Coming soon"; orphan as separate badge vs key-line suffix | features-accordion.tsx:180-183 | FIX |
| F3 | Detail split into three titled cards vs mockup's single "Detail" card | features-accordion.tsx:69-115 | FIX — consolidate into one kv-grid card |
| F4 | "Grouped by category · sorted by key" footer note missing | page | FIX |
| F5 | Header "Feature catalog" + stat paragraph vs mockup "Features" | page | FIX |
| F6 | Registry sync as explanatory card vs mockup header button | page.tsx:84-93 | FIX — header button; explanation lives in its confirm flow |

### User-picker / wizard surface
| # | Finding | Evidence | Disposition |
|---|---|---|---|
| U1 | Focused view drops the avatar glyph | selection-list.tsx:103-109 | FIX |
| U2 | Picker rows lack the leading initials avatar (`PickerData.rows` can't carry `leading`) | assign-plan-wizard.tsx:19-20 | FIX — row type carries `leading` |
| U3 | Row meta badges (Valid / deleting / Selected) absent | selection-list.tsx:163-169 | FIX — badge slot in row anatomy |
| U4 | Deleting accounts not greyed/unselectable | assign-plan-wizard.tsx:19-20,176-185 | FIX — `disabled` flag wired |
| U5 | Effective-date field: empty `datetime-local` vs mockup prefilled `type="date"` | assign-plan-wizard.tsx:251-254 | FIX |

## Fix sequencing

- **Fix round 1 (shared machinery + component):** S1–S12 (selection-list.tsx, selection-tray.tsx, live-search.tsx, feature-matrix save slot, suggest endpoint rows+total, wizard counter). TDD.
- **Fix round 2 (surfaces + wrap-up):** P1–P5, F1–F6, U1–U5, ledger status updates, `suggest.test.ts` trailing newline (Task 7 re-review nit), full suite + tsc + lint.
- **Task 9 — plan-builder modernization (owner directive, added 2026-09-27):** implement mockup #7 (`.superpowers/sdd/2026-09-26-plan-creator/plan-builder-page-mockup.html`) across the plan-builder page + matrix section; see the plan's Task 9 section. AFTER round 2 (shared files), BEFORE the finale.
- Screenshot baselines: untouched here — the Task 6 finale re-captures after ALL visual changes land (now including Task 9's), so pixel changes are captured once (controller-sequenced).

## Task 9 amendments (owner-ratified 2026-09-27)

- **Plan-detail page retired** (owner yes): accordion detail card IS the plan view; billing Activate/Deactivate moves into the builder (mockup #7 already shows the affordance); "View plan" → `/admin/plans?open=<id>` deep link; inbound links to `/admin/plans/[id]` repointed at implementation; page removed (its hardcoded emerald badge goes with it).
- **Select All / Select None** added to the plan builder's features toolbar (owner request; mockup #7 amended — buttons act on the whole registry, orphans excluded, tray/counter/pricing follow). Builder-scoped; the shared component's S10 toggle-all keep+restyle default on list pages is unchanged and still veto-able.
- **Single-selection auto-advance** (owner ruling 2026-09-27: "if I click Rebecca it should move forward"): in any single-selection flow, picking the item advances to the next step immediately — never a required confirmation click after an unambiguous single pick. User-picker mockup #6 AMENDED: step 1 keeper pick → step 2, step 2 plan pick → step 3 (the Continue buttons remain only as the reconsideration path when navigating back with a selection held; step 3 keeps its explicit Assign — it is the commit point, not a navigation). The shipped wizard's two-click flow therefore becomes a DIVERGES fixed in round 2's U chunk (U6): `onRowSelect` navigates directly to the next step with the selection set; the context bar keeps the Change affordance for corrections.
- **S13 — Narrowed rows are full citizens** (owner ruling 2026-09-27: "the edit pages should be in place in the accordion search", clarified: narrowed rows expand + edit in place — the separate builder page STAYS as the edit destination; owner-confirmed live: "in Features when you type a search it does narrow the view but it doesn't keep the flags associated with it — you can't expand the narrowed view" — the flags (category/release badges, selected states) and the expansion must SURVIVE narrowing; that is this item): a matched row in the narrowed view must expand in place to its detail card — same kv content, same badges, same edit affordances — without pressing Enter or navigating. Design: the narrowing endpoint returns DETAIL-RICH rows for the `features` and `plans` entities (the committed pages' own row shapes — features incl. orphan/assignedPlans/totalPlans, plans incl. billingOptions + counts; `users`/`assignable-plans` stay lean for the pickers), one grouped query per debounced pause page-clamped like the committed page's own pattern; accordions render narrowed rows through the SAME row renderer as committed rows; expanding a narrowed row is CLIENT-SIDE within the narrowed view (the URL still reflects the committed search until Enter — mockup-exact instant expand); the orphan lock (1b) applies unchanged to narrowed detail cards (inert fieldset). - **S13d — SEARCH BOX HIDDEN WHEN LIST < ONE PAGE** (owner ruling: "we also shouldn't show a search box when there's only a few options — less than a page worth" + "but also the Select all / Select None should still show"): when the committed total is less than the page size, the search input does not render on every list surface (SelectionList default + searchSlot path, both accordions, wizard pickers, subscriptions list); Select all/None STAY; the pager is already hidden (S12). VISIBILITY KEYS ON THE COMMITTED COUNT, never the narrowed match count (a narrowed total must never strand a live query mid-typing); hiding never clears a URL-owned committed search (a Clear affordance stays — IMPLEMENTED on the subscriptions list; the accordions/wizard gain theirs in the FINALE pass, Review B's Low finding). Shipped: SelectionList `listSize` prop; matrix/features unaffected in practice (34 > 20); plans accordion + wizard pickers hide (real catalogs below page size); wizard step-3 options paginate at 20 so small option sets fold the toolbar. REVIEWER NOTE: the Task 6 Playwright specs drive the wizard keeper search + subscriptions list search — below-page catalogs now hide those inputs; the finale's pass must verify the integration specs seed above-page catalogs or update the specs.
- **Gating-phase design ADOPTED — read-time derivation (option B; owner: "B is pretty cool"**; C event-driven and D DB-triggers rejected — they touch/bypass the current system, ruled untouchable): when gating enforcement lands, effective entitlements resolve as: active new-system subscription → its plan's features; ELSE derive from `User.plan` tier → the legacy plan's feature set (zero drift — the source is the truth). BUILT AHEAD OF NEED: `src/lib/admin/legacy-entitlements.ts` (shared tier→legacy mapping = single source of truth, used by the backfill script too; `resolveEffectiveEntitlements` pure + tested; nothing calls it yet — flows adopt it at the gating phase). The backfill script is a REPEATABLE convergence task (`npm run db:legacy-sync`; applied 2026-09-27: 6/6 users on Free/Pro-Legacy, ted superseded; owner decisions: supersede uniformly, default monthly, features as designated, photo.upload excluded as orphaned).
- **Per-user cutover** (owner: "you should be able to duplicate or move it to real", clarified per-USER): admins can take a user's legacy state and MOVE it to real (assign a real plan — derivation ends) or DUPLICATE it (real sub created while legacy stays as fallback). OPEN DESIGN QUESTION (deferred to the task's design, owner answer pending): the exact duplicate-vs-move semantics under the resolver model — moving ends the tier-fallback (an explicit cut-over marker); duplicating keeps the fallback (a real sub ending restores legacy features). Bulk script remains for the whole population.
- **S13c — Select all / Select none on EVERY multi-select surface** (owner ruling 2026-09-27: "everywhere I can select more than 1 thing"; builder-scoped origin amended): the builder's features toolbar pair (mockup #7) generalizes to all multi-mode surfaces — the feature matrix, the Features accordion, the Plans accordion, and any other surface with checkbox/tray bulk selection. Single-mode pickers are excluded by the rule itself (you can only select one thing there). Semantics: Select all = every SELECTABLE row matching the current view across ALL pages (unselectable rows — orphaned features, deleting accounts, disabled — never join; the counter reflects the new total truthfully); Select none = clears the selection. Mechanical note for implementation: client islands only hold the current page's rows, so a true select-all needs the full matching id set — a lean ids-only query (one indexed select of id where matching) fired on click, not per keystroke; performance guard per the report's catalog rules. Placement per mockup #7: toolbar pair between search and the gold counter. SEQUENCING: small follow-up chunk after S13 lands (can't amend the in-flight brief), before the round-2 reviewer so it's covered in the same review pass.
- **S13a — Row-click behavior flag** (owner ruling, canonical form: "it depends — if the list is being used within plan add/edit etc then it selects; if it's being used as Features itself then it expands"; + "expanding should only work when turned on — in the case of user picker the user is selected not expanded"): the shared list contract gains a per-surface flag — `click: 'expand' | 'select'` — whose value follows the surface's PURPOSE. EXPANDING IS OPT-IN per surface; no list expands unless its surface turns it on. Standalone catalog surfaces (the Features page, the Plans page) set `expand` (row click opens the detail card; the checkbox selects for bulk). Lists embedded in an editing flow (the feature matrix inside plan add/edit, the wizard's user/plan pickers) set `select` — picker rows select on click (single mode: U6 auto-advance; multi mode: S8 toggle) and never expand. Owner verified live: the Features page expanding on row click is the `expand` mode correctly turned on.
- **S13b — Edit lives in the detail card** (owner ruling: "edit metadata should be in-place edit of that detail whether it's a Feature, Plan, User, etc" + "you have to click the edit in the details page and then it gets 1"): every detail card renders READ-ONLY detail plus an **Edit** affordance; clicking Edit turns the card into the in-place editor (entity-appropriate fields — plan: name/description/type/max spoods/active/public; feature: name/category/description) with Save/Cancel, no navigation. The plan builder page REMAINS as the full editor for the feature matrix + billing options + pricing preview, reached from the card's edit flow ("Full editor"). Same pattern for any future entity. OWNER CLARIFICATION (2026-09-27): expanding a row NEVER shows the form immediately — features' shipped form-on-expand is the pre-S13 behavior this ruling REPLACES; every surface gets read-on-expand + Edit-gated form (features included), per the amended mockups (click Edit → editor appears). Plans gain in-place editing; the builder is never replaced by in-place editing of the full matrix.
