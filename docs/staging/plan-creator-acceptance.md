# Plan Creator — Staging Acceptance Record

Date: 2026-09-26
Branch: `codex/plan-creator` (head `5b2b521` at time of migration)

## 1. Migration record (Step 1 — complete)

Applied via the repo's restricted staging workflow (`node scripts/staging-db.mjs deploy`, which asserts `SPOODLY_ENV=staging` and validates the target through `src/lib/staging-guard.ts` before invoking Prisma).

- **Staging project:** `nfdecdylxcmuypxodppe` (Spoodly Space Staging, free organization `rcvehdgkpbdlnqydjycu`)
- **Pre-deploy status:** exactly 4 pending migrations of 22 found
- **Migrations applied (in order):**
  1. `20260926100000_feature_catalog`
  2. `20260926110000_plan_catalog`
  3. `20260926120000_plan_features`
  4. `20260926130000_plan_subscriptions`
- **Result:** "All migrations have been successfully applied." Follow-up `status` run: "Database schema is up to date!" — four new tables, zero modified tables.
- **Production isolation:** the staging guard hard-fails unless the environment identifies project `nfdecdylxcmuypxodppe`. The production project (`jfutawxwjqekerugbqzt`, org Spoodly Space Pro) was never connected to, and no production settings, data, or deployments were touched. No credentials are recorded in this document.

## 2. Human walkthrough checklist (Steps 2–3 — pending user)

> **Status: ⏳ PENDING USER WALKTHROUGH** — the steps below are browser actions reserved for the super admin (you). Nothing below has been performed yet. Record outcomes in the checkboxes as you go.

### Step 2 — Create the public catalog through the creator (no seed)

1. [ ] On `/admin/features`, sync the feature registry. Confirm the released features appear and the report matches expectations (counts, orphans handled).
2. [ ] On `/admin/plans`, create and publish:
   - **Free** — $0, 1 spood, public, STANDARD.
   - **Basic** — $1.99 monthly / $19.99 annual, 5 spoods, public, STANDARD.
   - **Pro** — $4.99 monthly / $49.99 annual, unlimited spoods, public, STANDARD.
3. [ ] Assign each plan's initial feature set via the feature matrix:
   - **Free** = the essential set per spec.
   - **Pro** = every released feature active and enabled.
   - **Basic** = configured at your discretion in the creator (spec leaves this to admin choice).

No seed script is used — the creator is the catalog's only author.

### Step 3 — Acceptance walkthrough against the spec's criteria

Plan surfaces:

4. [ ] `/admin/plans`: list, edit, duplicate, reorder, activate, and confirm the plan appears on the public pricing surface.
5. [ ] Feature catalog on `/admin/features`: release toggles behave (persist across reload).
6. [ ] Feature matrix on each plan editor: save succeeds; removing an assigned feature shows the removal warning before applying.
7. [ ] `/admin/subscriptions`: assign a plan to a test user; observe subscriber counts update.
8. [ ] `/admin/audit`: an audit entry exists for every mutation made above (sync, plan create/edit/duplicate/reorder/activate, matrix saves, subscription assignment).

Quality bar:

9. [ ] Keyboard operability: every new admin page (plans list/editor, features, matrix, subscriptions) is fully operable by keyboard.
10. [ ] Themes: the new pages render correctly in both light and dark themes.
11. [ ] Regression check: existing product pages behave identically to before this slice (spot-check the user-facing flows).

## 3. Final verification (Step 4 — complete)

Run at branch head `5b2b521` with the four migrations applied locally (test runs are local; they do not touch staging data):

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npm test` | ✅ 815/815 passed, 0 failed, 0 skipped |
| Lint | `npm run lint` | ✅ 0 errors, 43 pre-existing warnings (exit 0) |
| Types | `npx tsc --noEmit` | ✅ clean (exit 0) |
| Migration status (staging) | `node scripts/staging-db.mjs status` | ✅ up to date |
