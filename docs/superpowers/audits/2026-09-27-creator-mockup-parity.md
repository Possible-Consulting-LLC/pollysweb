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
- Screenshot baselines: untouched here — the Task 6 finale re-captures after all visual changes land (controller-sequenced).
