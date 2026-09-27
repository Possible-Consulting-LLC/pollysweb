# Audit — shared selection list component (selection-list / selection-tray / list-shared)

Mockups: `selection-list-mockup-interactive.html` (INT), `selection-list-mockup.html` (ST).
Shipped: `src/components/admin/selection-list.tsx` (SL), `src/components/admin/selection-tray.tsx` (TR), `src/components/admin/list-shared.ts` (LS).
Interaction rulings (product owner) override shipped behavior; ratified deviations recorded as RATIFIED.

| Verdict | Interaction / visual | Mockup evidence | Shipped evidence | Note |
|---|---|---|---|---|
| MIRROR | Typing narrows the RENDERED LIST in real time (ruling) | INT:158-166 `filtered()` filters by title+id; INT:249 `input` → re-render; INT:180 slice of narrowed rows | SL:201 `onSearchChange`; host feature-matrix.tsx:87-88 reducer sets `search` + `page:1`, :112 `query` filters rows before pagination | Server/controlled query spans all rows; page resets to 1 on search (INT:249 ↔ feature-matrix.tsx:88) |
| DIVERGES | No suggestion dropdown/popup anywhere (ruling) | INT:158-166,249 — typing filters the list itself; no popup exists in either mockup | SL:55-57,197 — `searchSlot` documented as "the host renders a live-search there"; live-search is a popup combobox with a suggestions list (live-search.test.ts:92-93,101; plans-accordion.test.ts:255-259 `mode: 'popup'`) | DIVERGES BY RULING: the component's search contract invites the popup live-search. No host currently passes `searchSlot` (grep: 0 matches) and the default input path is dropdown-free, but the affordance exists by design and must go |
| MIRROR | Tray chips show display title, never a raw id (ruling) | INT:226 chip renders `${f.t} <b…>×</b>`; ST:80-86 "Log feeding ×" etc. | TR:42-46 renders `item.title` (+ optional subtitle); id only used as `key`/`data-tray-chip` | MIRROR BY RULING |
| MIRROR | Tray appears only when selection non-empty | INT:215 `tray.hidden = size===0`; ST:74-88 shown with 7 | SL:117-119 empty → no tray items; SL:212 conditional render; TR:26 `return null` | |
| MIRROR | Tray chip × removes item | INT:226 `<b title="Remove" data-id>×</b>`; INT:244-248 chips click → `toggle` | TR:47-49 button `aria-label="Deselect {title}"` → `onDeselect(item.id)` | |
| RATIFIED | Tray chip styling: gold border + gold × | INT:37-38 chip border plum-mix, × plum (`chip b { color:var(--plum) }`); ST:57-58 same | TR:43 `border-[var(--gold)]`; TR:49 × `text-[var(--gold)]` | RATIFIED: "Tray: plum collapse toggle + gold-highlighted chips" |
| MIRROR | Tray collapse toggle ▾/▸ "Selected (N)" | INT:219-220,253 toggle flips chip visibility + glyph; ST:76 | TR:30-33 button `${collapsed?'▸':'▾'} ${label} (${items.length})`, `aria-expanded`; TR:41 chips hidden when collapsed | Plum toggle matches mockup and is ratified besides |
| DIVERGES | "Selected only" filter affordance | INT:82,252 checkbox `<label class="only"><input type="checkbox"> Selected only</label>`; ST:77 | SL:121-128 a Button ("Selected only"/"Show all", ghost/gold variant) passed as tray `trailing` (SL:218) | Filter exists in both, but mockup's checkbox affordance became a button |
| DIVERGES | "Selected only" shows narrowed matches PAGED, toolbar stays | INT:160 filter applied inside `filtered()`, INT:176-180 paged normally, INT:252 page→1, pager remains live | SL:120 `visibleRows = selectedRows` (ALL selected rows, unpaged); SL:195 toolbar hidden when `selectedOnly`; SL:247-271 pager hidden when `selectedOnly` | Mockup pages over the narrowed set with search/toolbar intact; shipped swaps to an unpaged full dump and hides toolbar + pager |
| MIRROR | Counter "N of M selected" | INT:212 `${selected.size} of ${FEATURES.length} selected`; ST:71 "7 of 34 selected" | SL:205-208 `` `${selectedCount} of ${total} selected` `` | Both count against the full set, not the page |
| MIRROR | Gold counter chip styling | INT:30 gold bg, panel text, 999px pill, 12px bold | LS:16-17 `counterChipClass` gold bg / panel text / rounded-full / text-xs font-bold | Token-driven both themes |
| MIRROR | Search input geometry: 44px, lavender-deep border, input bg | INT:28 (and ST:27) `height:44px; border-radius:14px; border:var(--lavender-deep); background:var(--input); padding:0 14px` | SL:202 `h-11 min-w-0 flex-1 rounded-2xl border-[var(--lavender-deep)] bg-[var(--input)] px-3.5 text-sm` | h-11 = 44px; radius 16px vs mockup 14px (hairline diff) |
| DIVERGES | Search placeholder text | INT:75 `placeholder="Search features…"` + INT:29 placeholder styling; ST:70 | SL:198-203 no `placeholder` attribute on the default input | Minor; host could supply via searchSlot but none does |
| MIRROR | Multi-mode row anatomy: freestanding hover-tinted rounded rows | INT:40-44 row padding 9px/10px, radius 12, gap 10, hover tint, title 14/600, mono sub 11.5/.55; ST:31-35 | SL:173-175 `rounded-xl px-2.5 py-2 hover:bg-[var(--hover)]`, gap-2.5; SL:184-189 title text-sm semibold, mono sub 11px .55 | No enclosing card grid in either. Checkbox 18px mockup (INT:42) vs 16px shipped (SL:182) — hairline diff |
| DIVERGES | Whole-row click toggles (multi mode) | INT:40 `cursor:pointer` + INT:237-243 delegation: any click on the row toggles; ST:91-103 rows are `<label>` wrapping the checkbox | SL:173-191 `<li>` is inert — no onClick, no cursor-pointer; only the checkbox input (SL:176-183) toggles | Mockup makes the full row a click target; shipped requires hitting the 16px checkbox |
| MIRROR | Selected row title turns plum | INT:45 `.row.selected .t { color:var(--plum) }`; ST:36 | SL:185-186 `row.selected && 'text-[var(--plum)]'` | |
| MIRROR | Disabled/orphan rows inert | INT:46 opacity .45 + not-allowed; INT:130,203 disabled flag → disabled checkbox; ST:37,102 | SL:175 `cursor-not-allowed opacity-45`; SL:179 `disabled={row.disabled}` | |
| MIRROR | Group headers: 11px bold uppercase plum | INT:39; INT:190-196 header per group change; ST:30,90,97,101 | SL:224-231 `h4 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--plum)] mb-1 mt-3.5` | Minor: mockup suppresses headers in Selected-only (INT:191); shipped still renders them (SL:129-136) |
| MIRROR | Pager: ‹ Prev / pageinfo / Next › with disabled ends | INT:230-233 `pageinfo` "1 / 4", prev/next disabled at bounds; ST:107-109 | SL:249-269 Prev/Next Buttons with `disabled={page<=1}` / `>= totalPages`, label `Page {page} of {totalPages}` (SL:258-260) | Wording expanded ("1 / 4" → "Page 1 of 4") — cosmetic |
| DIVERGES | Footer layout incl. primary "Save matrix" | INT:89-96 pager left + `btn-primary` "Save matrix" right; ST:105-112 same | SL:235-272 footer = toggle-all left + pager right; no save control in the component | Save is host-owned by design, but the mockup's footer pairing is not reproduced here and the left slot was repurposed |
| DIVERGES | Toggle-all control | Not present in either mockup | SL:236-246 "Toggle all on page" secondary button (when `onToggleAll` given) | Shipped-only addition occupying the mockup's save slot |
| MIRROR | Keyboard: Tab reachable, Space toggles | INT:101 kbd hint Tab+Space; ST:114,169 same | SL:176-183 native checkbox (Tab-focusable, Space toggles); TR:30 real button; SL:145-150 real buttons in single mode | Semantics preserved |
| DIVERGES | Empty state message | INT:183-188 `` `Nothing matches "${state.search}".` `` — echoes the query | SL:82 default `emptyLabel='Nothing matches yet.'` rendered at SL:221; host passes "No features match this search." (feature-matrix.tsx:142) | Neither interpolates the current query as the interactive mockup does |
| MIRROR | Theme-token colors (cosmic + midnight) | INT:7-18 / ST:7-18 token sets (--plum, --gold, --lavender-deep, --hover, --card, --input, --panel) | SL:202,206,101,174 etc. and LS:16-25 all consume `var(--*)` tokens | Both themes by construction |
| RATIFIED | Single-mode picker rows as raw `<button>` | Not exhibited in these mockups (single mode has no mockup in this surface's scope) | SL:139-156 raw row-styled `<button aria-pressed>`; rationale documented SL:139-144 | RATIFIED per owner list (deliberate, documented) |
| N/A | Single-mode fold-to-focused-view + "Change" affordance | Not exhibited in the named mockups — no mockup evidence on this surface | SL:94-114 focused view with plum title + `Change` ghost Button unfolding the list | No mockup to verdict against; flagged for the owner, not counted |
| N/A | Toggle-all / search reset page semantics when parent-driven | INT:249 search resets page (covered above) | Parent-owned via reducer (feature-matrix.tsx:87-88) | Covered in row 1 |

## Counts

- **MIRROR: 14**
- **DIVERGES: 8**
- **RATIFIED: 2**
- N/A (no mockup evidence): 2

### DIVERGES one-liners
1. **Search popup contract** — `searchSlot` is designed for the popup live-search combobox (suggestions dropdown), forbidden by ruling (SL:55-57,197).
2. **"Selected only" affordance** — mockup checkbox became a Button (INT:82 vs SL:121-128).
3. **Selected-only view** — shows ALL selected rows unpaged and hides toolbar + pager; mockup pages over the narrowed set with toolbar live (INT:160,176-180 vs SL:120,195,247).
4. **Search placeholder missing** — default input has no placeholder (INT:75 vs SL:198-203).
5. **Whole-row click-to-toggle absent** — multi-mode `<li>` is inert; only the checkbox toggles (INT:237-243 vs SL:173-183).
6. **Footer save/pager pairing** — no "Save matrix" in the component; left slot repurposed (INT:89-96 vs SL:235-272).
7. **Toggle-all is a shipped-only addition** — not in any mockup (SL:236-246).
8. **Empty state doesn't echo the query** — "Nothing matches yet." vs `Nothing matches "…"` (INT:183-188 vs SL:82).