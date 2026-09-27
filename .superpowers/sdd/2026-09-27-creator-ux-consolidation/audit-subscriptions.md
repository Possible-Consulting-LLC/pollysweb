# Subscriptions page audit

## Rulings
- Ruling 1 (real-time rendered-list narrowing, no dropdown): wizard pickers MIRROR via headless LiveSearch (in-place list, no popup); the main subscriptions list search DIVERGES — it is a form-submit search (page.tsx:155-166), typing does not narrow the rendered list in real time.
- Ruling 2 (tray chips show display title): no tray on this surface — N/A.
- Wizard picker counter during live typing shows the committed total, not the live match count (assign-plan-wizard.tsx:169-171 vs live rows at 176-179; mockup updates the counter per keystroke, mockup:260) — DIVERGES.

## Verdicts
- MIRROR | List-first layout: wizard unfolds above an always-rendered "Current subscriptions" list | mockup:172-189 (divider + list always on top, hint line 189) | page.tsx:142-153 (header, wizard, then section with h3 "Current subscriptions") | layout parity.
- MIRROR | ＋ Add subscription opens wizard (URL-owned) | mockup:372-377 | page.tsx:146-147 (`wizard: 'open', step: '1'`) | unfold + scroll behavior approximated by URL navigation.
- MIRROR | 3-step wizard with step pills (1 User → 2 Plan → 3 Options), done/current styling | mockup:107-111, 362-370 | assign-plan-wizard.tsx:70, 132-143 | pill classes match (plum current, lavender done, hover+opacity upcoming).
- MIRROR | Step-1 keeper search narrows rendered list in real time (server-spans-all-rows query), no dropdown | mockup:249-264, 379 | assign-plan-wizard.tsx:165-188 (LiveSearch mode="headless", suggestions rendered in place by renderSuggestions, no listbox popup) | MIRROR per Ruling 1; debounce 250ms is a reasonable real-time implementation.
- MIRROR | Step-2 plan search narrows rendered list in place, no dropdown | mockup:266-280, 385 | assign-plan-wizard.tsx:206-227 | headless, no popup.
- MIRROR | No suggestion dropdown/popup anywhere on the surface | mockup has none | live-search.tsx:159-168 (headless renders in-flow), popup path (170-213) not used here | MIRROR per Ruling 1.
- DIVERGES | Main list search narrows the RENDERED LIST to matches in real time while typing | mockup:407 + 307-337 (input event → immediate re-render of slist, counter, pager) | page.tsx:155-166 (GET form + explicit Search submit button; nothing happens until submit) | DIVERGES by Ruling 1.
- DIVERGES | Picker counter reflects live match count while typing | mockup:260 (`${rows.length} keeper(s)` recomputed on every keystroke) | assign-plan-wizard.tsx:169-171 (`userPicker.total` — committed URL total; live suggestion count only drives rows, not the chip) | chip lags the typed query until fallback submit.
- MIRROR | Counter chip shows "N keepers/plans" / "N effective" with singular/plural | mockup:122, 149, 178, 260, 270, 333 | assign-plan-wizard.tsx:169-171, 210-212; page.tsx:150 | gold chip styling via counterChipClass.
- MIRROR | Pagination: Prev/Next + "1 / 2" page info, disabled at bounds | mockup:126-130, 181-188, 313-336 | page.tsx:207-217; wizard pickers via SelectionList onPageChange (184-185, 223-224) | server page + clamp (page.tsx:42-51).
- MIRROR | Empty states with the typed query echoed | mockup:258, 317 | page.tsx:167-170; assign-plan-wizard.tsx:181, 220 | phrasing slightly differs ("match this search" vs `match "query"`), substance matches.
- MIRROR | Row anatomy: avatar initials, name, email, plan · option, since/renews | mockup:322-325 | page.tsx:174-195 | status line "since X · renews/ends" parity.
- MIRROR | Status badges: ACTIVE/TRIALING on-style, PAST_DUE off-style, human labels ("past due" not "PAST_DUE") | mockup:326 (`st.replace("_"," ")`, b-act/b-exp) | page.tsx:18-22, 189-191 | fallback raw status for unknown statuses is a safe superset.
- MIRROR | Row actions: Reassign (opens wizard with keeper preselected, step 2) and End | mockup:328-329, 396-404 | page.tsx:197-203 (Reassign link `step: '2', user: row.userId`; End via MutationForm) | parity.
- MIRROR | End semantics: status → CANCELED with expiry, audited, row-locked | mockup:405 (alert text), 189 (hint) | actions.ts:58-72; plan-assignment.ts:170 (endSubscription cancels with expiry + audit) | MIRROR.
- RATIFIED | End/assign feedback via dialog pattern instead of mockup's alert() | mockup:391, 405 (alert()) | page.tsx:200-203 MutationForm; wizard error inline assign-plan-wizard.tsx:263-264 | RATIFIED — app dialog pattern replaces mockup alert-flow (ratified deviation).
- MIRROR | Toolbar layout: search input + counter chip on one row; list below; footer pager | mockup:32-35, 120-123, 176-179 | live-search.tsx:162-165 (input + toolbarEnd chip), page.tsx:155-166, 207-217 | parity.
- MIRROR | Theme tokens: lavender input border, plum primary, gold counter, lavender avatar | mockup:33-35, 44 | page.tsx:160, 177; assign-plan-wizard.tsx:103, 137-139 | MIRROR; `text-rose-700` on assign error (assign-plan-wizard.tsx:264) falls under the ratified --rose destructive ruling.
- MIRROR | Wizard summary block (Assigning/To/Effective/Execution audited row-locked transaction) | mockup:296-305 | assign-plan-wizard.tsx:256-262 | verbatim parity.
- MIRROR | Context bar "Assigning to" with avatar + change control, shown from step 2 | mockup:113-116, 345-360 | assign-plan-wizard.tsx:144-156 | MIRROR.
- MIRROR | Focused selected-keeper view with change/back path | mockup:133-139, 243-247 | assign-plan-wizard.tsx:158-164 | MIRROR.
- MIRROR | Continue/Back buttons disabled until selection | mockup:339-343 | assign-plan-wizard.tsx:189-194, 228-235, 265-271 | MIRROR.
- MIRROR | Effective date input + summary live-update | mockup:160, 388 | assign-plan-wizard.tsx:251-255, 260 | datetime-local vs date is a superset; defaults-to-now documented.
- MIRROR | Option rows with interval title, renewal subtitle, price right-aligned | mockup:282-294 | assign-plan-wizard.tsx:120-123, 240-246 | MIRROR.

## Counts
- MIRROR: 20
- DIVERGES: 3
- RATIFIED: 1
- N/A: 1 (no tray on this surface)
